"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

/** Records a broker tax event (withheld/refunded, per component). */
export async function createTaxEventAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const body: Record<string, string> = {
    component: (formData.get("component") as string) || "capital_income",
    direction: (formData.get("direction") as string) || "withheld",
    amount: (formData.get("amount") as string) || "0",
    currency: (formData.get("currency") as string) || "EUR",
    booking_date: formData.get("booking_date") as string,
  }
  const note = formData.get("note")
  if (typeof note === "string" && note.trim()) body.note = note.trim()
  const portfolioId = formData.get("portfolio_id")
  if (typeof portfolioId === "string" && portfolioId) body.portfolio_id = portfolioId
  for (const key of ["transaction_id", "cash_flow_id", "position_id"] as const) {
    const value = formData.get(key)
    if (typeof value === "string" && value) body[key] = value
  }

  let resp: Response
  try {
    resp = await apiFetch("/tax-events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to record the tax event.")
  revalidatePath("/reports")
  revalidatePath("/activity")
  const positionId = body.position_id
  if (positionId) revalidatePath(`/positions/${positionId}`)
  return null
}

export async function updateTaxEventAction(
  id: string,
  positionId: string | null,
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const body: Record<string, string> = {}
  for (const key of ["component", "direction", "amount", "currency", "booking_date", "note"] as const) {
    const value = formData.get(key)
    if (typeof value === "string") body[key] = value
  }
  try {
    const resp = await apiFetch(`/tax-events/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
    if (!resp.ok) return problemDetail(resp, "Failed to update the tax event.")
  } catch {
    return "Cannot reach the gateway."
  }
  revalidatePath("/reports")
  revalidatePath("/activity")
  if (positionId) revalidatePath(`/positions/${positionId}`)
  return null
}

/** Deletes a recorded tax event. */
export async function deleteTaxEventAction(
  id: string,
  positionId: string | null,
  _prevState: string | null,
): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch(`/tax-events/${id}`, { method: "DELETE" })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to delete the tax event.")
  revalidatePath("/reports")
  revalidatePath("/activity")
  if (positionId) revalidatePath(`/positions/${positionId}`)
  return null
}
