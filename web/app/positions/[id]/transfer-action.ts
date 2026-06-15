"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

/** Moves a position to another portfolio. Returns the surviving position id. */
export async function transferPositionAction(
  positionId: string,
  destinationPortfolioId: string,
): Promise<{ error?: string; positionId?: string }> {
  try {
    const resp = await apiFetch(`/positions/${positionId}/transfer`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destination_portfolio_id: destinationPortfolioId }),
    })
    if (!resp.ok) return { error: await problemDetail(resp, "Failed to move the position.") }
    const body = (await resp.json()) as { position_id: string }
    revalidatePath("/dashboard")
    revalidatePath(`/positions/${positionId}`)
    return { positionId: body.position_id }
  } catch {
    return { error: "Cannot reach the gateway." }
  }
}
