"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import type { ExchangeView } from "@/lib/types"

export async function listAdminExchangesAction(): Promise<{ exchanges: ExchangeView[]; error: string | null }> {
  try {
    const resp = await apiFetch("/exchanges?include_inactive=true", { cache: "no-store" })
    if (!resp.ok) return { exchanges: [], error: await problemDetail(resp, "Failed to load exchanges.") }
    return { exchanges: (await resp.json()) as ExchangeView[], error: null }
  } catch {
    return { exchanges: [], error: "Cannot reach the gateway." }
  }
}

export async function updateExchangeAction(input: {
  id: string
  mic: string
  name: string
  timezone: string
  regularOpenLocal: string | null
  regularCloseLocal: string | null
  active?: boolean
  holidays?: string[]
}): Promise<string | null> {
  const body: {
    mic: string
    name: string
    timezone: string
    regular_open_local: string | null
    regular_close_local: string | null
    active?: boolean
    holidays?: string[]
  } = {
    mic: input.mic,
    name: input.name,
    timezone: input.timezone,
    regular_open_local: input.regularOpenLocal,
    regular_close_local: input.regularCloseLocal,
  }
  if (input.active !== undefined) body.active = input.active
  if (input.holidays !== undefined) body.holidays = input.holidays
  try {
    const resp = await apiFetch(`/exchanges/${input.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update the exchange calendar.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/exchanges")
  revalidatePath("/administration/symbols")
  return null
}

export async function createExchangeAction(input: {
  mic: string
  name: string
  timezone: string
  regularOpenLocal: string | null
  regularCloseLocal: string | null
}): Promise<string | null> {
  try {
    const resp = await apiFetch("/exchanges", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mic: input.mic,
        name: input.name,
        timezone: input.timezone,
        regular_open_local: input.regularOpenLocal,
        regular_close_local: input.regularCloseLocal,
      }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to create the exchange.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/exchanges")
  revalidatePath("/administration/symbols")
  return null
}

export async function deleteExchangeAction(id: string): Promise<string | null> {
  try {
    const resp = await apiFetch(`/exchanges/${id}`, { method: "DELETE" })
    if (!resp.ok) return problemDetail(resp, "Failed to delete the exchange.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/exchanges")
  revalidatePath("/administration/symbols")
  return null
}

export async function restoreExchangeAction(id: string): Promise<string | null> {
  try {
    const resp = await apiFetch(`/exchanges/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ active: true }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to restore the exchange.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/administration/exchanges")
  revalidatePath("/administration/symbols")
  return null
}
