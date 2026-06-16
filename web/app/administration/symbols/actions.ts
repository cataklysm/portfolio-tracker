"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function createAdminSymbolAction(formData: FormData): Promise<string | null> {
  try {
    const resp = await apiFetch("/instruments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: {
          name: String(formData.get("name") ?? "").trim(),
          asset_type: String(formData.get("asset_type") ?? "equity"),
          isin: String(formData.get("isin") ?? "").trim() || undefined,
          underlying_identifier: String(formData.get("underlying_identifier") ?? "").trim() || undefined,
        },
        listing: {
          exchange_id: String(formData.get("exchange_id") ?? ""),
          symbol: String(formData.get("symbol") ?? "").trim(),
          currency: String(formData.get("currency") ?? "").trim(),
        },
      }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to add the symbol.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/symbols")
  revalidatePath("/administration/providers")
  return null
}

export async function updateAdminSymbolAction(formData: FormData): Promise<string | null> {
  const instrumentId = String(formData.get("instrument_id") ?? "")
  const listingId = String(formData.get("listing_id") ?? "")
  try {
    const instrumentResp = await apiFetch(`/instruments/${instrumentId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: String(formData.get("name") ?? "").trim(),
        isin: String(formData.get("isin") ?? "").trim() || null,
      }),
    })
    if (!instrumentResp.ok) return problemDetail(instrumentResp, "Failed to update the instrument.")

    const listingResp = await apiFetch(`/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: String(formData.get("symbol") ?? "").trim(),
        currency: String(formData.get("currency") ?? "").trim(),
        exchange_id: String(formData.get("exchange_id") ?? "").trim() || undefined,
      }),
    })
    if (!listingResp.ok) return problemDetail(listingResp, "Failed to update the listing.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/symbols")
  revalidatePath("/administration/providers")
  return null
}

export async function deactivateAdminSymbolAction(listingId: string): Promise<string | null> {
  try {
    const resp = await apiFetch(`/instruments/admin/symbols/${listingId}`, { method: "DELETE" })
    if (!resp.ok) return problemDetail(resp, "Failed to remove the symbol.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/symbols")
  revalidatePath("/administration/providers")
  return null
}
