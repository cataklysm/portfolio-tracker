"use server"
import { redirect } from "next/navigation"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

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

export async function addTransactionAction(
  positionId: string,
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch(`/positions/${positionId}/transactions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transactionBody(formData)),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to add transaction.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function updateTransactionAction(
  positionId: string,
  txId: string,
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch(`/positions/${positionId}/transactions/${txId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(transactionBody(formData)),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to update transaction.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function deleteTransactionAction(
  positionId: string,
  txId: string,
  _prevState: string | null,
): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch(`/positions/${positionId}/transactions/${txId}`, { method: "DELETE" })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to delete transaction.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

/** Permanently deletes the position and all its transactions. */
export async function deletePositionAction(positionId: string): Promise<void> {
  await apiFetch(`/positions/${positionId}`, { method: "DELETE" }).catch(() => {})
  redirect("/dashboard")
}

/**
 * Corrects the instrument/listing: name, symbol, currency, and Yahoo ticker
 * (so the market service fetches the right instrument). Saves only — quotes are
 * pulled separately via the refresh button.
 */
export async function updateListingAction(
  positionId: string,
  listingId: string,
  instrumentId: string,
  _prevState: string | null,
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
      const resp = await apiFetch(`/listings/${listingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(listingBody),
      })
      if (!resp.ok) return problemDetail(resp, "Failed to update the listing.")
    }
    if (name) {
      const resp = await apiFetch(`/instruments/${instrumentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      })
      if (!resp.ok) return problemDetail(resp, "Failed to update the instrument.")
    }
  } catch {
    return "Cannot reach the gateway."
  }

  revalidatePath(`/positions/${positionId}`)
  return null
}

/**
 * Pulls fresh quotes (and FX) for the position's listing on demand, and
 * backfills the daily-close history from `from` (the position's first
 * transaction date) through today.
 */
export async function refreshQuotesAction(
  positionId: string,
  listingId: string,
  from: string | null,
  _prevState: string | null,
): Promise<string | null> {
  const refreshed = await refreshMarketData(listingId, from ?? undefined)
  revalidatePath(`/positions/${positionId}`)
  if (refreshed === null) return "Could not reach the market service."
  if (refreshed === 0) return "Yahoo returned no quote data — check the Yahoo ticker (e.g. SAP.DE, BTC-EUR)."
  return null
}

/**
 * Refreshes the quote for a listing and the daily FX rates. When `from` is set,
 * the market service backfills daily closes from that date through today.
 * Returns the number of quotes stored (0 = provider returned nothing), or null
 * if the market service was unreachable. FX is refreshed best-effort so
 * reporting-currency value and unrealized P&L can be computed.
 */
async function refreshMarketData(listingId: string, from?: string): Promise<number | null> {
  try {
    const resp = await apiFetch("/quotes/refresh", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_ids: [listingId], ...(from ? { from } : {}) }),
    })
    if (!resp.ok) return null
    const { refreshed } = (await resp.json()) as { refreshed: number }
    await apiFetch("/fx/refresh", { method: "POST" }).catch(() => {})
    return refreshed
  } catch {
    return null
  }
}
