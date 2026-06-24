import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import type { WatchlistItemView } from "@/lib/types"
import { WatchlistWorkspace } from "@/features/watchlist/components/WatchlistWorkspace"

export default async function WatchlistPage() {
  const [response, locale] = await Promise.all([
    apiFetch("/watchlist", { cache: "no-store" }),
    getLocale(),
  ])
  const watchlistItems = response.ok ? ((await response.json()) as WatchlistItemView[]) : []

  return <WatchlistWorkspace locale={locale} watchlistItems={watchlistItems} />
}
