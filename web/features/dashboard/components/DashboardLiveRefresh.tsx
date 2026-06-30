"use client"

import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useTransition } from "react"

const REFRESH_DEBOUNCE_MS = 750

interface DashboardLiveRefreshProperties {
  listingIds: string[]
}

interface QuoteUpdatePayload {
  listing_ids?: unknown
}

export function DashboardLiveRefresh({ listingIds }: DashboardLiveRefreshProperties) {
  const router = useRouter()
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [, startTransition] = useTransition()
  const listingKey = useMemo(() => [...new Set(listingIds)].sort().join("|"), [listingIds])

  useEffect(() => {
    if (!listingKey) return undefined

    const watchedListingIds = new Set(listingKey.split("|"))
    const source = new EventSource("/api/positions/stream")

    function scheduleRefresh() {
      if (document.visibilityState !== "visible") return
      if (refreshTimer.current) clearTimeout(refreshTimer.current)
      refreshTimer.current = setTimeout(() => {
        refreshTimer.current = null
        startTransition(() => {
          router.refresh()
        })
      }, REFRESH_DEBOUNCE_MS)
    }

    function onQuotesUpdated(event: Event) {
      const payload = parseQuoteUpdatePayload(event)
      if (!payload) return
      if (!payload.listingIds.some((listingId) => watchedListingIds.has(listingId))) return
      scheduleRefresh()
    }

    function onVisibilityChange() {
      if (document.visibilityState === "visible") scheduleRefresh()
    }

    source.addEventListener("quotes.updated", onQuotesUpdated)
    source.onerror = () => {
      // EventSource reconnects by itself; background refresh should stay quiet.
    }
    document.addEventListener("visibilitychange", onVisibilityChange)

    return () => {
      source.removeEventListener("quotes.updated", onQuotesUpdated)
      source.close()
      document.removeEventListener("visibilitychange", onVisibilityChange)
      if (refreshTimer.current) {
        clearTimeout(refreshTimer.current)
        refreshTimer.current = null
      }
    }
  }, [listingKey, router, startTransition])

  return null
}

function parseQuoteUpdatePayload(event: Event): { listingIds: string[] } | null {
  try {
    const data = JSON.parse((event as MessageEvent<string>).data) as QuoteUpdatePayload
    const listingIds = Array.isArray(data.listing_ids)
      ? data.listing_ids.filter((listingId): listingId is string => typeof listingId === "string" && listingId.length > 0)
      : []
    return listingIds.length > 0 ? { listingIds } : null
  } catch {
    return null
  }
}
