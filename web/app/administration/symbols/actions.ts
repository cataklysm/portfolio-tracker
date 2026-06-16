"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import type { ProviderSelectionView } from "@/lib/types"

export interface ProviderSymbolHit {
  symbol: string
  name: string
  exchange: string | null
  currency: string | null
}

/** Current per-capability provider selections for an instrument (for the edit dialog). */
export async function getInstrumentSelectionsAction(instrumentId: string): Promise<ProviderSelectionView[]> {
  try {
    const resp = await apiFetch(`/instruments/${instrumentId}/providers`, { cache: "no-store" })
    if (!resp.ok) return []
    return (await resp.json()) as ProviderSelectionView[]
  } catch {
    return []
  }
}

/** Search a specific provider's symbols (ISIN/WKN/name) for the identifier lookup. */
export async function searchProviderSymbolsAction(provider: string, query: string): Promise<ProviderSymbolHit[]> {
  const q = query.trim()
  if (!provider || q.length === 0) return []
  try {
    const resp = await apiFetch(`/admin/providers/${encodeURIComponent(provider)}/search?q=${encodeURIComponent(q)}`, {
      cache: "no-store",
    })
    if (!resp.ok) return []
    const body = (await resp.json()) as { results?: ProviderSymbolHit[] }
    return body.results ?? []
  } catch {
    return []
  }
}

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

    // Per-provider symbols (provider → identifier) and per-capability provider
    // selections are carried as JSON in hidden fields from the dialog's matrix.
    const providerIdentifiers = parseJsonField<{ provider: string; provider_identifier: string }[]>(
      formData.get("provider_identifiers"),
    )?.filter((p) => p.provider && p.provider_identifier.trim().length > 0)
    const providerSelections = parseJsonField<{ capability: string; provider: string }[]>(
      formData.get("provider_selections"),
    )?.filter((s) => s.capability && s.provider)

    const listingResp = await apiFetch(`/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        symbol: String(formData.get("symbol") ?? "").trim(),
        currency: String(formData.get("currency") ?? "").trim(),
        exchange_id: String(formData.get("exchange_id") ?? "").trim() || undefined,
        provider_identifiers: providerIdentifiers,
      }),
    })
    if (!listingResp.ok) return problemDetail(listingResp, "Failed to update the listing.")

    if (providerSelections && providerSelections.length > 0) {
      const selResp = await apiFetch(`/instruments/${instrumentId}/provider-selections`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ selections: providerSelections }),
      })
      if (!selResp.ok) return problemDetail(selResp, "Failed to update provider selections.")
    }
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/symbols")
  revalidatePath("/administration/providers")
  return null
}

/** Parses a JSON-encoded hidden form field; returns null on absent/invalid input. */
function parseJsonField<T>(raw: FormDataEntryValue | null): T | null {
  if (typeof raw !== "string" || raw.trim().length === 0) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
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
