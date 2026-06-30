import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import type { AlertRule, NotificationInbox, PositionView, PriceTarget, WatchlistItemView } from "@/lib/types"
import { NotificationsWorkspace } from "@/features/notifications/components/NotificationsWorkspace"

interface NotificationsPageProperties {
  searchParams: Promise<{ view?: string }>
}

export default async function NotificationsPage({ searchParams }: NotificationsPageProperties) {
  const [{ view }, resp, positionsResp, rulesResp, watchlistResp, locale] = await Promise.all([
    searchParams,
    apiFetch("/notifications?limit=100", { cache: "no-store" }),
    apiFetch("/positions", { cache: "no-store" }),
    apiFetch("/notifications/rules", { cache: "no-store" }),
    apiFetch("/watchlist", { cache: "no-store" }),
    getLocale(),
  ])
  const inbox: NotificationInbox = resp.ok
    ? ((await resp.json()) as NotificationInbox)
    : { unread_count: 0, notifications: [] }
  const positions = positionsResp.ok ? ((await positionsResp.json()) as PositionView[]) : []
  const rules = rulesResp.ok ? ((await rulesResp.json()) as AlertRule[]) : []
  const watchlistItems = watchlistResp.ok ? ((await watchlistResp.json()) as WatchlistItemView[]) : []
  const priceTargets = await fetchPriceTargets(positions, watchlistItems)

  return <NotificationsWorkspace inbox={inbox} initialView={view === "rules" ? "rules" : undefined} locale={locale} positions={positions} priceTargets={priceTargets} rules={rules} watchlistItems={watchlistItems} />
}

async function fetchPriceTargets(positions: PositionView[], watchlistItems: WatchlistItemView[]): Promise<PriceTarget[]> {
  const seen = new Set<string>()
  const assets = [
    ...positions.flatMap((position) => position.listing ? [{ instrumentId: position.listing.instrument_id, listingId: position.listing_id }] : []),
    ...watchlistItems.flatMap((item) => item.listing ? [{ instrumentId: item.listing.instrument_id, listingId: item.listing_id }] : []),
  ].filter((asset) => {
    const key = `${asset.instrumentId}:${asset.listingId}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  const responses = await Promise.all(assets.map(async (asset) => {
    const response = await apiFetch(`/price-targets?instrument_id=${asset.instrumentId}&listing_id=${asset.listingId}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as PriceTarget[]) : []
  }))
  const targetsById = new Map<string, PriceTarget>()
  for (const target of responses.flat()) targetsById.set(target.id, target)
  return [...targetsById.values()]
}
