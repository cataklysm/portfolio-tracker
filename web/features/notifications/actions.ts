"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import { parseRepeat } from "@/features/notifications/repeat"
import type { AlertRuleKind } from "@/lib/types"

type ActionResult = string | null

function revalidateDetailPath(detailContext: string) {
  revalidatePath(detailContext.startsWith("/") ? detailContext : `/positions/${detailContext}`)
}

function revalidateNotifications(detailContext: string) {
  revalidateDetailPath(detailContext)
  revalidatePath("/notifications")
  revalidatePath("/notifications/settings")
  revalidatePath("/", "layout")
}

export async function createAssetAlertAction(
  detailContext: string,
  instrumentId: string,
  listingId: string,
  _previousState: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const kind = formData.get("kind") as AlertRuleKind
  const numberValue = (key: string) => Number(formData.get(key))

  let params: Record<string, unknown>
  switch (kind) {
    case "price_threshold":
      params = { direction: formData.get("direction"), price: numberValue("price") }
      break
    case "daily_move":
      params = { threshold_pct: numberValue("threshold_pct") }
      break
    case "earnings_lead":
      params = { days: numberValue("days") }
      break
    case "cost_basis_move":
      params = { direction: formData.get("direction"), threshold_pct: numberValue("threshold_pct") }
      break
    case "target_zone":
      if (!formData.get("target_id")) return "Pick a target zone."
      params = { target_id: formData.get("target_id") }
      break
    default:
      return "Unknown alert type."
  }

  const repeat = parseRepeat(formData.get("repeat"))
  const body: Record<string, unknown> = {
    kind,
    instrument_id: instrumentId,
    listing_id: listingId,
    params,
    notify_once: repeat.notifyOnce,
  }
  const label = (formData.get("label") as string)?.trim()
  if (label) body.label = label

  try {
    const response = await apiFetch("/notifications/rules", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!response.ok) return problemDetail(response, "Failed to create the alert.")
  } catch {
    return "Cannot reach the gateway."
  }

  revalidateNotifications(detailContext)
  return null
}

export async function toggleAssetAlertAction(detailContext: string, id: string, enabled: boolean): Promise<ActionResult> {
  try {
    const response = await apiFetch(`/notifications/rules/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    })
    if (!response.ok) return problemDetail(response, "Failed to update the alert.")
  } catch {
    return "Cannot reach the gateway."
  }

  revalidateNotifications(detailContext)
  return null
}

export async function deleteAssetAlertAction(detailContext: string, id: string): Promise<ActionResult> {
  try {
    const response = await apiFetch(`/notifications/rules/${id}`, { method: "DELETE" })
    if (!response.ok) return problemDetail(response, "Failed to delete the alert.")
  } catch {
    return "Cannot reach the gateway."
  }

  revalidateNotifications(detailContext)
  return null
}
