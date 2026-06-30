"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { AppBadge } from "@/design/components/AppBadge"
import { ControlBar } from "@/design/components/ControlBar"
import { MetricBar, MetricBarItem, type MetricBarTone } from "@/design/components/MetricBar"
import { AppIcon, type AppIconName } from "@/design/icons/AppIcon"
import { fmtPct, fmtPrice, num } from "@/lib/format"
import type {
  BenchmarkReport,
  CorporateAction,
  EarningsRow,
  ExchangeView,
  IntelligenceReport,
  NotificationInbox,
  NotificationItem,
  PerformancePeriod,
  PerformanceReport,
  Portfolio,
  PositionView,
} from "@/lib/types"
import { AddPositionModal } from "@/features/positions/components/AddPositionModal"
import { PerformanceChart } from "@/features/dashboard/components/PerformanceChart"
import { DashboardLiveRefresh } from "@/features/dashboard/components/DashboardLiveRefresh"
import { buildDashboardOverviewModel, type DashboardAssetRow as AssetRow, type DashboardDataTone as DataTone, type DashboardOverviewModel as Model } from "@/features/dashboard/model/dashboard-overview-model"
import { useDashboardPrivacy } from "./DashboardPrivacy"

type AssetSortKey = "name" | "portfolioCount" | "value" | "allocation" | "dailyPct" | "returnPct" | "dataStatus"
type SortDirection = "asc" | "desc"
const ASSET_LABELS: Record<string, string> = {
  crypto: "Crypto",
  equity: "Equities",
  fund: "Funds",
  index: "Index",
}

const COLLAPSED_TYPES_STORAGE_KEY = "dashboard-overview-collapsed-asset-types"
const SEARCH_STORAGE_KEY = "dashboard-overview-search"
const SORT_STORAGE_KEY = "dashboard-overview-asset-sort"
const PERIODS: PerformancePeriod[] = ["1W", "1M", "YTD", "1Y", "ALL"]

interface DashboardEvents {
  earnings: DashboardEarnings[]
  corporateActions: DashboardCorporateAction[]
}

interface DashboardEarnings extends EarningsRow {
  context?: EventContext
}

interface DashboardCorporateAction extends CorporateAction {
  context?: EventContext
}

interface EventContext {
  positionId: string
  name: string
  symbol: string
}

interface DashboardOverviewProperties {
  positions: PositionView[]
  portfolios: Portfolio[]
  exchanges: ExchangeView[]
  selectedPortfolioId?: string
  performance: PerformanceReport | null
  benchmark?: BenchmarkReport | null
  period: PerformancePeriod
  latestQuote?: string
  reportingCurrency: string
  locale: string
  rail?: React.ReactNode
}

export function DashboardOverview({
  positions,
  portfolios,
  exchanges,
  selectedPortfolioId,
  performance,
  benchmark,
  period,
  latestQuote,
  reportingCurrency,
  locale,
  rail,
}: DashboardOverviewProperties) {
  const model = useMemo(() => buildDashboardOverviewModel(positions, portfolios), [positions, portfolios])
  const liveListingIds = useMemo(() => positions.map((position) => position.listing_id), [positions])
  const [search, setSearch] = useState("")

  useEffect(() => {
    setSearch(localStorage.getItem(SEARCH_STORAGE_KEY) ?? "")
  }, [])

  useEffect(() => {
    localStorage.setItem(SEARCH_STORAGE_KEY, search)
  }, [search])

  return (
    <div className="min-w-0 space-y-3">
      <DashboardLiveRefresh listingIds={liveListingIds} />
      <DashboardControlStrip
        exchanges={exchanges}
        onSearchChange={setSearch}
        period={period}
        portfolios={portfolios}
        search={search}
        selectedPortfolioId={selectedPortfolioId}
      />
      <AggregatePerformance
        currency={reportingCurrency}
        latestQuote={latestQuote}
        locale={locale}
        model={model}
        performance={performance}
        period={period}
        selectedPortfolioId={selectedPortfolioId}
      />
      <MarketSnapshot currency={reportingCurrency} locale={locale} model={model} period={period} selectedPortfolioId={selectedPortfolioId} />
      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          {selectedPortfolioId ? (
            <PerformanceChart
              benchmark={benchmark ?? null}
              currency={reportingCurrency}
              defaultMode="benchmark"
              latestQuote={latestQuote}
              locale={locale}
              period={period}
              portfolioId={selectedPortfolioId}
              report={performance}
            />
          ) : (
            <PortfolioBreakdown currency={reportingCurrency} locale={locale} model={model} />
          )}
          <AssetsAcrossPortfolios currency={reportingCurrency} locale={locale} model={model} period={period} search={search} selectedPortfolioId={selectedPortfolioId} />
        </div>
        {rail ? <aside className="space-y-3">{rail}</aside> : null}
      </div>
    </div>
  )
}

export function PortfolioIntelligence({
  currency,
  events,
  intelligence,
  locale,
  notifications,
  period,
  portfolios,
  positions,
  selectedPortfolioId,
}: {
  currency: string
  events?: DashboardEvents
  intelligence: IntelligenceReport | null
  locale: string
  notifications: NotificationInbox
  period: PerformancePeriod
  portfolios: Portfolio[]
  positions: PositionView[]
  selectedPortfolioId?: string
}) {
  const model = useMemo(() => buildDashboardOverviewModel(positions, portfolios), [positions, portfolios])
  return (
    <DashboardRail
      currency={currency}
      events={events ?? { corporateActions: [], earnings: [] }}
      intelligence={intelligence}
      locale={locale}
      model={model}
      notifications={notifications}
      period={period}
      selectedPortfolioId={selectedPortfolioId}
    />
  )
}

function DashboardControlStrip({
  exchanges,
  onSearchChange,
  period,
  portfolios,
  search,
  selectedPortfolioId,
}: {
  exchanges: ExchangeView[]
  onSearchChange: (value: string) => void
  period: PerformancePeriod
  portfolios: Portfolio[]
  search: string
  selectedPortfolioId?: string
}) {
  const router = useRouter()
  const scopeTabs = useMemo(() => [
    { label: "All portfolios", value: "all" },
    ...portfolios.slice(0, 4).map((portfolio) => ({
      label: portfolio.name,
      value: portfolio.id,
    })),
  ], [portfolios])
  const activeScope = selectedPortfolioId ?? "all"

  function changeScope(value: string) {
    const nextHref = value === "all" ? "/dashboard" : `/dashboard?portfolio=${value}`
    window.location.assign(nextHref)
  }

  return (
    <ControlBar
      actions={(
        <AddPositionModal
          className="flex h-10 w-10 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--app-accent)_62%,var(--app-border))] bg-[var(--app-accent)] text-[18px] font-semibold leading-none text-white transition hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,white)]"
          exchanges={exchanges}
          label="+"
          portfolios={portfolios}
          selectedPortfolioId={selectedPortfolioId}
        />
      )}
      defaultTabValue={activeScope}
      onReload={() => router.refresh()}
      onSearchChange={onSearchChange}
      onTabChange={changeScope}
      periodAddon={<DashboardPeriodTabs period={period} selectedPortfolioId={selectedPortfolioId} />}
      reloadLabel="Reload portfolio overview"
      searchPlaceholder="Search assets or portfolios"
      searchValue={search}
      tabs={scopeTabs}
      tabValue={activeScope}
    />
  )
}

function DashboardPeriodTabs({ period, selectedPortfolioId }: { period: PerformancePeriod; selectedPortfolioId?: string }) {
  return (
    <div className="flex overflow-hidden rounded-md border border-[var(--app-border)]">
      {PERIODS.map((item) => (
        <Link
          className={`flex h-9 min-w-11 items-center justify-center px-3 text-[12px] font-semibold transition ${
            item === period
              ? "bg-[var(--app-accent)] text-white"
              : "bg-[var(--app-surface-panel)] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
          }`}
          href={periodHref(selectedPortfolioId, item)}
          key={item}
        >
          {item}
        </Link>
      ))}
    </div>
  )
}

function AggregatePerformance({
  currency,
  latestQuote,
  locale,
  model,
  performance,
}: {
  currency: string
  latestQuote?: string
  locale: string
  model: Model
  performance: PerformanceReport | null
  period: PerformancePeriod
  selectedPortfolioId?: string
}) {
  const { hidden, currency: privateCurrency } = useDashboardPrivacy()
  const lastPoint = performance?.points.at(-1)
  const value = lastPoint ? (num(lastPoint.value) ?? model.totalValue) : model.totalValue
  const invested = lastPoint ? (num(lastPoint.invested_capital) ?? model.invested) : model.invested
  const totalPnl = lastPoint ? (num(lastPoint.total_pnl) ?? model.totalPnl) : model.totalPnl
  const returnPct = invested > 0 ? (totalPnl / invested) * 100 : model.returnPct
  const today = model.dailyAmount
  const positive = totalPnl >= 0

  return (
    <MetricBar columns={{ xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }}>
        <MetricBlock
          icon="value"
          label="Total value"
          primary
          sub={latestQuote ? `Quotes ${new Date(latestQuote).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}` : `${model.openAssetRows.length} assets / ${model.byPortfolio.length} portfolios`}
          value={privateCurrency(locale, value, currency)}
        />
        <MetricBlock icon="invested" label="Invested" sub="Open cost basis" value={privateCurrency(locale, invested, currency)} />
        <MetricBlock
          icon="return"
          label="Total return"
          tone={positive ? "positive" : "negative"}
          sub={returnPct === null ? "Return unavailable" : fmtPct(returnPct)}
          value={`${!hidden && totalPnl >= 0 ? "+" : ""}${privateCurrency(locale, totalPnl, currency)}`}
        />
        <MetricBlock
          icon="today"
          label="Today"
          tone={today !== null && today < 0 ? "negative" : "positive"}
          sub={model.dailyPct === null ? "No intraday moves" : fmtPct(model.dailyPct)}
          value={today === null ? "-" : `${!hidden && today >= 0 ? "+" : ""}${privateCurrency(locale, today, currency)}`}
        />
        <MetricBlock icon="cash" label="Cash" sub="Not allocated to risk assets" value={privateCurrency(locale, model.cash, currency)} />
        <MetricBlock
          icon="quality"
          label="Data quality"
          tone={model.warningRows.length > 0 || model.invalidCount > 0 ? "warning" : "positive"}
          sub={model.neutralRows.length > 0 ? `${model.neutralRows.length} exchange-aware neutral` : "No action needed"}
          value={model.warningRows.length > 0 || model.invalidCount > 0 ? "Review" : "Healthy"}
        />
    </MetricBar>
  )
}

type OverviewIconKind = "breadth" | "cash" | "exposure" | "gain" | "impact" | "invested" | "loss" | "quality" | "return" | "sentiment" | "today" | "value"
type OverviewTone = "positive" | "negative" | "warning"

function MetricBlock({
  href,
  icon,
  label,
  primary,
  sub,
  tone,
  value,
}: {
  href?: string
  icon: OverviewIconKind
  label: string
  primary?: boolean
  sub: string
  tone?: OverviewTone
  value: string
}) {
  const item = (
    <MetricBarItem
      icon={<AppIcon name={overviewIconName(icon)} />}
      label={label}
      primary={primary}
      sub={sub}
      tone={overviewMetricTone(tone)}
      value={value}
    />
  )
  if (!href) return item
  return (
    <Link className="group block min-w-0 outline-none focus-visible:ring-2 focus-visible:ring-[var(--app-accent)] focus-visible:ring-offset-0 [&>div]:h-full [&>div]:transition [&>div]:group-hover:bg-[var(--app-surface-hover)]" href={href}>
      {item}
    </Link>
  )
}

function MarketSnapshot({ currency, locale, model, period, selectedPortfolioId }: { currency: string; locale: string; model: Model; period: PerformancePeriod; selectedPortfolioId?: string }) {
  const { hidden, currency: privateCurrency } = useDashboardPrivacy()
  const sentiment = marketSentiment(model)
  const largestType = model.byType[0]
  const largestImpact = model.biggestMover
  const largestImpactAmount = largestImpact?.dailyAmount ?? null
  const largestImpactPct = largestImpactAmount !== null ? dailyContributionPct(model.totalValue, model.dailyAmount, largestImpactAmount) : null
  return (
    <MetricBar columns={{ xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", xl: "repeat(6, minmax(0, 1fr))" }}>
        <SnapshotItem icon="breadth" label="Breadth" value={`${model.gainers} up / ${model.losers} down`} sub={`${model.unchanged} unchanged`} />
        <SnapshotItem
          href={model.biggestGainer ? assetDetailHref(model.biggestGainer.listingId, selectedPortfolioId, period) : undefined}
          icon="gain"
          label="Top gainer"
          tone="positive"
          value={model.biggestGainer?.name ?? "-"}
          sub={model.biggestGainer?.dailyPct == null ? "No gainers" : fmtPct(model.biggestGainer.dailyPct)}
        />
        <SnapshotItem
          href={model.biggestLoser ? assetDetailHref(model.biggestLoser.listingId, selectedPortfolioId, period) : undefined}
          icon="loss"
          label="Top loser"
          tone="negative"
          value={model.biggestLoser?.name ?? "-"}
          sub={model.biggestLoser?.dailyPct == null ? "No losers" : fmtPct(model.biggestLoser.dailyPct)}
        />
        <SnapshotItem
          icon="impact"
          label="Largest impact"
          tone={largestImpactAmount !== null && largestImpactAmount < 0 ? "negative" : "positive"}
          value={largestImpactAmount === null ? "-" : `${!hidden && largestImpactAmount >= 0 ? "+" : ""}${privateCurrency(locale, largestImpactAmount, currency)}`}
          sub={largestImpactAmount === null ? "No movement" : `${largestImpactPct === null ? "-" : fmtPct(largestImpactPct)} · ${largestImpact?.name ?? "Unknown asset"}`}
        />
        <SnapshotItem icon="sentiment" label="Sentiment" tone={sentiment.tone === "danger" ? "negative" : sentiment.tone === "success" ? "positive" : undefined} value={sentiment.label} sub={`${period} held assets`} />
        <SnapshotItem icon="exposure" label="Main exposure" value={largestType ? ASSET_LABELS[largestType[0]] ?? largestType[0] : "-"} sub={largestType ? privateCurrency(locale, largestType[1], currency) : "No exposure"} />
    </MetricBar>
  )
}

function dailyContributionPct(currentTotalValue: number, totalDailyAmount: number | null, contributionAmount: number): number | null {
  if (totalDailyAmount === null) return null
  const previousTotalValue = currentTotalValue - totalDailyAmount
  if (previousTotalValue <= 0) return null
  return (contributionAmount / previousTotalValue) * 100
}

function SnapshotItem({ href, icon, label, sub, tone, value }: { href?: string; icon: OverviewIconKind; label: string; sub: string; tone?: OverviewTone; value: string }) {
  return <MetricBlock href={href} icon={icon} label={label} sub={sub} tone={tone} value={value} />
}

function overviewMetricTone(tone?: OverviewTone): MetricBarTone {
  if (tone === "positive") return "positive"
  if (tone === "negative") return "danger"
  if (tone === "warning") return "warning"
  return "accent"
}

function overviewIconName(kind: OverviewIconKind): AppIconName {
  if (kind === "gain") return "trendUp"
  if (kind === "loss") return "trendDown"
  if (kind === "quality") return "check"
  if (kind === "cash") return "cash"
  if (kind === "sentiment" || kind === "breadth") return "list"
  return "value"
}

function PortfolioBreakdown({ currency, locale, model }: { currency: string; locale: string; model: Model }) {
  const { currency: privateCurrency } = useDashboardPrivacy()
  if (model.byPortfolio.length === 0) return null
  return (
    <section className="app-panel overflow-hidden rounded-lg">
      <CardHeader title="Portfolio breakdown" subtitle="Real portfolios only; watchlist is excluded from value and exposure." />
      <div className="overflow-x-auto">
        <div className="min-w-[680px]">
          <div className="grid grid-cols-[minmax(220px,1.4fr)_130px_160px_120px] gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-inset)] px-4 py-2 text-[10.5px] font-semibold text-[var(--app-text-faint)]">
            <span>Portfolio</span>
            <span className="text-right">Value</span>
            <span className="text-right">Share</span>
            <span className="text-right">Return</span>
          </div>
          {model.byPortfolio.map((portfolio) => (
            <div className="grid grid-cols-[minmax(220px,1.4fr)_130px_160px_120px] items-center gap-3 border-b border-[var(--app-border)] px-4 py-2.5 last:border-b-0" key={portfolio.id}>
              <span className="truncate text-[13px] font-semibold text-[var(--app-text)]">{portfolio.name}</span>
              <span className="text-right text-[13px] font-semibold tabular-nums text-[var(--app-text)]">{privateCurrency(locale, portfolio.value, currency)}</span>
              <span className="flex items-center justify-end gap-2">
                <span className="h-1.5 w-20 overflow-hidden rounded-full bg-[var(--app-border)]">
                  <span className="block h-full rounded-full bg-[var(--app-accent)]" style={{ width: `${Math.min(100, portfolio.allocation)}%` }} />
                </span>
                <span className="w-10 text-right text-[11px] font-medium tabular-nums text-[var(--app-text-muted)]">{portfolio.allocation.toFixed(1)}%</span>
              </span>
              <span className={`text-right text-[13px] font-semibold tabular-nums ${portfolio.returnPct === null ? "text-[var(--app-text-faint)]" : portfolio.returnPct >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
                {portfolio.returnPct === null ? "-" : fmtPct(portfolio.returnPct)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function AssetsAcrossPortfolios({
  currency,
  locale,
  model,
  period,
  search,
  selectedPortfolioId,
}: {
  currency: string
  locale: string
  model: Model
  period: PerformancePeriod
  search: string
  selectedPortfolioId?: string
}) {
  const [sortKey, setSortKey] = useState<AssetSortKey>("value")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(() => new Set())
  const normalizedSearch = search.trim().toLowerCase()

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_TYPES_STORAGE_KEY) ?? "[]") as unknown
      if (Array.isArray(saved) && saved.every((type) => typeof type === "string")) setCollapsedTypes(new Set(saved))
    } catch {
      localStorage.removeItem(COLLAPSED_TYPES_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(SORT_STORAGE_KEY) ?? "null") as unknown
      if (isDashboardSortState(saved)) {
        setSortKey(saved.key)
        setSortDirection(saved.direction)
      }
    } catch {
      localStorage.removeItem(SORT_STORAGE_KEY)
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(SORT_STORAGE_KEY, JSON.stringify({ direction: sortDirection, key: sortKey }))
  }, [sortDirection, sortKey])

  const filteredRows = useMemo(() => {
    if (!normalizedSearch) return model.openAssetRows
    return model.openAssetRows.filter((row) => assetRowMatchesSearch(row, normalizedSearch))
  }, [model.openAssetRows, normalizedSearch])

  const grouped = useMemo(() => Object.entries(filteredRows.reduce<Record<string, AssetRow[]>>((acc, row) => {
    ;(acc[row.type] ??= []).push(row)
    return acc
  }, {})).map(([type, rows]) => [type, [...rows].sort((a, b) => compareAssetRows(a, b, sortKey, sortDirection))] as const), [filteredRows, sortDirection, sortKey])

  function changeSort(nextKey: AssetSortKey) {
    if (nextKey === sortKey) {
      setSortDirection((current) => current === "asc" ? "desc" : "asc")
      return
    }
    setSortKey(nextKey)
    setSortDirection(nextKey === "name" ? "asc" : "desc")
  }

  function toggleType(type: string) {
    setCollapsedTypes((current) => {
      const next = new Set(current)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      localStorage.setItem(COLLAPSED_TYPES_STORAGE_KEY, JSON.stringify([...next]))
      return next
    })
  }

  return (
    <section className="app-panel overflow-hidden rounded-lg">
      <CardHeader title="Assets across portfolios" subtitle="Aggregated holdings only; watchlist entries are not portfolios and are not included.">
        <AppBadge kind="count" label={normalizedSearch ? `${filteredRows.length} of ${model.openAssetRows.length}` : String(model.openAssetRows.length)} tone="accent" />
      </CardHeader>
      <div className="overflow-x-auto">
        <div className="min-w-[1060px]">
          <div className="grid grid-cols-[minmax(250px,1.7fr)_180px_120px_130px_110px_120px_150px] gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-inset)] px-4 py-2">
            <SortButton activeKey={sortKey} direction={sortDirection} label="Asset" onSort={changeSort} sortKey="name" />
            <SortButton activeKey={sortKey} direction={sortDirection} label="Portfolios" onSort={changeSort} sortKey="portfolioCount" />
            <SortButton activeKey={sortKey} align="right" direction={sortDirection} label="Value" onSort={changeSort} sortKey="value" />
            <SortButton activeKey={sortKey} align="right" direction={sortDirection} label="Allocation" onSort={changeSort} sortKey="allocation" />
            <SortButton activeKey={sortKey} align="right" direction={sortDirection} label="Today" onSort={changeSort} sortKey="dailyPct" />
            <SortButton activeKey={sortKey} align="right" direction={sortDirection} label="Return" onSort={changeSort} sortKey="returnPct" />
            <SortButton activeKey={sortKey} align="right" direction={sortDirection} label="Data" onSort={changeSort} sortKey="dataStatus" />
          </div>
          {grouped.map(([type, rows]) => {
            const isCollapsed = !normalizedSearch && collapsedTypes.has(type)
            return (
              <div key={type}>
                <button
                  aria-expanded={!isCollapsed}
                  className="grid w-full grid-cols-[minmax(250px,1.7fr)_180px_120px_130px_110px_120px_150px] items-center gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-header)] px-4 py-2 text-left transition hover:bg-[var(--app-surface-hover)]"
                  onClick={() => toggleType(type)}
                  type="button"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="w-3 text-[11px] text-[var(--app-text-faint)]">{isCollapsed ? "+" : "-"}</span>
                    <span className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">{ASSET_LABELS[type] ?? type}</span>
                    <AppBadge kind="count" label={String(rows.length)} tone="accent" />
                  </span>
                  <span />
                  <span className="text-right text-[12px] font-semibold tabular-nums text-[var(--app-text-muted)]">{formatGroupValue(locale, currency, rows)}</span>
                  <span className="text-right text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">{formatGroupAllocation(rows)}</span>
                </button>
                {!isCollapsed ? rows.map((row) => <AssetTableRow currency={currency} key={row.key} locale={locale} period={period} row={row} selectedPortfolioId={selectedPortfolioId} />) : null}
              </div>
            )
          })}
          {grouped.length === 0 ? (
            <div className="border-b border-[var(--app-border)] px-4 py-10 text-center text-[12px] font-medium text-[var(--app-text-muted)]">
              No holdings match this search.
            </div>
          ) : null}
        </div>
      </div>
    </section>
  )
}

function SortButton({
  activeKey,
  align = "left",
  direction,
  label,
  onSort,
  sortKey,
}: {
  activeKey: AssetSortKey
  align?: "left" | "right"
  direction: SortDirection
  label: string
  onSort: (key: AssetSortKey) => void
  sortKey: AssetSortKey
}) {
  const active = activeKey === sortKey
  return (
    <button
      className={`flex items-center gap-1 text-[10.5px] font-semibold text-[var(--app-text-faint)] transition hover:text-[var(--app-text-muted)] ${align === "right" ? "justify-end text-right" : ""}`}
      onClick={() => onSort(sortKey)}
      type="button"
    >
      {label}
      <span className={active ? "text-[var(--app-accent)]" : "text-transparent"}>{direction === "asc" ? "^" : "v"}</span>
    </button>
  )
}

function AssetTableRow({ currency, locale, period, row, selectedPortfolioId }: { currency: string; locale: string; period: PerformancePeriod; row: AssetRow; selectedPortfolioId?: string }) {
  const { currency: privateCurrency } = useDashboardPrivacy()
  const positive = row.pnl >= 0
  const dailyPositive = (row.dailyPct ?? 0) >= 0
  return (
    <Link
      className="grid grid-cols-[minmax(250px,1.7fr)_180px_120px_130px_110px_120px_150px] items-center gap-3 border-b border-[var(--app-border)] px-4 py-2.5 transition last:border-b-0 hover:bg-[var(--app-surface-hover)]"
      href={assetDetailHref(row.listingId, selectedPortfolioId, period)}
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[10px] font-bold text-[var(--app-accent)]">{row.symbol.slice(0, 3)}</span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--app-text)]">{row.name}</span>
          <span className="mt-0.5 block truncate text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">
            {row.symbol} · {row.price === null ? "No price" : fmtPrice(locale, row.price, row.currency, row.type)}
          </span>
        </span>
      </span>
      <span className="flex min-w-0 flex-wrap gap-1">
        {row.portfolios.slice(0, 2).map((portfolio) => (
          <AppBadge key={portfolio.id} kind="category" label={portfolio.name} tone="neutral" />
        ))}
        {row.portfolios.length > 2 ? <AppBadge kind="count" label={`+${row.portfolios.length - 2}`} tone="accent" /> : null}
      </span>
      <span className="text-right text-[13px] font-semibold tabular-nums text-[var(--app-text)]">{privateCurrency(locale, row.value, currency)}</span>
      <span className="flex min-w-0 items-center justify-end gap-2">
        <span className="h-1.5 w-16 overflow-hidden rounded-full bg-[var(--app-border)]">
          <span className="block h-full rounded-full bg-[var(--app-accent)]" style={{ width: `${Math.min(100, row.allocation)}%` }} />
        </span>
        <span className="w-10 text-right text-[11px] font-medium tabular-nums text-[var(--app-text-muted)]">{row.allocation.toFixed(1)}%</span>
      </span>
      <span className={`text-right text-[13px] font-semibold tabular-nums ${row.dailyPct === null ? "text-[var(--app-text-faint)]" : dailyPositive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
        {row.dailyPct === null ? "-" : fmtPct(row.dailyPct)}
      </span>
      <span className={`text-right text-[13px] font-semibold tabular-nums ${positive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{row.returnPct === null ? "-" : fmtPct(row.returnPct)}</span>
      <span className="flex justify-end">
        <AppBadge kind="status" label={row.dataStatus.label} tone={toneToBadge(row.dataStatus.tone)} title={row.dataStatus.detail} />
      </span>
    </Link>
  )
}

function DashboardRail({
  currency,
  events,
  intelligence,
  locale,
  model,
  notifications,
  period,
  selectedPortfolioId,
}: {
  currency: string
  events: DashboardEvents
  intelligence: IntelligenceReport | null
  locale: string
  model: Model
  notifications: NotificationInbox
  period: PerformancePeriod
  selectedPortfolioId?: string
}) {
  const sentiment = marketSentiment(model)
  const returnHref = dashboardReturnHref(selectedPortfolioId, period)
  return (
    <div className="space-y-3">
      <MarketSentimentRail currency={currency} locale={locale} model={model} sentiment={sentiment} />
      <NotificationsRail inbox={notifications} model={model} locale={locale} returnHref={returnHref} />
      <EventsRail events={events} locale={locale} returnHref={returnHref} />
      <DataQualityRail intelligence={intelligence} model={model} />
    </div>
  )
}

function EventsRail({ events, locale, returnHref }: { events: DashboardEvents; locale: string; returnHref: string }) {
  const today = new Date().toISOString().slice(0, 10)
  const rows = [
    ...events.earnings
      .filter((event) => event.context && event.report_date && event.report_date >= today)
      .map((event) => ({
        date: event.report_date!,
        href: positionDetailHref(event.context!.positionId, returnHref),
        kind: "Earnings",
        name: event.context!.name,
        symbol: event.context!.symbol,
      })),
    ...events.corporateActions
      .filter((event) => event.context && event.ex_date >= today)
      .map((event) => ({
        date: event.ex_date,
        href: positionDetailHref(event.context!.positionId, returnHref),
        kind: event.type === "dividend" ? "Dividend" : event.type,
        name: event.context!.name,
        symbol: event.context!.symbol,
      })),
  ].sort((a, b) => a.date.localeCompare(b.date)).slice(0, 6)

  return (
    <RailCard title="Upcoming events" subtitle="Across real portfolio holdings" action={<Link className="text-[10.5px] font-semibold text-[var(--app-accent)] hover:underline" href="/events">All</Link>}>
      {rows.length > 0 ? (
        <ul>
          {rows.map((row) => (
            <li className="border-b border-[var(--app-border)] last:border-b-0" key={`${row.kind}:${row.date}:${row.name}`}>
              <Link className="grid grid-cols-[74px_minmax(0,1fr)_76px] items-center gap-2 px-3 py-2.5 transition hover:bg-[var(--app-surface-hover)]" href={row.href}>
                <span className="text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">{formatEventDate(locale, row.date)}</span>
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--app-text)]">{row.name}</span>
                  <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--app-text-muted)]">{row.symbol}</span>
                </span>
                <span className="justify-self-end">
                  <AppBadge kind="category" label={row.kind} tone={row.kind === "Dividend" ? "success" : "accent"} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-3 py-8 text-center text-[11px] font-medium text-[var(--app-text-muted)]">No upcoming events for held assets.</p>
      )}
    </RailCard>
  )
}

function DataQualityRail({ intelligence, model }: { intelligence: IntelligenceReport | null; model: Model }) {
  const quality = intelligence?.components.data_quality
  const warningCount = model.warningRows.length + model.invalidCount
  const healthy = warningCount === 0
  return (
    <RailCard title="Data quality" subtitle="Exchange-aware quote coverage">
      <div className="px-3 py-3">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <p className="text-[22px] font-semibold tabular-nums leading-none text-[var(--app-text)]">{quality?.score ?? (healthy ? 100 : "-")}</p>
            <p className="mt-1 text-[10.5px] font-medium text-[var(--app-text-faint)]">Quality score</p>
          </div>
          <AppBadge kind="status" label={healthy ? "Healthy" : "Review"} tone={healthy ? "success" : "warning"} />
        </div>
        <div className="space-y-2">
          <QualityRow label="Priced value" value={quality ? `${quality.priced_value_pct.toFixed(1)}%` : "Unavailable"} warning={quality ? quality.priced_value_pct < 100 : false} />
          <QualityRow label="Exchange-aware neutral" value={String(model.neutralRows.length)} />
          <QualityRow label="Actionable feed issues" value={String(model.warningRows.length)} warning={model.warningRows.length > 0} />
          <QualityRow label="Invalid positions" value={String(model.invalidCount)} warning={model.invalidCount > 0} />
        </div>
        <p className="mt-3 border-t border-[var(--app-border)] pt-3 text-[10.5px] font-medium leading-4 text-[var(--app-text-muted)]">
          Market closed and last official close states are expected; they do not reduce this overview's quality signal.
        </p>
      </div>
    </RailCard>
  )
}

function MarketSentimentRail({ currency, locale, model, sentiment }: { currency: string; locale: string; model: Model; sentiment: ReturnType<typeof marketSentiment> }) {
  const { currency: privateCurrency } = useDashboardPrivacy()
  const total = Math.max(1, model.gainers + model.losers + model.unchanged)
  return (
    <RailCard title="Market sentiment" subtitle="Held assets only">
      <div className="px-3 py-3">
        <div className="flex items-center justify-between gap-3">
          <AppBadge kind="status" label={sentiment.label} tone={sentiment.tone} />
          <span className="text-[13px] font-semibold tabular-nums text-[var(--app-text)]">{model.dailyAmount === null ? "-" : privateCurrency(locale, model.dailyAmount, currency)}</span>
        </div>
        <div className="mt-3 flex h-2 overflow-hidden rounded-full bg-[var(--app-border)]">
          <span className="bg-[var(--app-positive)]" style={{ width: `${(model.gainers / total) * 100}%` }} />
          <span className="bg-[var(--app-text-faint)]" style={{ width: `${(model.unchanged / total) * 100}%` }} />
          <span className="bg-[var(--app-negative)]" style={{ width: `${(model.losers / total) * 100}%` }} />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <SentimentMetric label="Up" tone="positive" value={model.gainers} />
          <SentimentMetric label="Flat" value={model.unchanged} />
          <SentimentMetric label="Down" tone="negative" value={model.losers} />
        </div>
      </div>
    </RailCard>
  )
}

function SentimentMetric({ label, tone, value }: { label: string; tone?: "positive" | "negative"; value: number }) {
  const color = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"
  return (
    <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-2 py-2">
      <p className={`text-[14px] font-semibold tabular-nums ${color}`}>{value}</p>
      <p className="text-[10.5px] font-medium text-[var(--app-text-faint)]">{label}</p>
    </div>
  )
}

function NotificationsRail({ inbox, locale, model, returnHref }: { inbox: NotificationInbox; locale: string; model: Model; returnHref: string }) {
  const listingIds = new Set(model.assetRows.map((row) => row.listingId))
  const positionByListing = new Map(model.assetRows.map((row) => [row.listingId, row.positionId]))
  const assetByListing = new Map(model.assetRows.map((row) => [row.listingId, row]))
  const assetByInstrument = new Map(model.assetRows.map((row) => [row.key, row]))
  const unread = inbox.notifications
    .filter((item) => item.read_at === null)
    .sort((a, b) => Number(Boolean(b.listing_id && listingIds.has(b.listing_id))) - Number(Boolean(a.listing_id && listingIds.has(a.listing_id))))
    .slice(0, 3)

  return (
    <RailCard title="Notifications" subtitle="Unread holding alerts" action={<Link className="text-[10.5px] font-semibold text-[var(--app-accent)] hover:underline" href="/notifications">All</Link>}>
      {unread.length > 0 ? (
        <ul>
          {unread.map((item) => {
            const asset = findNotificationAsset(item, assetByListing, assetByInstrument)
            return (
              <NotificationRow
                assetName={asset?.name ?? item.title}
                assetSymbol={asset?.symbol}
                item={item}
                key={item.id}
                locale={locale}
                positionId={item.listing_id ? positionByListing.get(item.listing_id) : asset?.positionId}
                returnHref={returnHref}
              />
            )
          })}
        </ul>
      ) : (
        <p className="px-3 py-8 text-center text-[11px] font-medium text-[var(--app-text-muted)]">No unread notifications.</p>
      )}
    </RailCard>
  )
}

function NotificationRow({
  assetName,
  assetSymbol,
  item,
  locale,
  positionId,
  returnHref,
}: {
  assetName: string
  assetSymbol?: string
  item: NotificationItem
  locale: string
  positionId?: string
  returnHref: string
}) {
  const href = positionId ? positionDetailHref(positionId, returnHref) : "/notifications"
  const tone = item.severity === "critical" ? "danger" : item.severity === "warning" ? "warning" : "accent"
  const notificationTitle = formatNotificationSummary(item.title, assetSymbol, assetName)
  return (
    <li className="border-b border-[var(--app-border)] last:border-b-0">
      <Link className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2.5 transition hover:bg-[var(--app-surface-hover)]" href={href}>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--app-text)]">{assetName}</span>
          <span className="mt-0.5 block truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">
            {notificationTitle} - {new Date(item.created_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}
          </span>
        </span>
        <AppBadge kind="status" label={item.severity} tone={tone} />
      </Link>
    </li>
  )
}

function formatNotificationSummary(title: string, assetSymbol: string | undefined, assetName: string): string {
  const trimmed = title.trim()
  const withoutSymbol = assetSymbol ? removeLeadingAssetLabel(trimmed, assetSymbol) : trimmed
  const withoutName = removeLeadingAssetLabel(withoutSymbol, assetName)
  return withoutName.length > 0 ? withoutName : trimmed
}

function removeLeadingAssetLabel(value: string, label: string): string {
  const normalized = label.trim()
  if (!normalized) return value
  if (value.toLowerCase() === normalized.toLowerCase()) return ""
  if (!value.toLowerCase().startsWith(`${normalized.toLowerCase()} `)) return value
  return value.slice(normalized.length).trim()
}

function findNotificationAsset(
  item: NotificationItem,
  assetByListing: Map<string, AssetRow>,
  assetByInstrument: Map<string, AssetRow>,
): AssetRow | undefined {
  if (item.listing_id) {
    const byListing = assetByListing.get(item.listing_id)
    if (byListing) return byListing
  }
  if (item.instrument_id) return assetByInstrument.get(item.instrument_id)
  return undefined
}

function RailCard({ action, children, subtitle, title }: { action?: React.ReactNode; children: React.ReactNode; subtitle?: string; title: string }) {
  return (
    <section className="app-panel overflow-hidden rounded-lg">
      <CardHeader action={action} subtitle={subtitle} title={title} />
      {children}
    </section>
  )
}

function CardHeader({ action, children, subtitle, title }: { action?: React.ReactNode; children?: React.ReactNode; subtitle?: string; title: string }) {
  return (
    <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <h2 className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">{title}</h2>
        {subtitle ? <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">{subtitle}</p> : null}
      </div>
      {children ?? action}
    </div>
  )
}

function QualityRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] pb-2 text-[10.5px] last:border-0 last:pb-0">
      <span className="font-medium text-[var(--app-text-muted)]">{label}</span>
      <span className={`font-semibold tabular-nums ${warning ? "text-[var(--app-warning)]" : "text-[var(--app-text)]"}`}>{value}</span>
    </div>
  )
}

function marketSentiment(model: Model): { label: string; tone: "success" | "warning" | "danger" | "neutral" | "accent" } {
  const net = model.gainers - model.losers
  if (model.openAssetRows.length === 0) return { label: "No exposure", tone: "neutral" }
  if (net >= Math.ceil(model.openAssetRows.length * 0.25)) return { label: "Constructive", tone: "success" }
  if (net <= -Math.ceil(model.openAssetRows.length * 0.25)) return { label: "Defensive", tone: "danger" }
  return { label: "Mixed", tone: "accent" }
}

function assetRowMatchesSearch(row: AssetRow, query: string): boolean {
  return [
    row.name,
    row.symbol,
    row.currency,
    row.type,
    row.dataStatus.label,
    row.dataStatus.detail,
    ...row.portfolios.map((portfolio) => portfolio.name),
  ]
    .join(" ")
    .toLowerCase()
    .includes(query)
}

function isDashboardSortState(value: unknown): value is { direction: SortDirection; key: AssetSortKey } {
  if (!value || typeof value !== "object") return false
  const state = value as { direction?: unknown; key?: unknown }
  return isAssetSortKey(state.key) && (state.direction === "asc" || state.direction === "desc")
}

function isAssetSortKey(value: unknown): value is AssetSortKey {
  return value === "name"
    || value === "portfolioCount"
    || value === "value"
    || value === "allocation"
    || value === "dailyPct"
    || value === "returnPct"
    || value === "dataStatus"
}

function compareAssetRows(a: AssetRow, b: AssetRow, key: AssetSortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1
  if (key === "name") return a.name.localeCompare(b.name) * multiplier
  if (key === "portfolioCount") return (a.portfolios.length - b.portfolios.length) * multiplier
  if (key === "dataStatus") return (a.dataStatus.rank - b.dataStatus.rank) * multiplier
  const aValue = a[key] ?? Number.NEGATIVE_INFINITY
  const bValue = b[key] ?? Number.NEGATIVE_INFINITY
  return (aValue - bValue) * multiplier
}

function toneToBadge(tone: DataTone): "success" | "warning" | "danger" | "neutral" {
  if (tone === "danger") return "danger"
  if (tone === "success") return "success"
  if (tone === "warning") return "warning"
  return "neutral"
}

function formatEventDate(locale: string, date: string) {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, { day: "2-digit", month: "short" })
}

function formatGroupValue(locale: string, currency: string, rows: AssetRow[]) {
  return new Intl.NumberFormat(locale, { currency, maximumFractionDigits: 0, style: "currency" }).format(rows.reduce((sum, row) => sum + row.value, 0))
}

function formatGroupAllocation(rows: AssetRow[]) {
  return `${rows.reduce((sum, row) => sum + row.allocation, 0).toFixed(1)}%`
}

function periodHref(portfolioId: string | undefined, period: PerformancePeriod): string {
  const params = new URLSearchParams()
  if (portfolioId) params.set("portfolio", portfolioId)
  params.set("period", period)
  return `/dashboard?${params.toString()}`
}

function dashboardReturnHref(portfolioId: string | undefined, period: PerformancePeriod): string {
  return periodHref(portfolioId, period)
}

function assetDetailHref(listingId: string, portfolioId: string | undefined, period: PerformancePeriod): string {
  const params = new URLSearchParams()
  if (portfolioId) params.set("portfolio", portfolioId)
  params.set("returnTo", dashboardReturnHref(portfolioId, period))
  return `/assets/${listingId}?${params.toString()}`
}

function positionDetailHref(positionId: string, returnHref: string): string {
  const params = new URLSearchParams({ returnTo: returnHref })
  return `/positions/${positionId}?${params.toString()}`
}
