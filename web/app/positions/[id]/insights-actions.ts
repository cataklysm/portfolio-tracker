"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

/** Computes + stores a DCF fair value for the instrument. */
export async function createDcfFairValueAction(
  instrumentId: string,
  currency: string,
  positionId: string,
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const n = (key: string) => Number(formData.get(key))
  const assumptions = {
    base_cash_flow: n("base_cash_flow"),
    growth_rate: n("growth_rate") / 100,
    projection_years: n("projection_years"),
    discount_rate: n("discount_rate") / 100,
    terminal_growth: n("terminal_growth") / 100,
    shares_outstanding: n("shares_outstanding"),
    net_debt: formData.get("net_debt") ? n("net_debt") : 0,
  }

  let resp: Response
  try {
    resp = await apiFetch("/fair-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument_id: instrumentId, currency, assumptions }),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to compute the fair value.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function deleteFairValueAction(positionId: string, id: string): Promise<string | null> {
  try {
    const resp = await apiFetch(`/fair-values/${id}`, { method: "DELETE" })
    if (!resp.ok) return problemDetail(resp, "Failed to delete the fair value.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath(`/positions/${positionId}`)
  return null
}

/** Creates an own price-target zone for the instrument. */
export async function createPriceTargetAction(
  instrumentId: string,
  currency: string,
  positionId: string,
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const low = formData.get("zone_low") as string
  const high = formData.get("zone_high") as string
  const body: Record<string, unknown> = {
    instrument_id: instrumentId,
    currency,
    horizon: (formData.get("horizon") as string) || "medium",
  }
  if (low) body.zone_low = Number(low)
  if (high) body.zone_high = Number(high)
  const note = (formData.get("note") as string)?.trim()
  if (note) body.note = note

  let resp: Response
  try {
    resp = await apiFetch("/price-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to add the price target.")
  revalidatePath(`/positions/${positionId}`)
  return null
}

export async function deletePriceTargetAction(positionId: string, id: string): Promise<string | null> {
  try {
    const resp = await apiFetch(`/price-targets/${id}`, { method: "DELETE" })
    if (!resp.ok) return problemDetail(resp, "Failed to delete the price target.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath(`/positions/${positionId}`)
  return null
}
