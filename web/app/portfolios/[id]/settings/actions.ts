"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function setPreferredBenchmarkAction(portfolioId: string, listingId: string | null): Promise<string | null> {
  let response: Response
  try {
    response = await apiFetch(`/portfolios/${portfolioId}/benchmark`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId }),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!response.ok) return problemDetail(response, "Failed to update the benchmark.")
  revalidatePath(`/portfolios/${portfolioId}/settings`)
  revalidatePath("/dashboard")
  revalidatePath("/reports")
  return null
}
