"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"
import type { TaxComponent } from "@/lib/types"

const TAX_COMPONENT_FIELDS: { field: string; component: TaxComponent }[] = [
  { field: "tax_component_capital_income", component: "capital_income" },
  { field: "tax_component_solidarity", component: "solidarity" },
  { field: "tax_component_church", component: "church" },
  { field: "tax_component_foreign_withholding", component: "foreign_withholding" },
  { field: "tax_component_generic", component: "generic" },
]

function cashFlowBody(formData: FormData, partial = false): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  const keys = ["type", "gross_amount", "withholding_tax", "fee", "currency", "payment_date", "tax_relevant_value_date", "position_id", "note"]
  for (const key of keys) {
    const value = formData.get(key)
    if (typeof value !== "string") continue
    const trimmed = value.trim()
    if (!partial || trimmed !== "") body[key] = trimmed
  }
  if (!body.position_id) delete body.position_id
  if (!body.note) delete body.note
  if (!body.tax_relevant_value_date) delete body.tax_relevant_value_date

  if (!partial) {
    for (const key of ["source_event_id", "source_event_type", "ex_date", "amount_per_share"] as const) {
      const value = formData.get(key)
      if (typeof value === "string" && value.trim()) body[key] = value.trim()
    }

    const version = formData.get("source_event_version")
    if (typeof version === "string" && version.trim()) {
      const parsedVersion = Number(version)
      if (Number.isFinite(parsedVersion)) body.source_event_version = parsedVersion
    }

    const taxComponents = TAX_COMPONENT_FIELDS.flatMap(({ field, component }) => {
      const amount = positiveAmount(formData.get(field))
      if (!amount) return []
      const currency = String(body.currency ?? "EUR").toUpperCase()
      const bookingDate = dateValue(formData.get(`${field}_booking_date`))
        ?? dateValue(formData.get("tax_relevant_value_date"))
        ?? dateValue(formData.get("payment_date"))
        ?? new Date().toISOString().slice(0, 10)
      return [{ component, amount, currency, booking_date: bookingDate }]
    })

    if (taxComponents.length > 0) {
      body.tax_components = taxComponents
      delete body.withholding_tax
    }
  }

  return body
}

function positiveAmount(value: FormDataEntryValue | null): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  if (!trimmed) return null
  const amount = Number(trimmed)
  return Number.isFinite(amount) && amount > 0 ? trimmed : null
}

function dateValue(value: FormDataEntryValue | null): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null
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
  revalidatePath("/events")
  const positionId = formData.get("position_id")
  if (typeof positionId === "string" && positionId) revalidatePath(`/positions/${positionId}`)
  const requestedRevalidatePath = formData.get("revalidate_path")
  if (typeof requestedRevalidatePath === "string" && isInternalPath(requestedRevalidatePath)) {
    revalidatePath(requestedRevalidatePath)
  }
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

function isInternalPath(value: string): boolean {
  return value.startsWith("/") && !value.startsWith("//")
}
