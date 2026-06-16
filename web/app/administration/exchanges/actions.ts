"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function updateExchangeAction(input: {
  id: string
  name: string
  timezone: string
  regularOpenLocal: string | null
  regularCloseLocal: string | null
  holidays?: string[]
}): Promise<string | null> {
  const body: {
    name: string
    timezone: string
    regular_open_local: string | null
    regular_close_local: string | null
    holidays?: string[]
  } = {
    name: input.name,
    timezone: input.timezone,
    regular_open_local: input.regularOpenLocal,
    regular_close_local: input.regularCloseLocal,
  }
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
