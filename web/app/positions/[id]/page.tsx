import { notFound } from "next/navigation"
import Link from "next/link"
import { Box, Card, Chip, Stack, Typography } from "@mui/material"
import type { AlertRule, CorporateAction, EarningsRow, FairValueEstimate, Fundamentals, ListingSession, NewsItem, NotificationInbox, NotificationItem, Portfolio, PositionDetail, PriceTarget, RealizationAllocationView, SparklinePoint, TaxEvent, TransactionTaxEvent } from "@/lib/types"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { getTranslations } from "@/lib/i18n"
import { fmtCurrency, fmtPct, fmtPrice, fmtQty, num } from "@/lib/format"
import { PositionPriceChart } from "@/components/PositionPriceChart"
import { TransactionsTable } from "@/components/TransactionsTable"
import { AddTransactionModal } from "@/components/AddTransactionModal"
import { FairValueSection } from "@/components/FairValueSection"
import { FundamentalsSection } from "@/components/FundamentalsSection"
import { EventsSection, NewsSection } from "@/components/EventsSection"
import { PriceTargetsSection } from "@/components/PriceTargetsSection"
import { DeletePositionButton } from "@/components/DeletePositionButton"
import { TransferPositionControl } from "@/components/TransferPositionControl"
import { CorporateActionsManager } from "@/components/CorporateActionsManager"
import type { AppliedCorporateAction } from "@/app/positions/[id]/corporate-action-actions"
import { AssetAlerts } from "@/components/AssetAlerts"

async function fetchInsights<T>(instrumentId: string | null, path: string): Promise<T[]> {
  if (!instrumentId) return []
  const resp = await apiFetch(`/${path}?instrument_id=${instrumentId}`, { cache: "no-store" })
  return resp.ok ? ((await resp.json()) as T[]) : []
}

async function fetchFundamentals(instrumentId: string | null): Promise<Fundamentals | null> {
  if (!instrumentId) return null
  const resp = await apiFetch(`/fundamentals?instrument_ids=${instrumentId}`, { cache: "no-store" })
  if (!resp.ok) return null
  const rows = (await resp.json()) as Fundamentals[]
  return rows[0] ?? null
}

interface EventsData {
  earnings: EarningsRow[]
  corporateActions: CorporateAction[]
  news: NewsItem[]
}

interface Page<T> {
  items: T[]
}

/** Earnings, corporate actions, and news for an instrument; each degrades to []. */
async function fetchEventsData(instrumentId: string | null): Promise<EventsData> {
  if (!instrumentId) return { earnings: [], corporateActions: [], news: [] }
  const [e, c, n] = await Promise.all([
    apiFetch(`/events/earnings?instrument_id=${instrumentId}`, { cache: "no-store" }),
    apiFetch(`/events/corporate-actions?instrument_id=${instrumentId}`, { cache: "no-store" }),
    apiFetch(`/events/news?instrument_id=${instrumentId}&limit=8`, { cache: "no-store" }),
  ])
  return {
    earnings: e.ok ? ((await e.json()) as Page<EarningsRow>).items : [],
    corporateActions: c.ok ? ((await c.json()) as Page<CorporateAction>).items : [],
    news: n.ok ? ((await n.json()) as NewsItem[]) : [],
  }
}

interface NotificationData {
  rules: AlertRule[]
  notifications: NotificationItem[]
}

interface PositionTaxSummary {
  net: number
  afterTaxRealized: number | null
  eventCount: number
  complete: boolean
}

type TaxAmount = Pick<TransactionTaxEvent, "id" | "direction" | "amount" | "currency" | "booking_date">

async function fetchPositionTaxSummary(pos: PositionDetail, reportingCurrency: string, realized: number | null): Promise<PositionTaxSummary> {
  let positionEvents: TaxEvent[] = []
  let complete = true
  try {
    const response = await apiFetch(`/tax-events?position_id=${pos.id}`, { cache: "no-store" })
    if (response.ok) positionEvents = (await response.json()) as TaxEvent[]
    else complete = false
  } catch {
    complete = false
  }
  const events = new Map<string, TaxAmount>()
  for (const event of positionEvents) events.set(event.id, event)
  for (const transaction of pos.transactions) {
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
  return { net, afterTaxRealized: realized === null ? null : realized - net, eventCount: events.size, complete }
}

/** Configured rules and recent fired notifications scoped to an instrument. */
async function fetchNotificationData(instrumentId: string | null): Promise<NotificationData> {
  if (!instrumentId) return { rules: [], notifications: [] }
  try {
    const [rulesResp, inboxResp] = await Promise.all([
      apiFetch("/notifications/rules", { cache: "no-store" }),
      apiFetch("/notifications?limit=100", { cache: "no-store" }),
    ])
    const rules = rulesResp.ok ? ((await rulesResp.json()) as AlertRule[]) : []
    const inbox: NotificationInbox = inboxResp.ok
      ? ((await inboxResp.json()) as NotificationInbox)
      : { unread_count: 0, notifications: [] }
    return {
      rules: rules.filter((rule) => rule.instrument_id === instrumentId),
      notifications: inbox.notifications.filter((notification) => notification.instrument_id === instrumentId),
    }
  } catch {
    return { rules: [], notifications: [] }
  }
}

const MARKET_BADGE = {
  open: { key: "positionDetail.marketOpen", className: "bg-[color-mix(in_srgb,var(--app-positive)_16%,transparent)] text-[var(--app-positive)]" },
  closed: { key: "positionDetail.marketClosed", className: "bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]" },
  holiday: { key: "positionDetail.marketHoliday", className: "bg-[color-mix(in_srgb,var(--app-warning)_16%,transparent)] text-[var(--app-warning)]" },
  weekend: { key: "positionDetail.marketWeekend", className: "bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]" },
} as const

function MarketStatusBadge({ status, t }: { status: import("@/lib/types").MarketStatus; t: ReturnType<typeof getTranslations> }) {
  if (status === "unknown") return null
  const config = MARKET_BADGE[status]
  const color = status === "open" ? "success" : status === "holiday" ? "warning" : "default"
  return <Chip label={t(config.key)} color={color} variant="outlined" size="small" />
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Typography component="h2" sx={{ color: "var(--app-text)", fontSize: 13, fontWeight: 700 }}>
          {title}
        </Typography>
        {action}
      </Stack>
      <Box sx={{ p: 1.5 }}>{children}</Box>
    </Card>
  )
}

function Metric({ label, value, tone = "default", sub }: { label: string; value: string; tone?: "default" | "positive" | "negative"; sub?: string }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "negative" ? "var(--app-negative)" : "var(--app-text)"
  return (
    <Box sx={{ borderBottom: "1px solid var(--app-border)", px: 1.5, py: 1.25, "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</Typography>
      <Typography sx={{ color, fontSize: 14, fontWeight: 700, mt: 0.5 }} className="tabular-nums">{value}</Typography>
      {sub ? <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, mt: 0.25 }} className="tabular-nums">{sub}</Typography> : null}
    </Box>
  )
}

function FactRow({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warning" }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "negative" ? "var(--app-negative)" : tone === "warning" ? "var(--app-warning)" : "var(--app-text)"
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", py: 1, "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{label}</Typography>
      <Typography sx={{ color, fontSize: 11, fontWeight: 700, textAlign: "right" }} className="tabular-nums">{value}</Typography>
    </Stack>
  )
}

interface Props {
  params: Promise<{ id: string }>
}

export default async function PositionDetailPage({ params }: Props) {
  const t = getTranslations()
  const { id } = await params
  const [resp, locale] = await Promise.all([apiFetch(`/positions/${id}`, { cache: "no-store" }), getLocale()])
  if (resp.status === 404) notFound()

  const pos = (await resp.json()) as PositionDetail
  const instrumentId = pos.listing?.instrument_id ?? null
  const chartHistoryTo = new Date().toISOString().slice(0, 10)
  const [seriesResp, dailySeriesResp, allocationResp, portfoliosResp, sessionsResp, appliedCaResp, fairValues, priceTargets, fundamentals, events, notificationData] = await Promise.all([
    apiFetch(`/quotes/${pos.listing_id}/series?limit=365`, { cache: "no-store" }),
    apiFetch(`/quotes/${pos.listing_id}/history?from=2000-01-01&to=${chartHistoryTo}`, { cache: "no-store" }),
    apiFetch(`/positions/${pos.id}/allocations`, { cache: "no-store" }),
    apiFetch("/portfolios", { cache: "no-store" }),
    apiFetch(`/listings/sessions?ids=${pos.listing_id}`, { cache: "no-store" }),
    apiFetch(`/positions/${pos.id}/corporate-actions`, { cache: "no-store" }),
    fetchInsights<FairValueEstimate>(instrumentId, "fair-values"),
    fetchInsights<PriceTarget>(instrumentId, "price-targets"),
    fetchFundamentals(instrumentId),
    fetchEventsData(instrumentId),
    fetchNotificationData(instrumentId),
  ])
  const portfolios = portfoliosResp.ok ? ((await portfoliosResp.json()) as Portfolio[]) : []
  const otherPortfolios = portfolios.filter((p) => p.id !== pos.portfolio_id).map((p) => ({ id: p.id, name: p.name }))
  const session = sessionsResp.ok ? ((await sessionsResp.json()) as ListingSession[])[0] ?? null : null
  const appliedCorporateActions = appliedCaResp.ok ? ((await appliedCaResp.json()) as AppliedCorporateAction[]) : []
  const chartSeries = seriesResp.ok ? ((await seriesResp.json()) as SparklinePoint[]) : pos.sparkline
  const dailyChartSeries = dailySeriesResp.ok
    ? ((await dailySeriesResp.json()) as { date: string; price: string }[]).map((point) => ({ time: `${point.date}T00:00:00.000Z`, price: point.price }))
    : []
  const allocations = allocationResp.ok ? ((await allocationResp.json()) as RealizationAllocationView) : null
  const p = pos.performance
  const reporting = p.reporting_currency
  const listingCurrency = pos.listing?.currency ?? reporting
  const assetType = pos.listing?.asset_type ?? "equity"

  const price = num(p.current_price)
  const daily = num(p.daily_change_pct)
  const value = num(p.current_value_reporting)
  const cost = num(p.open_cost_basis_reporting)
  const unrealized = num(p.unrealized_pnl_reporting)
  const realized = num(p.realized_pnl_reporting)
  const unrealizedReturn = num(p.simple_return_pct)
  const realizedReturn = num(p.realized_return_pct)
  const totalReturn = num(p.total_return_pct)
  const fees = num(p.total_fees_reporting)
  const qty = num(p.open_quantity) ?? 0

  const isDailyUp = daily !== null && daily >= 0
  const isUnrealUp = unrealized !== null && unrealized >= 0
  const isClosed = pos.state === "closed"
  const averageCost = cost !== null && qty > 0 ? cost / qty : null
  const tax = await fetchPositionTaxSummary(pos, reporting, realized)

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 px-4 py-5 lg:px-6">
      <Card variant="outlined" component="header" className="flex flex-wrap items-start justify-between gap-5" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)", p: 2 }}>
        <div className="flex min-w-0 items-start gap-3">
          <Link href="/dashboard" aria-label={t("common.backToPortfolio")} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">&lt;</Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--app-text)]">{pos.listing?.name ?? pos.listing_id}</h1>
              <span className="rounded border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--app-text-muted)]">{pos.listing?.asset_type ?? "?"}</span>
              {pos.state !== "open" ? <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${pos.state === "invalid" ? "bg-[color-mix(in_srgb,var(--app-negative)_14%,transparent)] text-[var(--app-negative)]" : "bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]"}`}>{pos.state}</span> : null}
              <MarketStatusBadge status={session?.status ?? "unknown"} t={t} />
            </div>
            <p className="mt-1 text-xs font-medium text-[var(--app-text-muted)]">{pos.listing?.symbol ?? "-"} - {listingCurrency}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--app-text)]">{price !== null ? fmtPrice(locale, price, listingCurrency, assetType) : "-"}</p>
          <p className={`mt-1 text-xs font-semibold tabular-nums ${daily === null ? "text-[var(--app-text-faint)]" : isDailyUp ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{daily === null ? "Daily movement unavailable" : `${fmtPct(daily)} ${t("position.todaySuffix")}`}</p>
        </div>
      </Card>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <Card variant="outlined" component="section" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)", minWidth: 0, overflow: "hidden" }}>
          <PositionPriceChart data={chartSeries} dailyData={dailyChartSeries} currency={listingCurrency} locale={locale} dailyPositive={isDailyUp} />
        </Card>

        <Card variant="outlined" component="aside" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)", overflow: "hidden" }}>
          <div className="border-b border-[var(--app-border)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--app-text)]">Position snapshot</h2><p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">Values in {reporting}</p></div>
          <Metric label={t("position.currentValue")} value={value !== null ? fmtCurrency(locale, value, reporting) : "-"} tone={!isClosed && unrealized !== null ? (isUnrealUp ? "positive" : "negative") : "default"} />
          <Metric label={t("position.unrealizedPnl")} value={isClosed ? fmtCurrency(locale, 0, reporting) : unrealized !== null ? `${unrealized >= 0 ? "+" : ""}${fmtCurrency(locale, unrealized, reporting)}` : "-"} tone={isClosed || unrealized === null ? "default" : isUnrealUp ? "positive" : "negative"} sub={unrealizedReturn !== null && !isClosed ? fmtPct(unrealizedReturn) : undefined} />
          <Metric label={t("position.realizedPnl")} value={realized !== null ? `${realized >= 0 ? "+" : ""}${fmtCurrency(locale, realized, reporting)}` : "-"} tone={realized === null || realized === 0 ? "default" : realized > 0 ? "positive" : "negative"} sub={realizedReturn !== null ? fmtPct(realizedReturn) : undefined} />
          <Metric
            label="Recorded net tax"
            value={`${tax.net > 0 ? "+" : ""}${fmtCurrency(locale, tax.net, reporting)}`}
            tone={tax.net > 0 ? "negative" : tax.net < 0 ? "positive" : "default"}
            sub={tax.eventCount === 0 ? "No tax events recorded" : `${tax.eventCount} event${tax.eventCount === 1 ? "" : "s"}${tax.complete ? "" : " - partial FX conversion"}`}
          />
          <Metric label="Total return" value={totalReturn !== null ? fmtPct(totalReturn) : "-"} tone={totalReturn === null ? "default" : totalReturn >= 0 ? "positive" : "negative"} />
        </Card>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <Section title={t("positionDetail.transactions")} action={<AddTransactionModal positionId={pos.id} currency={listingCurrency} />}>
            <TransactionsTable transactions={pos.transactions} locale={locale} positionId={pos.id} portfolioId={pos.portfolio_id} currency={listingCurrency} reportingCurrency={reporting} assetType={assetType} allocations={allocations} />
          </Section>

          {instrumentId ? (
            <>
              <Section title={t("positionDetail.fundamentals")}><FundamentalsSection data={fundamentals} currency={listingCurrency} locale={locale} /></Section>
              <div className="grid gap-3 lg:grid-cols-2">
                <Section title={t("positionDetail.fairValue")}><FairValueSection positionId={pos.id} instrumentId={instrumentId} currency={listingCurrency} currentPrice={price} items={fairValues} /></Section>
                <Section title={t("positionDetail.priceTargets")}><PriceTargetsSection positionId={pos.id} instrumentId={instrumentId} currency={listingCurrency} currentPrice={price} items={priceTargets} /></Section>
              </div>
              <Section title={t("positionDetail.events")}><EventsSection earnings={events.earnings} corporateActions={events.corporateActions} currency={listingCurrency} locale={locale} /></Section>
              <Section title={t("events.newsTitle")}><NewsSection news={events.news} locale={locale} /></Section>
            </>
          ) : null}
        </div>

        <aside className="space-y-3">
          <Section title="Position facts">
            <FactRow label={t("position.quantity")} value={fmtQty(locale, qty, assetType)} />
            <FactRow label={t("position.costBasis")} value={cost !== null ? fmtCurrency(locale, cost, reporting) : "-"} />
            <FactRow label="Average cost" value={averageCost !== null ? fmtPrice(locale, averageCost, reporting, assetType) : "-"} />
            <FactRow label="Total fees" value={fees !== null ? fmtCurrency(locale, fees, reporting) : "-"} />
            <FactRow
              label="After-tax realized P&L"
              value={tax.afterTaxRealized !== null ? `${tax.afterTaxRealized >= 0 ? "+" : ""}${fmtCurrency(locale, tax.afterTaxRealized, reporting)}` : "-"}
              tone={tax.afterTaxRealized === null || tax.afterTaxRealized === 0 ? undefined : tax.afterTaxRealized > 0 ? "positive" : "negative"}
            />
            <FactRow label="Transactions" value={String(pos.transactions.length)} />
            <FactRow label="Quote status" value={pos.freshness_status ?? "unknown"} tone={pos.freshness_status === "fresh" ? "positive" : "warning"} />
            <FactRow label="Quote as of" value={pos.quote_as_of ? new Date(pos.quote_as_of).toLocaleDateString(locale) : "-"} />
          </Section>

          {instrumentId ? (
            <Section title="Asset alerts">
              <AssetAlerts
                positionId={pos.id}
                instrumentId={instrumentId}
                listingId={pos.listing_id}
                symbol={pos.listing?.symbol ?? pos.listing_id}
                currency={listingCurrency}
                currentPrice={price}
                locale={locale}
                rules={notificationData.rules}
                notifications={notificationData.notifications}
              />
            </Section>
          ) : null}

          <Section title="Corporate actions">
            <p className="mb-3 text-[10px] leading-4 text-[var(--app-text-muted)]">Apply splits / reverse splits to restate this holding&apos;s share count (cost basis preserved), or reverse an applied one.</p>
            <CorporateActionsManager positionId={pos.id} applied={appliedCorporateActions} available={events.corporateActions} locale={locale} />
          </Section>

          <Section title={t("positionDetail.moveTitle")}>
            <p className="mb-3 text-[10px] leading-4 text-[var(--app-text-muted)]">{t("positionDetail.moveDesc")}</p>
            <TransferPositionControl positionId={pos.id} portfolios={otherPortfolios} />
          </Section>

          <Section title={t("positionDetail.dangerZone")}>
            <p className="mb-3 text-[10px] leading-4 text-[var(--app-text-muted)]">{t("positionDetail.dangerZoneDesc")}</p>
            <DeletePositionButton positionId={pos.id} />
          </Section>
        </aside>
      </div>
    </div>
  )
}
