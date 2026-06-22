import "server-only"
import { apiFetch } from "@/lib/api"
import type { CorporateAction, EarningsRow, NewsItem, PositionView } from "@/lib/types"

export interface InstrumentContext {
  instrumentId: string
  listingId: string
  positionId: string
  name: string
  symbol: string
  currency: string
}

export interface PortfolioEarnings extends EarningsRow {
  context: InstrumentContext
}

export interface PortfolioCorporateAction extends CorporateAction {
  context: InstrumentContext
}

export interface PortfolioNews extends NewsItem {
  context: InstrumentContext
}

interface Page<T> {
  items: T[]
  total: number
  limit: number
  offset: number
}

export function uniquePortfolioEventContexts(positions: PositionView[]): InstrumentContext[] {
  const map = new Map<string, InstrumentContext>()
  for (const position of positions) {
    const listing = position.listing
    if (!listing || map.has(listing.instrument_id)) continue
    map.set(listing.instrument_id, {
      instrumentId: listing.instrument_id,
      listingId: position.listing_id,
      positionId: position.id,
      name: listing.name,
      symbol: listing.symbol,
      currency: listing.currency,
    })
  }
  return [...map.values()]
}

async function read<T>(path: string): Promise<T[]> {
  try {
    const response = await apiFetch(path, { cache: "no-store" })
    return response.ok ? ((await response.json()) as T[]) : []
  } catch {
    return []
  }
}

async function readPage<T>(path: string): Promise<Page<T>> {
  try {
    const response = await apiFetch(path, { cache: "no-store" })
    return response.ok ? ((await response.json()) as Page<T>) : { items: [], total: 0, limit: 0, offset: 0 }
  } catch {
    return { items: [], total: 0, limit: 0, offset: 0 }
  }
}

export async function fetchPortfolioEvents(positions: PositionView[]) {
  const instruments = uniquePortfolioEventContexts(positions)
  const contextByInstrument = new Map(instruments.map((context) => [context.instrumentId, context]))
  const instrumentIds = instruments.map((context) => context.instrumentId)
  if (instrumentIds.length === 0) return { earnings: [], corporateActions: [] }

  const params = new URLSearchParams({ instrument_ids: instrumentIds.join(",") })
  const [earningsPage, corporateActionsPage] = await Promise.all([
    readPage<EarningsRow>(`/events/earnings?${withPagination(params, 500).toString()}`),
    readPage<CorporateAction>(`/events/corporate-actions?${withPagination(params, 300).toString()}`),
  ])

  return {
    earnings: earningsPage.items.flatMap((item) => {
      const context = contextByInstrument.get(item.instrument_id)
      return context ? [{ ...item, context }] : []
    }),
    corporateActions: corporateActionsPage.items.flatMap((item) => {
      const context = contextByInstrument.get(item.instrument_id)
      return context ? [{ ...item, context }] : []
    }),
  }
}

export async function fetchPortfolioNews(positions: PositionView[], limitPerInstrument = 8): Promise<PortfolioNews[]> {
  const instruments = uniquePortfolioEventContexts(positions)
  const rows = await Promise.all(instruments.map(async (context) => {
    const news = await read<NewsItem>(`/events/news?instrument_id=${context.instrumentId}&limit=${limitPerInstrument}`)
    return news.map((item) => ({ ...item, context }))
  }))
  const deduplicated = new Map<string, PortfolioNews>()
  for (const item of rows.flat()) deduplicated.set(item.id, item)
  return [...deduplicated.values()].sort((a, b) => b.published_at.localeCompare(a.published_at))
}

function withPagination(params: URLSearchParams, limit: number): URLSearchParams {
  const next = new URLSearchParams(params)
  next.set("limit", String(limit))
  next.set("offset", "0")
  return next
}
