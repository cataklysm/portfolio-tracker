"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

/** A corporate-action application as served by the portfolio service. */
export interface AppliedCorporateAction {
  id: string
  corporate_action_id: string
  corporate_action_version: number
  ratio_numerator: string | null
  ratio_denominator: string | null
  effective_at: string
  fractional_handling: string
  applied_at: string
  reversed_at: string | null
  reversal_reason: string | null
}

export interface ApplyInput {
  corporate_action_id: string
  type: "split" | "reverse_split"
  ratio_numerator: string
  ratio_denominator: string
  ex_date: string
  version?: number
}

export async function applyCorporateActionAction(positionId: string, input: ApplyInput): Promise<{ error?: string }> {
  try {
    const resp = await apiFetch(`/positions/${positionId}/corporate-actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    })
    if (!resp.ok) return { error: await problemDetail(resp, "Failed to apply the corporate action.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath(`/positions/${positionId}`)
  return {}
}

export async function reverseCorporateActionAction(
  positionId: string,
  applicationId: string,
  reason?: string,
): Promise<{ error?: string }> {
  try {
    const resp = await apiFetch(`/corporate-actions/${applicationId}/reverse`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reason ? { reason } : {}),
    })
    if (!resp.ok) return { error: await problemDetail(resp, "Failed to reverse the corporate action.") }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  revalidatePath(`/positions/${positionId}`)
  return {}
}
