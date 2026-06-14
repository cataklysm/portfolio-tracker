import "server-only"
import { apiFetch } from "@/lib/api"
import type { CorporateAction, EarningsRow, NewsItem, PositionView } from "@/lib/types"

export interface InstrumentContext {
  instrumentId: string
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

function uniqueInstruments(positions: PositionView[]): InstrumentContext[] {
  const map = new Map<string, InstrumentContext>()
  for (const position of positions) {
    const listing = position.listing
    if (!listing || map.has(listing.instrument_id)) continue
    map.set(listing.instrument_id, {
      instrumentId: listing.instrument_id,
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

export async function fetchPortfolioEvents(positions: PositionView[]) {
  const instruments = uniqueInstruments(positions)
  const rows = await Promise.all(instruments.map(async (context) => {
    const [earnings, corporateActions] = await Promise.all([
      read<EarningsRow>(`/events/earnings?instrument_id=${context.instrumentId}`),
      read<CorporateAction>(`/events/corporate-actions?instrument_id=${context.instrumentId}`),
    ])
    return {
      earnings: earnings.map((item) => ({ ...item, context })),
      corporateActions: corporateActions.map((item) => ({ ...item, context })),
    }
  }))
  return {
    earnings: rows.flatMap((row) => row.earnings),
    corporateActions: rows.flatMap((row) => row.corporateActions),
  }
}

export async function fetchPortfolioNews(positions: PositionView[], limitPerInstrument = 8): Promise<PortfolioNews[]> {
  const instruments = uniqueInstruments(positions)
  const rows = await Promise.all(instruments.map(async (context) => {
    const news = await read<NewsItem>(`/events/news?instrument_id=${context.instrumentId}&limit=${limitPerInstrument}`)
    return news.map((item) => ({ ...item, context }))
  }))
  const deduplicated = new Map<string, PortfolioNews>()
  for (const item of rows.flat()) deduplicated.set(item.id, item)
  return [...deduplicated.values()].sort((a, b) => b.published_at.localeCompare(a.published_at))
}
