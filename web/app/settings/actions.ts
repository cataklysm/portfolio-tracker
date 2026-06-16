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

export async function saveSettingsAction(
  taxSettings: Record<string, unknown>,
  formData: FormData,
): Promise<{ ok: true } | { error: string }> {
  const preferences = await updatePreferencesAction(formData)
  if ("error" in preferences) return preferences

  const countryCode = formData.get("country_code")
  const validFrom = formData.get("valid_from")
  const currentCountry = formData.get("current_country_code")
  const currentValidFrom = formData.get("current_valid_from")
  if (typeof countryCode !== "string" || !countryCode) return { error: "Select a country of tax residence." }
  if (typeof validFrom !== "string" || !validFrom) return { error: "Choose an effective date." }

  if (countryCode !== currentCountry || validFrom !== currentValidFrom) {
    let residencyResp: Response
    try {
      residencyResp = await apiFetch("/tax-residency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country_code: countryCode, valid_from: validFrom }),
      })
    } catch {
      return { error: "Preferences saved, but the gateway could not save tax residence." }
    }
    if (!residencyResp.ok) return { error: await problemDetail(residencyResp, "Preferences saved, but tax residence failed.") }
  }

  const taxSettingsCountry = formData.get("tax_settings_country")
  if (typeof taxSettingsCountry === "string" && taxSettingsCountry === countryCode) {
    let taxResp: Response
    try {
      taxResp = await apiFetch("/tax-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ country: countryCode, settings: taxSettings }),
      })
    } catch {
      return { error: "Profile saved, but the gateway could not save tax-specific settings." }
    }
    if (!taxResp.ok) return { error: await problemDetail(taxResp, "Profile saved, but tax-specific settings failed.") }
  }

  revalidatePath("/settings")
  revalidatePath("/reports")
  return { ok: true }
}
