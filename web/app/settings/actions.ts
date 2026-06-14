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

/**
 * Records a new effective-dated tax residence. Residence is explicitly
 * user-confirmed and never inferred from locale, currency, or broker; it only
 * controls jurisdiction-specific labels and disclosures, not tax calculation.
 */
export async function setTaxResidencyAction(
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const countryCode = formData.get("country_code")
  const validFrom = formData.get("valid_from")
  if (typeof countryCode !== "string" || !countryCode) return { error: "Select a country of tax residence." }
  if (typeof validFrom !== "string" || !validFrom) return { error: "Choose an effective date." }

  let resp: Response
  try {
    resp = await apiFetch("/tax-residency", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ country_code: countryCode, valid_from: validFrom }),
    })
  } catch {
    return { error: "Cannot reach the gateway." }
  }

  if (!resp.ok) return { error: await problemDetail(resp, "Request failed") }

  revalidatePath("/settings")
  return { ok: true }
}
