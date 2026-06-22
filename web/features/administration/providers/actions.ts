"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import type { CapabilityRefreshView, ProviderCapability, ProviderSettingsView, ProviderUsageView } from "@/lib/types"

type ProviderIdentifierInput = { provider: string; provider_identifier: string }

export async function listAdminProviderConfigurationAction(): Promise<{
  providers: ProviderSettingsView[]
  capabilityRefresh: CapabilityRefreshView[]
  error: string | null
}> {
  try {
    const providersResp = await apiFetch("/admin/providers", { cache: "no-store" })
    if (!providersResp.ok) return { providers: [], capabilityRefresh: [], error: await problemDetail(providersResp, "Failed to load providers.") }
    const providerBody = (await providersResp.json()) as { providers: ProviderSettingsView[] }
    return { providers: providerBody.providers, capabilityRefresh: [], error: null }
  } catch {
    return { providers: [], capabilityRefresh: [], error: "Cannot reach the gateway." }
  }
}

export async function listAdminProviderCadenceAction(provider: string): Promise<{
  capabilityRefresh: CapabilityRefreshView[]
  error: string | null
}> {
  try {
    const resp = await apiFetch(`/admin/providers/${encodeURIComponent(provider)}/capability-refresh`, { cache: "no-store" })
    if (!resp.ok) return { capabilityRefresh: [], error: await problemDetail(resp, "Failed to load provider cadence.") }
    const body = (await resp.json()) as { settings: CapabilityRefreshView[] }
    return { capabilityRefresh: body.settings, error: null }
  } catch {
    return { capabilityRefresh: [], error: "Cannot reach the gateway." }
  }
}

export async function updateListingProviderIdentifiersAction(
  listingId: string,
  identifiers: ProviderIdentifierInput[],
): Promise<string | null> {
  try {
    const resp = await apiFetch(`/listings/${listingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        provider_identifiers: identifiers
          .map((identifier) => ({
            provider: identifier.provider.trim(),
            provider_identifier: identifier.provider_identifier.trim(),
          }))
          .filter((identifier) => identifier.provider && identifier.provider_identifier),
      }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update provider symbols.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/providers")
  revalidatePath("/administration/symbols")
  return null
}

export async function updateInstrumentProviderSelectionAction(input: {
  instrumentId: string
  capability: ProviderCapability
  provider: string
  rebuildListingIds?: string[]
  rebuildFrom?: string
}): Promise<string | null> {
  try {
    const resp = await apiFetch(`/instruments/${input.instrumentId}/providers`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ capability: input.capability, provider: input.provider }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update provider selection.")

    if (input.rebuildListingIds && input.rebuildListingIds.length > 0) {
      const rebuildResp = await apiFetch("/quotes/rebuild", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          listing_ids: input.rebuildListingIds,
          ...(input.rebuildFrom ? { from: input.rebuildFrom } : {}),
          confirm: true,
        }),
      })
      if (!rebuildResp.ok) return problemDetail(rebuildResp, "Provider selection saved, but price history rebuild failed.")
    }
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/providers")
  return null
}

export async function updateAdminProviderAction(input: {
  provider: string
  enabled?: boolean
  dataQuality?: string
  capabilityQuality?: Record<string, string>
  maxBatchSize?: number | null
  rateLimitPerMin?: number | null
  maxConcurrency?: number
}): Promise<string | null> {
  try {
    const resp = await apiFetch(`/admin/providers/${encodeURIComponent(input.provider)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enabled: input.enabled,
        data_quality: input.dataQuality,
        capability_quality: input.capabilityQuality,
        max_batch_size: input.maxBatchSize,
        rate_limit_per_min: input.rateLimitPerMin,
        max_concurrency: input.maxConcurrency,
      }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update provider settings.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/providers")
  return null
}

export async function updateCapabilityRefreshAction(input: {
  provider: string
  capability: string
  refreshIntervalMs?: number
  saveResolutionMs?: number | null
  enabled?: boolean
}): Promise<string | null> {
  try {
    const resp = await apiFetch(
      `/admin/providers/${encodeURIComponent(input.provider)}/capability-refresh/${encodeURIComponent(input.capability)}`,
      {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refresh_interval_ms: input.refreshIntervalMs,
          save_resolution_ms: input.saveResolutionMs,
          enabled: input.enabled,
        }),
      },
    )
    if (!resp.ok) return problemDetail(resp, "Failed to update refresh cadence.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/providers")
  return null
}

export async function providerUsageAction(provider: string): Promise<{ usage: ProviderUsageView[]; error: string | null }> {
  try {
    const resp = await apiFetch(`/instruments/provider-usage?provider=${encodeURIComponent(provider)}`, { cache: "no-store" })
    if (!resp.ok) return { usage: [], error: await problemDetail(resp, "Failed to load provider usage.") }
    return { usage: (await resp.json()) as ProviderUsageView[], error: null }
  } catch {
    return { usage: [], error: "Cannot reach the gateway." }
  }
}
