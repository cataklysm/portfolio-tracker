"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import type { AdminSymbolsPage, ExchangeView, InstrumentAssetType, ProviderSelectionView, ProviderSettingsView } from "@/lib/types"

export interface ProviderSymbolHit {
  symbol: string
  name: string
  exchange: string | null
  currency: string | null
}

export async function listAdminSymbolsAction(input: {
  assetType: InstrumentAssetType
  query?: string
  limit: number
  offset: number
}): Promise<AdminSymbolsPage> {
  const params = new URLSearchParams({
    asset_type: input.assetType,
    limit: String(input.limit),
    offset: String(input.offset),
  })
  const query = input.query?.trim()
  if (query) params.set("q", query)
  try {
    const resp = await apiFetch(`/instruments/admin/symbols?${params.toString()}`, { cache: "no-store" })
    if (resp.ok) return (await resp.json()) as AdminSymbolsPage
  } catch {
    // Fall through to an empty page so the UI can keep rendering its shell.
  }
  return {
    items: [],
    total: 0,
    limit: input.limit,
    offset: input.offset,
    counts: { equity: 0, crypto: 0, fund: 0, index: 0 },
  }
}

export async function listAdminSymbolEditMetadataAction(): Promise<{
  exchanges: ExchangeView[]
  providers: ProviderSettingsView[]
  error: string | null
}> {
  try {
    const [exchangesResp, providersResp] = await Promise.all([
      apiFetch("/exchanges", { cache: "no-store" }),
      apiFetch("/admin/providers", { cache: "no-store" }),
    ])
    if (!exchangesResp.ok) return { exchanges: [], providers: [], error: await problemDetail(exchangesResp, "Failed to load exchanges.") }
    if (!providersResp.ok) return { exchanges: [], providers: [], error: await problemDetail(providersResp, "Failed to load providers.") }
    const providersBody = (await providersResp.json()) as { providers: ProviderSettingsView[] }
    return {
      exchanges: (await exchangesResp.json()) as ExchangeView[],
      providers: providersBody.providers,
      error: null,
    }
  } catch {
    return { exchanges: [], providers: [], error: "Cannot reach the gateway." }
  }
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

/** Search a specific provider's symbols (ISIN/name) for the identifier lookup. */
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
    const providerIdentifiers = parseJsonField<{ provider: string; provider_identifier: string }[]>(
      formData.get("provider_identifiers"),
    )?.filter((p) => p.provider && p.provider_identifier.trim().length > 0)
    const providerSelections = parseJsonField<{ capability: string; provider: string }[]>(
      formData.get("provider_selections"),
    )?.filter((s) => s.capability && s.provider)
    const resp = await apiFetch("/instruments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        instrument: {
          name: String(formData.get("name") ?? "").trim(),
          asset_type: String(formData.get("asset_type") ?? "equity"),
          isin: String(formData.get("isin") ?? "").trim() || undefined,
        },
        listing: {
          exchange_id: String(formData.get("exchange_id") ?? ""),
          symbol: String(formData.get("symbol") ?? "").trim(),
          currency: String(formData.get("currency") ?? "").trim(),
        },
        provider_identifiers: providerIdentifiers,
        provider_selections: providerSelections,
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

    // Per-provider symbols (provider -> identifier) and per-capability provider
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

export async function purgeAdminSymbolQuotesAction(listingId: string): Promise<string | null> {
  try {
    const resp = await apiFetch("/quotes/purge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_ids: [listingId], confirm: true }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to purge quote history.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/symbols")
  return null
}

export async function rebuildAdminSymbolQuotesAction(listingId: string, quoteProvider: string | null): Promise<string | null> {
  const normalizedProvider = quoteProvider?.toLowerCase() ?? ""
  const from = normalizedProvider === "lstc" || normalizedProvider === "lssi" ? undefined : "2000-01-01"
  try {
    const resp = await apiFetch("/quotes/rebuild", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        listing_ids: [listingId],
        ...(from ? { from } : {}),
        confirm: true,
      }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to rebuild quote history.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/symbols")
  return null
}
