"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import { parseRepeat } from "@/features/notifications/repeat"
import type { AlertRuleKind } from "@/lib/types"

type Result = { error: string } | null

export interface AlertRulePayload {
  kind: AlertRuleKind
  instrument_id: string
  listing_id?: string | null
  params: Record<string, unknown>
  label?: string | null
  notify_once?: boolean
  enabled?: boolean
}

async function send(path: string, method: string, body?: unknown): Promise<Result> {
  let resp: Response
  try {
    resp = await apiFetch(path, {
      method,
      ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}),
    })
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  if (!resp.ok) return { error: await problemDetail(resp, "Request failed.") }
  revalidatePath("/notifications")
  revalidatePath("/notifications/settings")
  revalidatePath("/", "layout")
  return null
}

export async function createRuleAction(_prev: Result, formData: FormData): Promise<Result> {
  const kind = formData.get("kind") as AlertRuleKind
  const num = (k: string) => Number(formData.get(k))

  let params: Record<string, unknown>
  switch (kind) {
    case "price_threshold":
      params = { direction: formData.get("direction"), price: num("price") }
      break
    case "daily_move":
      params = { threshold_pct: num("threshold_pct") }
      break
    case "earnings_lead":
      params = { days: num("days") }
      break
    case "cost_basis_move":
      params = { direction: formData.get("direction"), threshold_pct: num("threshold_pct") }
      break
    case "target_zone":
      if (!formData.get("target_id")) return { error: "Pick a target zone." }
      params = { target_id: formData.get("target_id") }
      break
    default:
      return { error: "Unknown rule kind." }
  }

  // Rules are always instrument-scoped now (global rules were removed).
  const instrumentId = formData.get("instrument_id") as string
  if (!instrumentId) return { error: "Pick an instrument." }
  const repeat = parseRepeat(formData.get("repeat"))
  const body: Record<string, unknown> = {
    kind,
    instrument_id: instrumentId,
    params,
    notify_once: repeat.notifyOnce,
  }
  const listingId = formData.get("listing_id") as string
  if (listingId) body.listing_id = listingId
  const label = (formData.get("label") as string)?.trim()
  if (label) body.label = label

  return send("/notifications/rules", "POST", body)
}

export async function createRulePayloadAction(body: AlertRulePayload): Promise<Result> {
  return send("/notifications/rules", "POST", normalizeRulePayload(body))
}

export async function updateRulePayloadAction(id: string, body: Partial<AlertRulePayload>): Promise<Result> {
  return send(`/notifications/rules/${id}`, "PATCH", normalizeRulePayload(body))
}

export async function toggleRuleAction(id: string, enabled: boolean): Promise<Result> {
  return send(`/notifications/rules/${id}`, "PATCH", { enabled })
}

export async function deleteRuleAction(id: string): Promise<Result> {
  return send(`/notifications/rules/${id}`, "DELETE")
}

function normalizeRulePayload(body: Partial<AlertRulePayload>): Partial<AlertRulePayload> {
  const normalized: Partial<AlertRulePayload> = { ...body }
  if (typeof normalized.label === "string") normalized.label = normalized.label.trim() || null
  if (normalized.listing_id === "") normalized.listing_id = null
  return normalized
}
