import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { num } from "@/lib/format"
import type {
  AlertRule,
  CorporateAction,
  EarningsRow,
  FairValueEstimate,
  Fundamentals,
  ListingSession,
  ListingSummary,
  MarketStatus,
  MeData,
  NewsItem,
  NotificationInbox,
  NotificationItem,
  Portfolio,
  PositionDetail,
  PriceTarget,
  Quote,
  RealizationAllocationView,
  RealizationView,
  SparklinePoint,
  TaxEvent,
  TransactionTaxEvent,
} from "@/lib/types"
import type { AppliedCorporateAction } from "@/app/positions/[id]/corporate-action-actions"

interface Page<TItem> {
  items: TItem[]
}

interface EventsData {
  earnings: EarningsRow[]
  corporateActions: CorporateAction[]
  news: NewsItem[]
}

interface NotificationData {
  rules: AlertRule[]
  notifications: NotificationItem[]
}

export interface PositionTaxSummary {
  net: number
  afterTaxRealized: number | null
  eventCount: number
  complete: boolean
}

type TaxAmount = Pick<TransactionTaxEvent, "id" | "direction" | "amount" | "currency" | "booking_date">

export interface AssetPositionContext {
  allocations: RealizationAllocationView | null
  /** Authoritative, UI-ready realization rows from the service (theme 3). */
  realizations: RealizationView | null
  appliedCorporateActions: AppliedCorporateAction[]
  portfolioName: string
  position: PositionDetail
  tax: PositionTaxSummary
  /** Whether lot allocations are persisted by the service vs. reconstructed (theme 5). */
  lotsPersisted: boolean
}

/** Whether the asset is held, only watched, or neither (theme 6). */
export type HoldingStatus = "held" | "watchlist_only" | "not_held"

/** Exchange-aware data-quality state for the current quote (theme 8). */
export type QuoteDataQuality =
  | "fresh"
  | "official_close"
  | "market_closed_valid"
  | "delayed"
  | "stale"
  | "missing"
  | "provider_error"

/** Combined market-session + quote-freshness status for the header badge (theme 9). */
export interface QuoteStatus {
  label: string
  tone: "positive" | "neutral" | "warning" | "critical"
  explanation: string
  quoteAsOf: string | null
  marketStatus: MarketStatus
  dataQuality: QuoteDataQuality
  isActionRequired: boolean
  provider: string | null
}

/** Aggregated, asset-global view across all visible positions (theme 4). */
export interface AssetAggregate {
  quantity: number
  currentValue: number | null
  cost: number | null
  unrealized: number | null
  realized: number | null
  fees: number | null
  tax: number
  afterTaxRealized: number | null
  totalReturnPct: number | null
  txCount: number
  perPortfolio: { portfolioId: string; portfolioName: string; value: number | null; weightPct: number | null }[]
}

/** A prioritized signal for the right sidebar (theme 14). */
export interface AttentionItem {
  type: "alert" | "event" | "data_quality"
  severity: "neutral" | "warning" | "critical"
  title: string
}

/** Empty-state metadata so the UI can explain *why* a section is empty (themes 4 + 15). */
export interface SectionStatus {
  status: "ok" | "empty" | "unavailable"
  reason: string | null
  /** Only meaningful when status is "unavailable": whether a retry might succeed. */
  retryable: boolean
}

/**
 * A fetched block that distinguishes "loaded but empty" from "could not load"
 * (theme 4). `reachable` is false when the service returned a non-2xx or the
 * fetch threw; `retryable` flags transient failures (5xx / network).
 */
interface Loadable<T> {
  value: T
  reachable: boolean
  retryable: boolean
}

export interface AssetSections {
  fundamentals: SectionStatus
  news: SectionStatus
  events: SectionStatus
  priceTargets: SectionStatus
  fairValues: SectionStatus
  alerts: SectionStatus
}

export interface AssetDetailModel {
  actionContextPath: string
  chartSeries: SparklinePoint[]
  dailyChartSeries: SparklinePoint[]
  events: EventsData
  fairValues: FairValueEstimate[]
  fundamentals: Fundamentals | null
  listing: ListingSummary | null
  listingId: string
  locale: string
  notificationData: NotificationData
  otherPortfolios: { id: string; name: string }[]
  portfolios: Portfolio[]
  positions: AssetPositionContext[]
  priceTargets: PriceTarget[]
  reportingCurrency: string
  scope: {
    kind: "position" | "portfolio" | "all" | "watchlist"
    label: string
    portfolioId?: string
  }
  session: ListingSession | null
  /** Latest listing-level quote (works for watchlist-only assets without a position). */
  quote: Quote | null
  /** Exchange-aware combined quote status for the header badge (themes 8/9). */
  quoteStatus: QuoteStatus
  /** Held / watchlist-only / not-held (theme 6). */
  holdingStatus: HoldingStatus
  /** Asset-global aggregate across visible positions (theme 4). */
  aggregate: AssetAggregate
  /** Prioritized signals for the right sidebar (theme 14). */
  attentionItems: AttentionItem[]
  /** Per-section empty-state reasons (theme 15). */
  sections: AssetSections
}

export async function fetchAssetDetailByPositionId(positionId: string): Promise<AssetDetailModel | null> {
  const [positionResponse, locale, profileResponse, portfoliosResponse] = await Promise.all([
    apiFetch(`/positions/${positionId}`, { cache: "no-store" }),
    getLocale(),
    apiFetch("/me", { cache: "no-store" }),
    apiFetch("/portfolios", { cache: "no-store" }),
  ])
  if (positionResponse.status === 404) return null

  const position = (await positionResponse.json()) as PositionDetail
  const profile = profileResponse.ok ? ((await profileResponse.json()) as MeData) : null
  const portfolios = portfoliosResponse.ok ? ((await portfoliosResponse.json()) as Portfolio[]) : []
  const reportingCurrency = position.performance.reporting_currency || profile?.preferences.reporting_currency || "EUR"
  const positionContext = await fetchPositionContext(position, reportingCurrency, portfolios)
  const common = await fetchCommonAssetData(position.listing_id, position.listing, locale, reportingCurrency, `/positions/${positionId}`)

  return {
    ...common,
    aggregate: buildAssetAggregate([positionContext]),
    holdingStatus: "held",
    otherPortfolios: portfolios
      .filter((portfolio) => portfolio.id !== position.portfolio_id)
      .map((portfolio) => ({ id: portfolio.id, name: portfolio.name })),
    portfolios,
    positions: [positionContext],
    scope: {
      kind: "position",
      label: positionContext.portfolioName,
      portfolioId: position.portfolio_id,
    },
  }
}

export async function fetchAssetDetailByListingId(listingId: string, portfolioId?: string): Promise<AssetDetailModel | null> {
  const [locale, profileResponse, portfoliosResponse, positionsResponse, listingResponse] = await Promise.all([
    getLocale(),
    apiFetch("/me", { cache: "no-store" }),
    apiFetch("/portfolios", { cache: "no-store" }),
    apiFetch(
      portfolioId ? `/positions?portfolio_id=${portfolioId}&listing_id=${listingId}` : `/positions?listing_id=${listingId}`,
      { cache: "no-store" },
    ),
    apiFetch(`/listings?ids=${listingId}`, { cache: "no-store" }),
  ])
  const profile = profileResponse.ok ? ((await profileResponse.json()) as MeData) : null
  const portfolios = portfoliosResponse.ok ? ((await portfoliosResponse.json()) as Portfolio[]) : []
  // The portfolio service now filters by listing_id, so no client-side filter is needed.
  const matchingSummaries = positionsResponse.ok ? ((await positionsResponse.json()) as PositionDetail[]) : []
  const listing = listingResponse.ok ? ((await listingResponse.json()) as ListingSummary[])[0] ?? null : null
  const reportingCurrency = profile?.preferences.reporting_currency ?? "EUR"

  const positionResponses = await Promise.all(
    matchingSummaries.map((position) => apiFetch(`/positions/${position.id}`, { cache: "no-store" })),
  )
  const positionDetails = await Promise.all(
    positionResponses
      .filter((response) => response.ok)
      .map(async (response) => (await response.json()) as PositionDetail),
  )
  const positions = await Promise.all(positionDetails.map((position) => fetchPositionContext(position, reportingCurrency, portfolios)))
  const common = await fetchCommonAssetData(listingId, positionDetails[0]?.listing ?? listing, locale, reportingCurrency, `/assets/${listingId}`)
  const selectedPortfolio = portfolioId ? portfolios.find((portfolio) => portfolio.id === portfolioId) : undefined

  if (!common.listing && positions.length === 0) return null

  return {
    ...common,
    aggregate: buildAssetAggregate(positions),
    holdingStatus: positions.length === 0 ? "watchlist_only" : "held",
    otherPortfolios: portfolios.map((portfolio) => ({ id: portfolio.id, name: portfolio.name })),
    portfolios,
    positions,
    scope: {
      kind: positions.length === 0 ? "watchlist" : selectedPortfolio ? "portfolio" : "all",
      label: positions.length === 0 ? "Watchlist asset" : selectedPortfolio ? selectedPortfolio.name : "All portfolios",
      portfolioId,
    },
  }
}

async function fetchCommonAssetData(
  listingId: string,
  listing: ListingSummary | null,
  locale: string,
  reportingCurrency: string,
  actionContextPath: string,
): Promise<Omit<AssetDetailModel, "otherPortfolios" | "portfolios" | "positions" | "scope" | "aggregate" | "holdingStatus">> {
  const instrumentId = listing?.instrument_id ?? null
  const chartHistoryTo = new Date().toISOString().slice(0, 10)
  const [seriesResponse, dailySeriesResponse, sessionsResponse, quoteResponse, fairValuesLoad, priceTargetsLoad, fundamentalsLoad, eventsLoad, notificationLoad] = await Promise.all([
    apiFetch(`/quotes/${listingId}/series?limit=365`, { cache: "no-store" }),
    apiFetch(`/quotes/${listingId}/history?from=2000-01-01&to=${chartHistoryTo}`, { cache: "no-store" }),
    apiFetch(`/listings/sessions?ids=${listingId}`, { cache: "no-store" }),
    apiFetch(`/quotes?listing_ids=${listingId}`, { cache: "no-store" }),
    fetchInsights<FairValueEstimate>(instrumentId, "fair-values"),
    fetchPriceTargets(instrumentId, listingId),
    fetchFundamentals(instrumentId),
    fetchEventsData(instrumentId),
    fetchNotificationData(instrumentId),
  ])

  const fairValues = fairValuesLoad.value
  const priceTargets = priceTargetsLoad.value
  const fundamentals = fundamentalsLoad.value
  const events = eventsLoad.value
  const notificationData = notificationLoad.value

  const chartSeries = seriesResponse.ok ? ((await seriesResponse.json()) as SparklinePoint[]) : []
  const dailyChartSeries = dailySeriesResponse.ok
    ? ((await dailySeriesResponse.json()) as { date: string; price: string; volume: string | null }[]).map((point) => ({ time: `${point.date}T00:00:00.000Z`, price: point.price, volume: point.volume }))
    : []
  const session = sessionsResponse.ok ? ((await sessionsResponse.json()) as ListingSession[])[0] ?? null : null
  const quote = quoteResponse.ok ? ((await quoteResponse.json()) as Quote[])[0] ?? null : null
  const quoteStatus = deriveQuoteStatus(quote, session)
  const currentPrice = num(quote?.latest ?? null)
  const sections: AssetSections = {
    fundamentals: sectionStatus(fundamentalsLoad, fundamentals !== null, instrumentId, "Provider liefert keine Fundamentals"),
    news: sectionStatus(eventsLoad.news, events.news.length > 0, instrumentId, "Noch keine News synchronisiert"),
    events: sectionStatus(eventsLoad.events, events.earnings.length > 0 || events.corporateActions.length > 0, instrumentId, "Keine Events verfügbar"),
    priceTargets: sectionStatus(priceTargetsLoad, priceTargets.length > 0, instrumentId, "Noch keine Targets angelegt"),
    fairValues: sectionStatus(fairValuesLoad, fairValues.length > 0, instrumentId, "Noch keine Fair-Value-Schätzung angelegt"),
    alerts: sectionStatus(notificationLoad, notificationData.rules.length > 0, instrumentId, "Noch keine Alerts angelegt"),
  }
  const attentionItems = buildAttentionItems(quoteStatus, events, priceTargets, currentPrice, locale)

  return {
    actionContextPath,
    attentionItems,
    chartSeries,
    dailyChartSeries,
    events,
    fairValues,
    fundamentals,
    listing,
    listingId,
    locale,
    notificationData,
    priceTargets,
    quote,
    quoteStatus,
    reportingCurrency,
    sections,
    session,
  }
}

/**
 * Empty-state status that distinguishes "could not load" from "loaded but empty"
 * (theme 4). Unavailable when there is no instrument to query or the service was
 * unreachable; otherwise ok/empty based on whether any data came back.
 */
function sectionStatus(
  load: { reachable: boolean; retryable: boolean },
  hasData: boolean,
  instrumentId: string | null,
  emptyReason: string,
): SectionStatus {
  if (instrumentId === null) return { status: "unavailable", reason: "Kein Instrument verknüpft", retryable: false }
  if (!load.reachable) return { status: "unavailable", reason: "Dienst aktuell nicht erreichbar", retryable: load.retryable }
  if (hasData) return { status: "ok", reason: null, retryable: false }
  return { status: "empty", reason: emptyReason, retryable: false }
}

/**
 * Combines market-session state with quote freshness into one explainable status.
 * `delayed`/`provider_error` are reserved (no per-provider delay/error signal flows
 * to the read path today); the derivable set is fresh/official_close/
 * market_closed_valid/stale/missing.
 */
export function deriveQuoteStatus(quote: Quote | null, session: ListingSession | null): QuoteStatus {
  const marketStatus: MarketStatus = session?.status ?? "unknown"
  const quoteAsOf = quote?.latest_at ?? quote?.provider_timestamp ?? null
  const provider = quote?.provider ?? null
  const base = { quoteAsOf, marketStatus, provider }

  if (!quote || quote.latest === null) {
    return { ...base, label: "No quote", tone: "critical", explanation: "No usable quote is available for this asset.", dataQuality: "missing", isActionRequired: true }
  }

  const open = marketStatus === "open"
  const closedKnown = marketStatus === "closed" || marketStatus === "weekend" || marketStatus === "holiday"

  if (open) {
    if (quote.freshness_status === "fresh") {
      return { ...base, label: "Live", tone: "positive", explanation: "Live price during the open session.", dataQuality: "fresh", isActionRequired: false }
    }
    return { ...base, label: "Stale", tone: "warning", explanation: "The market is open but the quote is overdue.", dataQuality: "stale", isActionRequired: true }
  }

  if (closedKnown) {
    const until = session?.next_session_open ? ` until the market reopens (${session.next_session_open}).` : "."
    const dataQuality: QuoteDataQuality = marketStatus === "closed" ? "official_close" : "market_closed_valid"
    const label = marketStatus === "closed" ? "Market closed" : marketStatus === "weekend" ? "Weekend" : "Holiday"
    return { ...base, label, tone: "neutral", explanation: `Last official close is valid${until}`, dataQuality, isActionRequired: false }
  }

  // Unknown venue (e.g. crypto / 24h): freshness alone decides.
  if (quote.freshness_status === "fresh") {
    return { ...base, label: "Live", tone: "positive", explanation: "Recent price for a continuously-traded asset.", dataQuality: "fresh", isActionRequired: false }
  }
  return { ...base, label: "Stale", tone: "warning", explanation: "The latest quote is older than expected.", dataQuality: "stale", isActionRequired: true }
}

/** Prioritized sidebar signals from quote status, upcoming earnings, and target zones. */
export function buildAttentionItems(
  quoteStatus: QuoteStatus,
  events: EventsData,
  priceTargets: PriceTarget[],
  currentPrice: number | null,
  locale: string,
): AttentionItem[] {
  const items: AttentionItem[] = []

  if (quoteStatus.isActionRequired) {
    items.push({ type: "data_quality", severity: quoteStatus.tone === "critical" ? "critical" : "warning", title: quoteStatus.label })
  }

  const nextEarnings = events.earnings
    .filter((row) => row.is_upcoming && row.report_date)
    .sort((a, b) => (a.report_date ?? "").localeCompare(b.report_date ?? ""))[0]
  if (nextEarnings?.report_date) {
    const days = Math.round((new Date(nextEarnings.report_date).getTime() - Date.now()) / 86_400_000)
    if (days >= 0 && days <= 30) items.push({ type: "event", severity: "neutral", title: days === 0 ? "Earnings today" : `Earnings in ${days} day${days === 1 ? "" : "s"}` })
  }

  if (currentPrice !== null) {
    const nearZone = priceTargets.some((target) => {
      const low = num(target.zone_low)
      const high = num(target.zone_high)
      if (low === null && high === null) return false
      const lo = low ?? high!
      const hi = high ?? low!
      const pad = (hi - lo || hi * 0.02) || 1
      return currentPrice >= lo - pad && currentPrice <= hi + pad
    })
    if (nearZone) items.push({ type: "alert", severity: "warning", title: "Price near target zone" })
  }

  if (items.length === 0 && !quoteStatus.isActionRequired) {
    items.push({ type: "data_quality", severity: "neutral", title: quoteStatus.label })
  }
  void locale
  return items
}

/** Asset-global aggregate across the visible positions (theme 4). */
export function buildAssetAggregate(contexts: AssetPositionContext[]): AssetAggregate {
  const currentValue = sumNullable(contexts.map((c) => num(c.position.performance.current_value_reporting)))
  const cost = sumNullable(contexts.map((c) => num(c.position.performance.open_cost_basis_reporting)))
  const unrealized = sumNullable(contexts.map((c) => num(c.position.performance.unrealized_pnl_reporting)))
  const realized = sumNullable(contexts.map((c) => num(c.position.performance.realized_pnl_reporting)))
  const fees = sumNullable(contexts.map((c) => num(c.position.performance.total_fees_reporting)))
  const quantity = contexts.reduce((sum, c) => sum + (num(c.position.performance.open_quantity) ?? 0), 0)
  const tax = contexts.reduce((sum, c) => sum + c.tax.net, 0)
  const txCount = contexts.reduce((sum, c) => sum + c.position.transactions.length, 0)
  const totalPnl = (unrealized ?? 0) + (realized ?? 0)
  const totalValue = currentValue ?? 0
  const perPortfolio = contexts.map((c) => {
    const value = num(c.position.performance.current_value_reporting)
    return {
      portfolioId: c.position.portfolio_id,
      portfolioName: c.portfolioName,
      value,
      weightPct: value !== null && totalValue > 0 ? (value / totalValue) * 100 : null,
    }
  })

  return {
    quantity,
    currentValue,
    cost,
    unrealized,
    realized,
    fees,
    tax,
    afterTaxRealized: realized === null ? null : realized - tax,
    totalReturnPct: cost !== null && cost > 0 ? (totalPnl / cost) * 100 : null,
    txCount,
    perPortfolio,
  }
}

function sumNullable(values: (number | null)[]): number | null {
  const numeric = values.filter((value): value is number => value !== null)
  if (numeric.length === 0) return null
  return numeric.reduce((sum, value) => sum + value, 0)
}

async function fetchPositionContext(position: PositionDetail, reportingCurrency: string, portfolios: Portfolio[]): Promise<AssetPositionContext> {
  const [allocationResponse, realizationsResponse, appliedCorporateActionsResponse] = await Promise.all([
    apiFetch(`/positions/${position.id}/allocations`, { cache: "no-store" }),
    apiFetch(`/positions/${position.id}/realizations`, { cache: "no-store" }),
    apiFetch(`/positions/${position.id}/corporate-actions`, { cache: "no-store" }),
  ])
  const realized = num(position.performance.realized_pnl_reporting)

  const allocations = allocationResponse.ok ? ((await allocationResponse.json()) as RealizationAllocationView) : null
  const realizations = realizationsResponse.ok ? ((await realizationsResponse.json()) as RealizationView) : null

  return {
    allocations,
    realizations,
    appliedCorporateActions: appliedCorporateActionsResponse.ok ? ((await appliedCorporateActionsResponse.json()) as AppliedCorporateAction[]) : [],
    lotsPersisted: realizations?.source === "persisted" || (allocations !== null && allocations.calculation_version !== null),
    portfolioName: portfolios.find((portfolio) => portfolio.id === position.portfolio_id)?.name ?? "Portfolio",
    position,
    tax: await fetchPositionTaxSummary(position, reportingCurrency, realized),
  }
}

/** Reachability of an apiFetch Response: non-2xx is unreachable; 5xx is retryable. */
function reachability(response: { ok: boolean; status: number }): { reachable: boolean; retryable: boolean } {
  if (response.ok) return { reachable: true, retryable: false }
  return { reachable: false, retryable: response.status >= 500 || response.status === 0 }
}

const unreachable = <T>(value: T, retryable = true): Loadable<T> => ({ value, reachable: false, retryable })

/** Price targets scoped to the listing: instrument-wide + this listing's zones (theme 5). */
async function fetchPriceTargets(instrumentId: string | null, listingId: string): Promise<Loadable<PriceTarget[]>> {
  if (!instrumentId) return { value: [], reachable: true, retryable: false }
  try {
    const response = await apiFetch(`/price-targets?instrument_id=${instrumentId}&listing_id=${listingId}`, { cache: "no-store" })
    return { value: response.ok ? ((await response.json()) as PriceTarget[]) : [], ...reachability(response) }
  } catch {
    return unreachable<PriceTarget[]>([])
  }
}

async function fetchInsights<TItem>(instrumentId: string | null, path: string): Promise<Loadable<TItem[]>> {
  if (!instrumentId) return { value: [], reachable: true, retryable: false }
  try {
    const response = await apiFetch(`/${path}?instrument_id=${instrumentId}`, { cache: "no-store" })
    return { value: response.ok ? ((await response.json()) as TItem[]) : [], ...reachability(response) }
  } catch {
    return unreachable<TItem[]>([])
  }
}

async function fetchFundamentals(instrumentId: string | null): Promise<Loadable<Fundamentals | null>> {
  if (!instrumentId) return { value: null, reachable: true, retryable: false }
  try {
    const response = await apiFetch(`/fundamentals?instrument_ids=${instrumentId}`, { cache: "no-store" })
    if (!response.ok) return { value: null, ...reachability(response) }
    const rows = (await response.json()) as Fundamentals[]
    return { value: rows[0] ?? null, reachable: true, retryable: false }
  } catch {
    return unreachable<Fundamentals | null>(null)
  }
}

/** Events split into "events" (earnings + corporate actions) and "news" reachability. */
interface EventsLoadable {
  value: EventsData
  events: { reachable: boolean; retryable: boolean }
  news: { reachable: boolean; retryable: boolean }
}

async function fetchEventsData(instrumentId: string | null): Promise<EventsLoadable> {
  const ok = { reachable: true, retryable: false }
  if (!instrumentId) return { value: { corporateActions: [], earnings: [], news: [] }, events: ok, news: ok }
  try {
    const [earningsResponse, corporateActionsResponse, newsResponse] = await Promise.all([
      apiFetch(`/events/earnings?instrument_id=${instrumentId}`, { cache: "no-store" }),
      apiFetch(`/events/corporate-actions?instrument_id=${instrumentId}`, { cache: "no-store" }),
      apiFetch(`/events/news?instrument_id=${instrumentId}&limit=8`, { cache: "no-store" }),
    ])
    const value: EventsData = {
      corporateActions: corporateActionsResponse.ok ? ((await corporateActionsResponse.json()) as Page<CorporateAction>).items : [],
      earnings: earningsResponse.ok ? ((await earningsResponse.json()) as Page<EarningsRow>).items : [],
      news: newsResponse.ok ? ((await newsResponse.json()) as NewsItem[]) : [],
    }
    // "events" reachability is the weaker of the two event endpoints.
    const events = earningsResponse.ok && corporateActionsResponse.ok
      ? ok
      : reachability(earningsResponse.ok ? corporateActionsResponse : earningsResponse)
    return { value, events, news: reachability(newsResponse) }
  } catch {
    return { value: { corporateActions: [], earnings: [], news: [] }, events: { reachable: false, retryable: true }, news: { reachable: false, retryable: true } }
  }
}

async function fetchNotificationData(instrumentId: string | null): Promise<Loadable<NotificationData>> {
  if (!instrumentId) return { value: { notifications: [], rules: [] }, reachable: true, retryable: false }
  try {
    const [rulesResponse, inboxResponse] = await Promise.all([
      // Server-side filter: this instrument's rules plus all_holdings rules (theme 6).
      apiFetch(`/notifications/rules?instrument_id=${instrumentId}`, { cache: "no-store" }),
      apiFetch("/notifications?limit=100", { cache: "no-store" }),
    ])
    const rules = rulesResponse.ok ? ((await rulesResponse.json()) as AlertRule[]) : []
    const inbox = inboxResponse.ok
      ? ((await inboxResponse.json()) as NotificationInbox)
      : { notifications: [], unread_count: 0 }

    return {
      value: {
        notifications: inbox.notifications.filter((notification) => notification.instrument_id === instrumentId),
        // Server already scoped to this instrument (+ all_holdings); the panel shows
        // instrument-specific rules, so all_holdings rules aren't editable per-asset.
        rules: rules.filter((rule) => rule.instrument_id === instrumentId),
      },
      ...reachability(rulesResponse),
    }
  } catch {
    return unreachable<NotificationData>({ notifications: [], rules: [] })
  }
}

async function fetchPositionTaxSummary(position: PositionDetail, reportingCurrency: string, realized: number | null): Promise<PositionTaxSummary> {
  let positionEvents: TaxEvent[] = []
  let complete = true
  try {
    const response = await apiFetch(`/tax-events?position_id=${position.id}`, { cache: "no-store" })
    if (response.ok) positionEvents = (await response.json()) as TaxEvent[]
    else complete = false
  } catch {
    complete = false
  }

  const events = new Map<string, TaxAmount>()
  for (const event of positionEvents) events.set(event.id, event)
  for (const transaction of position.transactions) {
    for (const event of transaction.tax_events) events.set(event.id, event)
  }

  const rateRequests = new Map<string, Promise<number | null>>()
  function rate(currency: string, date: string) {
    const key = `${currency}@${date}`
    const existing = rateRequests.get(key)
    if (existing) return existing
    const request = currency === "EUR"
      ? Promise.resolve(1)
      : apiFetch(`/fx/rate?quote=${currency}&date=${date}`, { cache: "no-store" })
          .then(async (result) => result.ok ? num(((await result.json()) as { rate: string }).rate) : null)
          .catch(() => null)
    rateRequests.set(key, request)
    return request
  }

  let net = 0
  for (const event of events.values()) {
    const [fromRate, toRate] = await Promise.all([
      rate(event.currency, event.booking_date),
      rate(reportingCurrency, event.booking_date),
    ])
    const amount = num(event.amount)
    if (amount === null || fromRate === null || toRate === null || fromRate <= 0) {
      complete = false
      continue
    }
    const converted = amount / fromRate * toRate
    net += event.direction === "withheld" ? converted : -converted
  }

  return {
    afterTaxRealized: realized === null ? null : realized - net,
    complete,
    eventCount: events.size,
    net,
  }
}
