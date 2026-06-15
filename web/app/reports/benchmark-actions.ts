"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

/**
 * Sets or clears a portfolio's preferred benchmark listing (the default the
 * `/reporting/benchmark` comparison uses). Pass `null` to clear it.
 */
export async function setPreferredBenchmarkAction(
  portfolioId: string,
  listingId: string | null,
): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch(`/portfolios/${portfolioId}/benchmark`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to update the benchmark.")
  revalidatePath("/reports")
  return null
}
