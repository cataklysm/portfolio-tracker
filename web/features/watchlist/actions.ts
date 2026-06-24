"use server"

import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

export async function addToWatchlistAction(
  listingId: string,
  note: string | null,
): Promise<string | null> {
  let response: Response
  try {
    response = await apiFetch("/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId, note: note || undefined }),
    })
  } catch {
    return "Cannot reach the gateway."
  }

  if (!response.ok) return problemDetail(response, "Failed to add to watchlist.")
  revalidatePath("/watchlist")
  return null
}

export async function removeFromWatchlistAction(listingId: string): Promise<string | null> {
  let response: Response
  try {
    response = await apiFetch(`/watchlist/${listingId}`, { method: "DELETE" })
  } catch {
    return "Cannot reach the gateway."
  }

  if (!response.ok) return problemDetail(response, "Failed to remove from watchlist.")
  revalidatePath("/watchlist")
  return null
}
