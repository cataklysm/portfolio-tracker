"use server"

import { apiFetch } from "@/lib/api"
import type { ActivityPage } from "@/lib/types"

const EMPTY: ActivityPage = { items: [], next_cursor: null }

/** Fetches a page of the merged activity feed (used for "Load more"). */
export async function loadActivityAction(opts: {
  cursor?: string | null
  type?: string
  portfolioId?: string
}): Promise<ActivityPage> {
  const params = new URLSearchParams()
  if (opts.portfolioId) params.set("portfolio_id", opts.portfolioId)
  if (opts.type) params.set("type", opts.type)
  if (opts.cursor) params.set("cursor", opts.cursor)
  try {
    const response = await apiFetch(`/activity${params.size ? `?${params}` : ""}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as ActivityPage) : EMPTY
  } catch {
    return EMPTY
  }
}
