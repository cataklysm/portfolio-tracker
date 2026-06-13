"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function updatePreferencesAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const body: Record<string, string> = {}
  const displayName = formData.get("display_name")
  const reportingCurrency = formData.get("reporting_currency")
  const accountingMethod = formData.get("realization_accounting_method")
  const avatarColor = formData.get("avatar_color")

  if (typeof displayName === "string" && displayName.trim()) body.display_name = displayName.trim()
  if (typeof reportingCurrency === "string" && reportingCurrency) body.reporting_currency = reportingCurrency
  if (typeof accountingMethod === "string" && accountingMethod) body.realization_accounting_method = accountingMethod
  if (typeof avatarColor === "string" && avatarColor) body.avatar_color = avatarColor

  let resp: Response
  try {
    resp = await apiFetch("/me/preferences", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
  } catch {
    return { error: "Cannot reach the gateway." }
  }

  if (!resp.ok) return { error: await problemDetail(resp, "Request failed") }

  revalidatePath("/", "layout")
  return { ok: true }
}
