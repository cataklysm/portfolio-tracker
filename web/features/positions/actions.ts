"use server"
import { redirect } from "next/navigation"
import { apiFetch, problemDetail } from "@/lib/api"
import type { InstrumentWithListings } from "@/lib/types"

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
