import { notFound } from "next/navigation"
import Link from "next/link"
import type { CorporateAction, EarningsRow, FairValueEstimate, Fundamentals, ListingDetail, NewsItem, PositionDetail, PriceTarget, SparklinePoint } from "@/lib/types"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { getTranslations } from "@/lib/i18n"
import { fmtCurrency, fmtPct, fmtQty, num } from "@/lib/format"
import { PositionPriceChart } from "@/components/PositionPriceChart"
import { TransactionsTable } from "@/components/TransactionsTable"
import { AddTransactionModal } from "@/components/AddTransactionModal"
import { ListingSettings } from "@/components/ListingSettings"
import { FairValueSection } from "@/components/FairValueSection"
import { FundamentalsSection } from "@/components/FundamentalsSection"
import { EventsSection } from "@/components/EventsSection"
import { PriceTargetsSection } from "@/components/PriceTargetsSection"
import { DeletePositionButton } from "@/components/DeletePositionButton"

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

/** Earnings, corporate actions, and news for an instrument; each degrades to []. */
async function fetchEventsData(instrumentId: string | null): Promise<EventsData> {
  if (!instrumentId) return { earnings: [], corporateActions: [], news: [] }
  const [e, c, n] = await Promise.all([
    apiFetch(`/events/earnings?instrument_id=${instrumentId}`, { cache: "no-store" }),
    apiFetch(`/events/corporate-actions?instrument_id=${instrumentId}`, { cache: "no-store" }),
    apiFetch(`/events/news?instrument_id=${instrumentId}&limit=8`, { cache: "no-store" }),
  ])
  return {
    earnings: e.ok ? ((await e.json()) as EarningsRow[]) : [],
    corporateActions: c.ok ? ((await c.json()) as CorporateAction[]) : [],
    news: n.ok ? ((await n.json()) as NewsItem[]) : [],
  }
}

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] px-4 py-3">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">{title}</h2>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function Metric({ label, value, tone = "default", sub }: { label: string; value: string; tone?: "default" | "positive" | "negative"; sub?: string }) {
  const toneClass = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="border-b border-[var(--app-border)] px-4 py-3 last:border-b-0">
      <p className="text-[9px] font-medium uppercase tracking-[0.1em] text-[var(--app-text-faint)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${toneClass}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] tabular-nums text-[var(--app-text-faint)]">{sub}</p> : null}
    </div>
  )
}

function FactRow({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" | "warning" }) {
  const toneClass = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : tone === "warning" ? "text-[var(--app-warning)]" : "text-[var(--app-text)]"
  return <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] py-2 text-[10px] last:border-0"><span className="text-[var(--app-text-muted)]">{label}</span><span className={`text-right font-medium tabular-nums ${toneClass}`}>{value}</span></div>
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
  const [listingResp, seriesResp, fairValues, priceTargets, fundamentals, events] = await Promise.all([
    apiFetch(`/listings/${pos.listing_id}`, { cache: "no-store" }),
    apiFetch(`/quotes/${pos.listing_id}/series?limit=365`, { cache: "no-store" }),
    fetchInsights<FairValueEstimate>(instrumentId, "fair-values"),
    fetchInsights<PriceTarget>(instrumentId, "price-targets"),
    fetchFundamentals(instrumentId),
    fetchEventsData(instrumentId),
  ])
  const listing = listingResp.ok ? ((await listingResp.json()) as ListingDetail) : null
  const chartSeries = seriesResp.ok ? ((await seriesResp.json()) as SparklinePoint[]) : pos.sparkline
  const p = pos.performance
  const reporting = p.reporting_currency
  const listingCurrency = pos.listing?.currency ?? reporting
  const firstTransactionDate = pos.transactions.map((transaction) => transaction.effective_at).sort()[0]?.slice(0, 10) ?? null

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

  return (
    <div className="mx-auto max-w-[1500px] space-y-3 px-4 py-5 lg:px-6">
      <header className="app-panel flex flex-wrap items-start justify-between gap-5 rounded-xl p-4">
        <div className="flex min-w-0 items-start gap-3">
          <Link href="/dashboard" aria-label={t("common.backToPortfolio")} className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">←</Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-xl font-semibold tracking-tight text-[var(--app-text)]">{pos.listing?.name ?? pos.listing_id}</h1>
              <span className="rounded border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--app-text-muted)]">{pos.listing?.asset_type ?? "?"}</span>
              {pos.state !== "open" ? <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${pos.state === "invalid" ? "bg-[color-mix(in_srgb,var(--app-negative)_14%,transparent)] text-[var(--app-negative)]" : "bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]"}`}>{pos.state}</span> : null}
            </div>
            <p className="mt-1 text-xs font-medium text-[var(--app-text-muted)]">{pos.listing?.symbol ?? "—"} · {listingCurrency}{listing?.exchange_mic ? ` · ${listing.exchange_mic}` : ""}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-semibold tabular-nums tracking-tight text-[var(--app-text)]">{price !== null ? fmtCurrency(locale, price, listingCurrency) : "—"}</p>
          <p className={`mt-1 text-xs font-semibold tabular-nums ${daily === null ? "text-[var(--app-text-faint)]" : isDailyUp ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{daily === null ? "Daily movement unavailable" : `${fmtPct(daily)} ${t("position.todaySuffix")}`}</p>
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <section className="app-panel min-w-0 overflow-hidden rounded-xl">
          <PositionPriceChart data={chartSeries} currency={listingCurrency} locale={locale} dailyPositive={isDailyUp} />
        </section>

        <aside className="app-panel overflow-hidden rounded-xl">
          <div className="border-b border-[var(--app-border)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--app-text)]">Position snapshot</h2><p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">Values in {reporting}</p></div>
          <Metric label={t("position.currentValue")} value={value !== null ? fmtCurrency(locale, value, reporting) : "—"} tone={!isClosed && unrealized !== null ? (isUnrealUp ? "positive" : "negative") : "default"} />
          <Metric label={t("position.unrealizedPnl")} value={isClosed ? fmtCurrency(locale, 0, reporting) : unrealized !== null ? `${unrealized >= 0 ? "+" : ""}${fmtCurrency(locale, unrealized, reporting)}` : "—"} tone={isClosed || unrealized === null ? "default" : isUnrealUp ? "positive" : "negative"} sub={unrealizedReturn !== null && !isClosed ? fmtPct(unrealizedReturn) : undefined} />
          <Metric label={t("position.realizedPnl")} value={realized !== null ? `${realized >= 0 ? "+" : ""}${fmtCurrency(locale, realized, reporting)}` : "—"} tone={realized === null || realized === 0 ? "default" : realized > 0 ? "positive" : "negative"} sub={realizedReturn !== null ? fmtPct(realizedReturn) : undefined} />
          <Metric label="Total return" value={totalReturn !== null ? fmtPct(totalReturn) : "—"} tone={totalReturn === null ? "default" : totalReturn >= 0 ? "positive" : "negative"} />
        </aside>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-3">
          <Section title={t("positionDetail.transactions")} action={<AddTransactionModal positionId={pos.id} currency={listingCurrency} />}>
            <TransactionsTable transactions={pos.transactions} locale={locale} positionId={pos.id} currency={listingCurrency} />
          </Section>

          {instrumentId ? (
            <>
              <Section title={t("positionDetail.fundamentals")}><FundamentalsSection data={fundamentals} currency={listingCurrency} locale={locale} /></Section>
              <div className="grid gap-3 lg:grid-cols-2">
                <Section title={t("positionDetail.fairValue")}><FairValueSection positionId={pos.id} instrumentId={instrumentId} currency={listingCurrency} currentPrice={price} items={fairValues} /></Section>
                <Section title={t("positionDetail.priceTargets")}><PriceTargetsSection positionId={pos.id} instrumentId={instrumentId} currency={listingCurrency} currentPrice={price} items={priceTargets} /></Section>
              </div>
              <Section title={t("positionDetail.events")}><EventsSection earnings={events.earnings} corporateActions={events.corporateActions} news={events.news} currency={listingCurrency} locale={locale} /></Section>
            </>
          ) : null}
        </div>

        <aside className="space-y-3">
          <Section title="Position facts">
            <FactRow label={t("position.quantity")} value={fmtQty(locale, qty, pos.listing?.asset_type ?? "equity")} />
            <FactRow label={t("position.costBasis")} value={cost !== null ? fmtCurrency(locale, cost, reporting) : "—"} />
            <FactRow label="Average cost" value={averageCost !== null ? fmtCurrency(locale, averageCost, reporting) : "—"} />
            <FactRow label="Total fees" value={fees !== null ? fmtCurrency(locale, fees, reporting) : "—"} />
            <FactRow label="Transactions" value={String(pos.transactions.length)} />
            <FactRow label="Quote status" value={pos.freshness_status ?? "unknown"} tone={pos.freshness_status === "fresh" ? "positive" : "warning"} />
            <FactRow label="Quote as of" value={pos.quote_as_of ? new Date(pos.quote_as_of).toLocaleDateString(locale) : "—"} />
          </Section>

          {listing ? <Section title={t("positionDetail.instrumentAndData")}><ListingSettings positionId={pos.id} listing={listing} instrumentName={pos.listing?.name ?? ""} firstTransactionDate={firstTransactionDate} /></Section> : null}

          <Section title={t("positionDetail.dangerZone")}>
            <p className="mb-3 text-[10px] leading-4 text-[var(--app-text-muted)]">{t("positionDetail.dangerZoneDesc")}</p>
            <DeletePositionButton positionId={pos.id} />
          </Section>
        </aside>
      </div>
    </div>
  )
}
