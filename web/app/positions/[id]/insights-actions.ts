"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import { parsePriceTargetForm } from "@/lib/price-target-validation"

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
  const parsed = parsePriceTargetForm(formData)
  if (!parsed.ok) return parsed.error

  const body: Record<string, unknown> = {
    instrument_id: instrumentId,
    currency,
    horizon: parsed.value.horizon,
    zone_low: parsed.value.zoneLow,
    zone_high: parsed.value.zoneHigh,
  }
  if (parsed.value.note) body.note = parsed.value.note

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

export async function updatePriceTargetAction(positionId: string, id: string, _prevState: string | null, formData: FormData): Promise<string | null> {
  const parsed = parsePriceTargetForm(formData)
  if (!parsed.ok) return parsed.error

  try {
    const resp = await apiFetch(`/price-targets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        horizon: parsed.value.horizon,
        zone_low: parsed.value.zoneLow,
        zone_high: parsed.value.zoneHigh,
        note: parsed.value.note,
      }),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update the price target.")
  } catch {
    return "Cannot reach the gateway."
  }
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
