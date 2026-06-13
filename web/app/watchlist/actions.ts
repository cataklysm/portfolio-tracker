"use server"
import { revalidatePath } from "next/cache"
import { apiFetch, problemDetail } from "@/lib/api"

/** Adds a listing to the user's watchlist, then refreshes the page. */
export async function addToWatchlistAction(
  listingId: string,
  note: string | null,
): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch("/watchlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listing_id: listingId, note: note || undefined }),
    })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to add to watchlist.")
  revalidatePath("/watchlist")
  return null
}

/** Removes a listing from the watchlist. */
export async function removeFromWatchlistAction(listingId: string): Promise<string | null> {
  let resp: Response
  try {
    resp = await apiFetch(`/watchlist/${listingId}`, { method: "DELETE" })
  } catch {
    return "Cannot reach the gateway."
  }
  if (!resp.ok) return problemDetail(resp, "Failed to remove from watchlist.")
  revalidatePath("/watchlist")
  return null
}
