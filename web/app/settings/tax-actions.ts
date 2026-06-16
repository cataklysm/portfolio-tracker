"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

type Result = { ok: true } | { error: string }

/** Saves a portfolio's tax settings under a governing rule (or clears it with rule_key=null). */
export async function savePortfolioTaxSettingsAction(
  portfolioId: string,
  ruleKey: string | null,
  settings: Record<string, unknown>,
): Promise<Result> {
  let resp: Response
  try {
    resp = await apiFetch(`/portfolios/${portfolioId}/tax-settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rule_key: ruleKey, settings }),
    })
  } catch {
    return { error: "Cannot reach the gateway." }
  }
  if (!resp.ok) return { error: await problemDetail(resp, "Failed to save portfolio tax settings.") }
  revalidatePath("/reports")
  return { ok: true }
}
