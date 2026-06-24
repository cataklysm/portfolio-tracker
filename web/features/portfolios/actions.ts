"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export interface CreatePortfolioResult {
  error: string | null
  portfolioId: string | null
  warning?: string | null
}

export async function createPortfolioAction(
  _prevState: string | null,
  formData: FormData,
): Promise<string | null> {
  const name = (formData.get("name") as string)?.trim()
  const result = await createPortfolioWithBenchmarkAction(name, null)
  return result.error
}

export async function createPortfolioFromNameAction(name: string): Promise<string | null> {
  const result = await createPortfolioWithBenchmarkAction(name, null)
  return result.error
}

export async function createPortfolioWithBenchmarkAction(name: string, benchmarkListingId: string | null): Promise<CreatePortfolioResult> {
  if (!name) return { error: "A portfolio name is required.", portfolioId: null }

  let response: Response
  try {
    response = await apiFetch("/portfolios", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    })
  } catch {
    return { error: "Cannot reach the gateway.", portfolioId: null }
  }

  if (!response.ok) return { error: await problemDetail(response, "Failed to create portfolio."), portfolioId: null }
  const created = (await response.json()) as { id: string }

  let warning: string | null = null
  if (benchmarkListingId) {
    let benchmarkResponse: Response | null = null
    try {
      benchmarkResponse = await apiFetch(`/portfolios/${created.id}/benchmark`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listing_id: benchmarkListingId }),
      })
    } catch {
      warning = "Portfolio created, but the benchmark could not be saved."
    }

    if (benchmarkResponse && !benchmarkResponse.ok) {
      warning = await problemDetail(benchmarkResponse, "Portfolio created, but the benchmark could not be saved.")
    }
  }

  revalidatePath("/dashboard")
  revalidatePath("/", "layout")
  revalidatePath("/reports")
  return { error: null, portfolioId: created.id, warning }
}
