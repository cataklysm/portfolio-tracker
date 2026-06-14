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
  return null
}

/** Deletes a recorded tax event. */
export async function deleteTaxEventAction(
  id: string,
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
  return null
}
