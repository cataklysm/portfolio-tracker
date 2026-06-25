"use server"
import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { apiFetch, problemDetail } from "@/lib/api"
import type { InstrumentWithListings } from "@/lib/types"

function transactionBody(formData: FormData) {
  const dateOnly = formData.get("effective_at") as string
  return {
    side: (formData.get("side") as string) || "buy",
    quantity: formData.get("quantity") as string,
    price: formData.get("price") as string,
    fee: (formData.get("fee") as string) || "0",
    currency: formData.get("currency") as string,
    // The form collects a date; send an ISO timestamp at midday for ordering.
    effective_at: `${dateOnly}T12:00:00.000Z`,
    tax_relevant_value_date: dateOnly,
    savings_plan: formData.get("savings_plan") === "on",
    note: (formData.get("note") as string) || undefined,
  }
}

/** A corporate-action application as served by the portfolio service. */
export interface AppliedCorporateAction {
  id: string
  corporate_action_id: string
  corporate_action_version: number
  ratio_numerator: string | null
  ratio_denominator: string | null
  effective_at: string
  fractional_handling: string
  applied_at: string
  reversed_at: string | null
  reversal_reason: string | null
}

export interface ApplyCorporateActionInput {
  corporate_action_id: string
  type: "split" | "reverse_split"
  ratio_numerator: string
  ratio_denominator: string
  ex_date: string
  version?: number
}

/** Searches the instrument catalog (instruments service) for the add flow. */
export async function searchInstrumentsAction(query: string): Promise<InstrumentWithListings[]> {
  const trimmedQuery = query.trim()
  if (trimmedQuery.length === 0) return []
  const response = await apiFetch(`/instruments/search?q=${encodeURIComponent(trimmedQuery)}`, { cache: "no-store" })
  if (!response.ok) return []
  return (await response.json()) as InstrumentWithListings[]
}

/**
 * Creates a position. Uses an existing listing when one was selected, otherwise
 * registers a new instrument + listing first, then opens the position with its
 * first buy transaction.
 */
export async function createPositionAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const portfolioId = formData.get("portfolio_id") as string
  if (!portfolioId) return "Select a portfolio."

  let listingId = (formData.get("listing_id") as string) || ""
  const currency = (formData.get("currency") as string)?.toUpperCase()

  if (!listingId) {
    // Manual entry: register the instrument + listing first.
    const name = (formData.get("name") as string)?.trim()
    const symbol = (formData.get("symbol") as string)?.trim()
    const exchangeMic = (formData.get("exchange_mic") as string)?.trim()
    if (!name || !symbol || !currency || !exchangeMic) {
      return "Name, symbol, currency, and exchange are required to add a new instrument."
    }
    let createInstrumentResponse: Response
    try {
      createInstrumentResponse = await apiFetch("/instruments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instrument: { name, asset_type: (formData.get("asset_type") as string) || "equity" },
          listing: { exchange_mic: exchangeMic, symbol, currency },
        }),
      })
    } catch {
      return "Cannot reach the gateway."
    }
    if (!createInstrumentResponse.ok) return problemDetail(createInstrumentResponse, "Failed to create the instrument.")
    listingId = ((await createInstrumentResponse.json()) as { listingId: string }).listingId
  }

  const dateOnly = formData.get("effective_at") as string
  let positionResponse: Response
  try {
    positionResponse = await apiFetch("/positions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        portfolio_id: portfolioId,
        listing_id: listingId,
        transaction: {
          side: "buy",
          quantity: formData.get("quantity") as string,
          price: formData.get("price") as string,
          fee: (formData.get("fee") as string) || "0",
          currency,
          effective_at: `${dateOnly}T12:00:00.000Z`,
          tax_relevant_value_date: dateOnly,
          savings_plan: false,
        },
      }),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!positionResponse.ok) return problemDetail(positionResponse, "Failed to create the position.")

  const redirectTo = formData.get("redirect_to")
  redirect(typeof redirectTo === "string" && (redirectTo === "/dashboard" || redirectTo.startsWith("/dashboard?")) ? redirectTo : "/dashboard")
}

export async function addTransactionAction(
  positionId: string,
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  let response: Response
  try {
    response = await apiFetch(`/positions/${positionId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transactionBody(formData)),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!response.ok) return problemDetail(response, "Failed to add transaction.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function updateTransactionAction(
  positionId: string,
  transactionId: string,
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  let response: Response
  try {
    response = await apiFetch(`/positions/${positionId}/transactions/${transactionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transactionBody(formData)),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!response.ok) return problemDetail(response, "Failed to update transaction.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function deleteTransactionAction(
  positionId: string,
  transactionId: string,
  _previousState: string | null,
): Promise<string | null> {
  let response: Response
  try {
    response = await apiFetch(`/positions/${positionId}/transactions/${transactionId}`, { method: "DELETE" })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!response.ok) return problemDetail(response, "Failed to delete transaction.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

/** Permanently deletes the position and all its transactions. */
export async function deletePositionAction(positionId: string): Promise<void> {
  await apiFetch(`/positions/${positionId}`, { method: "DELETE" }).catch(() => {})
  redirect("/dashboard")
}

export async function transferPositionAction(
  positionId: string,
  destinationPortfolioId: string,
): Promise<{ error?: string; positionId?: string }> {
  try {
    const response = await apiFetch(`/positions/${positionId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination_portfolio_id: destinationPortfolioId }),
    })
    if (!response.ok) return { error: await problemDetail(response, "Failed to move the position.") }
    const body = (await response.json()) as { position_id: string }
    revalidatePath("/dashboard")
    revalidatePath(`/positions/${positionId}`)
    return { positionId: body.position_id }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
}

export async function applyCorporateActionAction(positionId: string, input: ApplyCorporateActionInput): Promise<{ error?: string }> {
  try {
    const response = await apiFetch(`/positions/${positionId}/corporate-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!response.ok) return { error: await problemDetail(response, "Failed to apply the corporate action.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath(`/positions/${positionId}`)
  return {}
}

export async function reverseCorporateActionAction(
  positionId: string,
  applicationId: string,
  reason?: string,
): Promise<{ error?: string }> {
  try {
    const response = await apiFetch(`/corporate-actions/${applicationId}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    })
    if (!response.ok) return { error: await problemDetail(response, "Failed to reverse the corporate action.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath(`/positions/${positionId}`)
  return {}
}

/**
 * Corrects the instrument/listing: name, symbol, currency, and Yahoo ticker.
 * Saves only; quotes are pulled separately via the refresh button.
 */
export async function updateListingAction(
  positionId: string,
  listingId: string,
  instrumentId: string,
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const name = (formData.get("name") as string)?.trim()
  const symbol = (formData.get("symbol") as string)?.trim()
  const currency = (formData.get("currency") as string)?.trim()
  const yahoo = (formData.get("yahoo_symbol") as string)?.trim()

  const listingBody: {
    symbol?: string
    currency?: string
    provider_identifiers?: { provider: string; provider_identifier: string }[]
  } = {}
  if (symbol) listingBody.symbol = symbol
  if (currency) listingBody.currency = currency
  if (yahoo) listingBody.provider_identifiers = [{ provider: "yahoo", provider_identifier: yahoo }]

  try {
    if (Object.keys(listingBody).length > 0) {
      const response = await apiFetch(`/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listingBody),
      })
      if (!response.ok) return problemDetail(response, "Failed to update the listing.")
    }
    if (name) {
      const response = await apiFetch(`/instruments/${instrumentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!response.ok) return problemDetail(response, "Failed to update the instrument.")
    }
  } catch {
    return "Cannot reach the gateway."
  }

  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function refreshQuotesAction(
  positionId: string,
  listingId: string,
  from: string | null,
  _previousState: string | null,
): Promise<string | null> {
  const refreshed = await refreshMarketData(listingId, from ?? undefined)
  revalidatePath(`/positions/${positionId}`)
  if (refreshed === null) return "Could not reach the market service."
  if (refreshed === 0) return "Yahoo returned no quote data - check the Yahoo ticker (e.g. SAP.DE, BTC-EUR)."
  return null
}

async function refreshMarketData(listingId: string, from?: string): Promise<number | null> {
  try {
    const response = await apiFetch("/quotes/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_ids: [listingId], ...(from ? { from } : {}) }),
    })
    if (!response.ok) return null
    const { refreshed } = (await response.json()) as { refreshed: number }
    await apiFetch("/fx/refresh", { method: "POST" }).catch(() => {})
    return refreshed
  } catch {
    return null
  }
}
