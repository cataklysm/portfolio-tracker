"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import { parsePriceTargetForm } from "@/lib/price-target-validation"

function revalidateDetailPath(detailContext: string) {
  revalidatePath(detailContext.startsWith("/") ? detailContext : `/positions/${detailContext}`)
}

/** Computes and stores a DCF fair value for the instrument. */
export async function createDcfFairValueAction(
  instrumentId: string,
  currency: string,
  detailContext: string,
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const numberValue = (key: string) => Number(formData.get(key))
  const assumptions = {
    base_cash_flow: numberValue("base_cash_flow"),
    growth_rate: numberValue("growth_rate") / 100,
    projection_years: numberValue("projection_years"),
    discount_rate: numberValue("discount_rate") / 100,
    terminal_growth: numberValue("terminal_growth") / 100,
    shares_outstanding: numberValue("shares_outstanding"),
    net_debt: formData.get("net_debt") ? numberValue("net_debt") : 0,
  }

  let response: Response
  try {
    response = await apiFetch("/fair-values", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instrument_id: instrumentId, currency, assumptions }),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!response.ok) return problemDetail(response, "Failed to compute the fair value.")
  revalidateDetailPath(detailContext)
  return null
}

export async function deleteFairValueAction(detailContext: string, id: string): Promise<string | null> {
  try {
    const response = await apiFetch(`/fair-values/${id}`, { method: "DELETE" })
    if (!response.ok) return problemDetail(response, "Failed to delete the fair value.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidateDetailPath(detailContext)
  return null
}

/** Creates an own price-target zone for the concrete asset listing. */
export async function createPriceTargetAction(
  instrumentId: string,
  listingId: string,
  currency: string,
  detailContext: string,
  _previousState: string | null,
  formData: FormData,
): Promise<string | null> {
  const parsed = parsePriceTargetForm(formData, currency)
  if (!parsed.ok) return parsed.error

  const body: Record<string, unknown> = {
    instrument_id: instrumentId,
    listing_id: listingId,
    currency: parsed.value.currency,
    horizon: parsed.value.horizon,
    zone_low: parsed.value.zoneLow,
    zone_high: parsed.value.zoneHigh,
  }
  if (parsed.value.note) body.note = parsed.value.note

  let response: Response
  try {
    response = await apiFetch("/price-targets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!response.ok) return problemDetail(response, "Failed to add the price target.")
  revalidateDetailPath(detailContext)
  return null
}

export async function updatePriceTargetAction(detailContext: string, id: string, _previousState: string | null, formData: FormData): Promise<string | null> {
  const parsed = parsePriceTargetForm(formData)
  if (!parsed.ok) return parsed.error

  try {
    const response = await apiFetch(`/price-targets/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        currency: parsed.value.currency,
        horizon: parsed.value.horizon,
        zone_low: parsed.value.zoneLow,
        zone_high: parsed.value.zoneHigh,
        note: parsed.value.note,
      }),
    })
    if (!response.ok) return problemDetail(response, "Failed to update the price target.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidateDetailPath(detailContext)
  return null
}

export async function deletePriceTargetAction(detailContext: string, id: string): Promise<string | null> {
  try {
    const response = await apiFetch(`/price-targets/${id}`, { method: "DELETE" })
    if (!response.ok) return problemDetail(response, "Failed to delete the price target.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidateDetailPath(detailContext)
  return null
}
