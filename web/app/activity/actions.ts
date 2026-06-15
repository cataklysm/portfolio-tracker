"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

function cashFlowBody(formData: FormData, partial = false): Record<string, string> {
  const body: Record<string, string> = {}
  const keys = ["type", "gross_amount", "withholding_tax", "fee", "currency", "payment_date", "tax_relevant_value_date", "position_id", "note"]
  for (const key of keys) {
    const value = formData.get(key)
    if (typeof value !== "string") continue
    if (!partial || value !== "") body[key] = value
  }
  if (!body.position_id) delete body.position_id
  if (!body.note) delete body.note
  if (!body.tax_relevant_value_date) delete body.tax_relevant_value_date
  return body
}

export async function createCashFlowAction(portfolioId: string, _state: string | null, formData: FormData): Promise<string | null> {
  try {
    const resp = await apiFetch(`/portfolios/${portfolioId}/cash-flows`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cashFlowBody(formData)),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to create cash flow.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/activity")
  revalidatePath("/reports")
  return null
}

export async function updateCashFlowAction(portfolioId: string, id: string, _state: string | null, formData: FormData): Promise<string | null> {
  try {
    const resp = await apiFetch(`/portfolios/${portfolioId}/cash-flows/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cashFlowBody(formData, true)),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update cash flow.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/activity")
  revalidatePath("/reports")
  return null
}

export async function deleteCashFlowAction(portfolioId: string, id: string): Promise<string | null> {
  try {
    const resp = await apiFetch(`/portfolios/${portfolioId}/cash-flows/${id}`, { method: "DELETE" })
    if (!resp.ok) return problemDetail(resp, "Failed to delete cash flow.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/activity")
  revalidatePath("/reports")
  return null
}
