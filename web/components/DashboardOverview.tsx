"use client"
import Link from "next/link"
import { useEffect, useMemo, useState } from "react"
import { fmtPct, fmtPrice, fmtQty, num } from "@/lib/format"
import type { ActivityItem, ActivityPage, ExchangeView, IntelligenceReport, NotificationInbox, NotificationItem, Portfolio, PositionView } from "@/lib/types"
import { AddPositionModal } from "./AddPositionModal"
import { useDashboardPrivacy } from "./DashboardPrivacy"

type View = "holdings" | "allocation" | "activity"
type HoldingSortKey = "name" | "price" | "dailyPct" | "value" | "allocation" | "returnPct"
type SortDirection = "asc" | "desc"

const ASSET_COLORS: Record<string, string> = {
  equity: "#6487ff",
  crypto: "#a278ff",
  fund: "#e6b43d",
}

const ASSET_LABELS: Record<string, string> = {
  equity: "Equities",
  crypto: "Crypto",
  fund: "Funds",
}

const INCLUDE_CLOSED_STORAGE_KEY = "dashboard-holdings-include-closed"
const COLLAPSED_TYPES_STORAGE_KEY = "dashboard-holdings-collapsed-types"

interface Props {
  positions: PositionView[]
  portfolios: Portfolio[]
  exchanges: ExchangeView[]
  selectedPortfolioId?: string
  activity: ActivityPage
  reportingCurrency: string
  locale: string
}

interface HoldingRow {
  position: PositionView
  type: string
  price: number | null
  value: number
  cost: number
  pnl: number
  returnPct: number | null
  dailyPct: number | null
  allocation: number
}

export function DashboardOverview({ positions, portfolios, exchanges, selectedPortfolioId, activity, reportingCurrency, locale }: Props) {
  const [view, setView] = useState<View>("holdings")
  const [showClosed, setShowClosed] = useState(false)

  useEffect(() => {
    setShowClosed(localStorage.getItem(INCLUDE_CLOSED_STORAGE_KEY) === "true")
  }, [])

  function changeShowClosed(next: boolean) {
    setShowClosed(next)
    localStorage.setItem(INCLUDE_CLOSED_STORAGE_KEY, String(next))
  }

  const model = useMemo(() => buildModel(positions), [positions])
  const visibleRows = showClosed ? model.rows : model.rows.filter((row) => row.position.state !== "closed")

  return (
    <div className="min-w-0 space-y-3">
      <PortfolioHeader model={model} locale={locale} currency={reportingCurrency} />
      <ReturnDistribution rows={model.openRows} locale={locale} currency={reportingCurrency} />
      <section className="app-panel overflow-hidden rounded-xl">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
            <div className="flex items-center gap-5">
              {(["holdings", "allocation", "activity"] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setView(item)}
                  className={`relative py-1 text-xs font-medium capitalize transition ${view === item ? "text-[var(--app-text)]" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}
                >
                  {item}
                  {view === item && <span className="absolute inset-x-0 -bottom-3.5 h-0.5 bg-[var(--app-accent)]" />}
                </button>
              ))}
            </div>
            <label className={`flex items-center gap-2 text-[11px] ${view === "activity" ? "cursor-not-allowed text-[var(--app-text-faint)] opacity-50" : "text-[var(--app-text-muted)]"}`}>
              <input type="checkbox" checked={showClosed} disabled={view === "activity"} onChange={(event) => changeShowClosed(event.target.checked)} className="accent-[var(--app-accent)] disabled:cursor-not-allowed" />
              Include closed
            </label>
          </div>

          {view === "holdings" && <HoldingsTable rows={visibleRows} portfolios={portfolios} exchanges={exchanges} selectedPortfolioId={selectedPortfolioId} locale={locale} currency={reportingCurrency} />}
          {view === "allocation" && <AllocationView rows={visibleRows} locale={locale} currency={reportingCurrency} />}
          {view === "activity" && <ActivityOverview activity={activity} positions={positions} portfolios={portfolios} selectedPortfolioId={selectedPortfolioId} locale={locale} />}
      </section>
    </div>
  )
}

function buildModel(positions: PositionView[]) {
  const open = positions.filter((position) => position.state !== "closed")
  const totalValue = open.reduce((sum, position) => sum + (num(position.performance.current_value_reporting) ?? 0), 0)
  const rows: HoldingRow[] = positions.map((position) => {
    const value = num(position.performance.current_value_reporting) ?? 0
    return {
      position,
      type: position.listing?.asset_type ?? "equity",
      price: num(position.performance.current_price),
      value,
      cost: num(position.performance.open_cost_basis_reporting) ?? 0,
      pnl: position.state === "closed"
        ? (num(position.performance.realized_pnl_reporting) ?? 0)
        : (num(position.performance.unrealized_pnl_reporting) ?? 0),
      returnPct: position.state === "closed"
        ? num(position.performance.realized_return_pct)
        : num(position.performance.simple_return_pct),
      dailyPct: num(position.performance.daily_change_pct),
      allocation: totalValue > 0 ? (value / totalValue) * 100 : 0,
    }
  }).sort((a, b) => b.value - a.value)

  const openRows = rows.filter((row) => row.position.state !== "closed")
  const invested = openRows.reduce((sum, row) => sum + row.cost, 0)
  const unrealized = openRows.reduce((sum, row) => sum + row.pnl, 0)
  const realized = positions.reduce((sum, position) => sum + (num(position.performance.realized_pnl_reporting) ?? 0), 0)
  const totalPnl = unrealized + realized
  let dailyEstimate: number | null = null
  for (const row of openRows) {
    if (row.dailyPct !== null) dailyEstimate = (dailyEstimate ?? 0) + row.value * (row.dailyPct / 100)
  }
  const byType = Object.entries(
    openRows.reduce<Record<string, number>>((acc, row) => {
      acc[row.type] = (acc[row.type] ?? 0) + row.value
      return acc
    }, {}),
  ).sort((a, b) => b[1] - a[1])
  const dailyMovers = openRows.filter((row) => row.dailyPct !== null)
  const biggestGainers = [...dailyMovers].filter((row) => (row.dailyPct ?? 0) >= 0).sort((a, b) => (b.dailyPct ?? 0) - (a.dailyPct ?? 0)).slice(0, 3)
  const biggestLosers = [...dailyMovers].filter((row) => (row.dailyPct ?? 0) < 0).sort((a, b) => (a.dailyPct ?? 0) - (b.dailyPct ?? 0)).slice(0, 3)

  return {
    rows,
    openRows,
    totalValue,
    invested,
    totalPnl,
    realized,
    unrealized,
    dailyEstimate,
    openReturnPct: invested > 0 ? (unrealized / invested) * 100 : null,
    byType,
    biggestGainers,
    biggestLosers,
    staleCount: positions.filter((position) => position.freshness_status === "stale" || position.freshness_status === "unavailable").length,
    invalidCount: positions.filter((position) => position.state === "invalid").length,
  }
}

type Model = ReturnType<typeof buildModel>

export function PortfolioIntelligence({ positions, locale, currency, intelligence, notifications, selectedPortfolioId }: { positions: PositionView[]; locale: string; currency: string; intelligence: IntelligenceReport | null; notifications: NotificationInbox; selectedPortfolioId?: string }) {
  const model = useMemo(() => buildModel(positions), [positions])
  return <IntelligenceRail model={model} locale={locale} currency={currency} intelligence={intelligence} notifications={notifications} selectedPortfolioId={selectedPortfolioId} />
}

function PortfolioHeader({ model, locale, currency }: { model: Model; locale: string; currency: string }) {
  const { hidden, currency: privateCurrency } = useDashboardPrivacy()
  return (
    <section className="app-panel grid overflow-hidden rounded-xl sm:grid-cols-2 xl:grid-cols-4">
      <HeadlineMetric label="Portfolio value" value={privateCurrency(locale, model.totalValue, currency)} sub={model.dailyEstimate === null ? "Daily movement unavailable" : `${!hidden && model.dailyEstimate >= 0 ? "+" : ""}${privateCurrency(locale, model.dailyEstimate, currency)} estimated today`} tone={model.dailyEstimate !== null && model.dailyEstimate < 0 ? "negative" : "positive"} />
      <HeadlineMetric label="Invested capital" value={privateCurrency(locale, model.invested, currency)} sub="Open cost basis" />
      <HeadlineMetric label="Open return" value={model.openReturnPct === null ? "—" : fmtPct(model.openReturnPct)} sub={`${!hidden && model.unrealized >= 0 ? "+" : ""}${privateCurrency(locale, model.unrealized, currency)} unrealized`} tone={model.unrealized < 0 ? "negative" : "positive"} />
      <HeadlineMetric label="Total P&L" value={`${!hidden && model.totalPnl >= 0 ? "+" : ""}${privateCurrency(locale, model.totalPnl, currency)}`} sub={`${!hidden && model.realized >= 0 ? "+" : ""}${privateCurrency(locale, model.realized, currency)} realized`} tone={model.totalPnl < 0 ? "negative" : "positive"} />
    </section>
  )
}

function HeadlineMetric({ label, value, sub, tone }: { label: string; value: string; sub: string; tone?: "positive" | "negative" }) {
  const toneClass = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="border-b border-[var(--app-border)] px-4 py-4 last:border-b-0 xl:border-b-0 xl:border-l xl:first:border-l-0">
      <p className="text-[11px] text-[var(--app-text-muted)]">{label}</p>
      <p className={`mt-1 truncate text-xl font-semibold tabular-nums tracking-tight ${toneClass}`}>{value}</p>
      <p className="mt-1 truncate text-[10px] tabular-nums text-[var(--app-text-faint)]">{sub}</p>
    </div>
  )
}

function ReturnDistribution({ rows, locale, currency }: { rows: HoldingRow[]; locale: string; currency: string }) {
  const { hidden, currency: privateCurrency } = useDashboardPrivacy()
  const maxAbs = Math.max(1, ...rows.map((row) => Math.abs(row.returnPct ?? 0)))
  return (
    <section className="app-panel rounded-xl p-4">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-[var(--app-text)]">Current return distribution</h2>
          <p className="mt-0.5 text-[10px] text-[var(--app-text-faint)]">Open-position returns, not historical portfolio performance</p>
        </div>
        <span className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2 py-1 text-[10px] text-[var(--app-text-muted)]">Current snapshot</span>
      </div>
      <div className="grid h-44 grid-cols-[repeat(auto-fit,minmax(34px,1fr))] items-center gap-2 border-y border-[var(--app-border)] py-4">
        {rows.slice(0, 18).map((row) => {
          const value = row.returnPct ?? 0
          const height = Math.max(4, (Math.abs(value) / maxAbs) * 68)
          return (
            <Link key={row.position.id} href={`/positions/${row.position.id}`} className="group flex h-full flex-col items-center justify-center">
              <div className="relative h-[136px] w-full">
                <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--app-border-strong)]" />
                <span
                  className={`absolute left-1/2 w-2 -translate-x-1/2 rounded-sm transition-all group-hover:w-3 ${value >= 0 ? "bottom-1/2 bg-[var(--app-positive)]" : "top-1/2 bg-[var(--app-negative)]"}`}
                  style={{ height }}
                />
              </div>
              <span className="group/symbol relative mt-1 max-w-full text-[9px] font-medium text-[var(--app-text-muted)]">
                <span className="block truncate">{row.position.listing?.symbol ?? "?"}</span>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 min-w-32 max-w-48 -translate-x-1/2 rounded-lg border border-[var(--app-border-strong)] bg-[color-mix(in_srgb,var(--app-surface)_96%,transparent)] px-3 py-2 text-left opacity-0 shadow-xl backdrop-blur transition-opacity group-hover/symbol:opacity-100">
                  <span className="block truncate text-[10px] font-semibold text-[var(--app-text)]">{row.position.listing?.name ?? row.position.listing?.symbol ?? "Unknown asset"}</span>
                  <span className="mt-1 flex items-center justify-between gap-4 text-[9px]">
                    <span className={`font-semibold tabular-nums ${value >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{fmtPct(value)}</span>
                    <span className="tabular-nums text-[var(--app-text-muted)]">{privateCurrency(locale, row.value, currency)}</span>
                  </span>
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function HoldingsTable({ rows, portfolios, exchanges, selectedPortfolioId, locale, currency }: { rows: HoldingRow[]; portfolios: Portfolio[]; exchanges: ExchangeView[]; selectedPortfolioId?: string; locale: string; currency: string }) {
  const [sortKey, setSortKey] = useState<HoldingSortKey>("value")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(() => new Set())

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(COLLAPSED_TYPES_STORAGE_KEY) ?? "[]") as unknown
      if (Array.isArray(saved) && saved.every((type) => typeof type === "string")) setCollapsedTypes(new Set(saved))
    } catch {
      localStorage.removeItem(COLLAPSED_TYPES_STORAGE_KEY)
    }
  }, [])

  const grouped = useMemo(() => Object.entries(rows.reduce<Record<string, HoldingRow[]>>((acc, row) => {
    ;(acc[row.type] ??= []).push(row)
    return acc
  }, {})).map(([type, group]) => [type, [...group].sort((a, b) => compareHoldingRows(a, b, sortKey, sortDirection))] as const), [rows, sortDirection, sortKey])

  function changeSort(nextKey: HoldingSortKey) {
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
    <div className="overflow-x-auto">
      <div className="min-w-[760px]">
        <div className="grid grid-cols-[minmax(220px,1.5fr)_110px_105px_125px_100px_110px] gap-3 border-b border-[var(--app-border)] px-4 py-2 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">
          <SortButton label="Name" sortKey="name" activeKey={sortKey} direction={sortDirection} onSort={changeSort} />
          <SortButton label="Price" sortKey="price" activeKey={sortKey} direction={sortDirection} onSort={changeSort} align="right" />
          <SortButton label="Today" sortKey="dailyPct" activeKey={sortKey} direction={sortDirection} onSort={changeSort} align="right" />
          <SortButton label="Value" sortKey="value" activeKey={sortKey} direction={sortDirection} onSort={changeSort} align="right" />
          <SortButton label="Allocation" sortKey="allocation" activeKey={sortKey} direction={sortDirection} onSort={changeSort} align="right" />
          <SortButton label="Return" sortKey="returnPct" activeKey={sortKey} direction={sortDirection} onSort={changeSort} align="right" />
        </div>
        {grouped.map(([type, group]) => (
          <div key={type}>
            <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-1.5">
              <button
                type="button"
                onClick={() => toggleType(type)}
                aria-expanded={!collapsedTypes.has(type)}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1 py-1 text-left text-[10px] font-semibold text-[var(--app-text-muted)] transition hover:text-[var(--app-text)]"
              >
                <span className="w-3 shrink-0 text-center text-[11px] text-[var(--app-text-faint)]">{collapsedTypes.has(type) ? "+" : "-"}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: ASSET_COLORS[type] ?? ASSET_COLORS.equity }} />
                <span className="truncate">{ASSET_LABELS[type] ?? type}</span>
                <span className="font-normal text-[var(--app-text-faint)]">({group.length})</span>
              </button>
              <AddPositionModal
                portfolios={portfolios}
                exchanges={exchanges}
                selectedPortfolioId={selectedPortfolioId}
                label="Add position"
                className="shrink-0 rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2.5 py-1 text-[9px] font-semibold text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
              />
            </div>
            {!collapsedTypes.has(type) ? group.map((row) => <Holding key={row.position.id} row={row} locale={locale} currency={currency} />) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Holding({ row, locale, currency }: { row: HoldingRow; locale: string; currency: string }) {
  const { currency: privateCurrency } = useDashboardPrivacy()
  const listing = row.position.listing
  const positive = row.pnl >= 0
  const dailyPositive = (row.dailyPct ?? 0) >= 0
  return (
    <Link href={`/positions/${row.position.id}`} className="grid grid-cols-[minmax(220px,1.5fr)_110px_105px_125px_100px_110px] items-center gap-3 border-b border-[var(--app-border)] px-4 py-2.5 text-xs transition last:border-b-0 hover:bg-[var(--app-surface-hover)]">
      <span className="flex min-w-0 items-center gap-3 pl-5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[9px] font-bold" style={{ color: ASSET_COLORS[row.type] ?? ASSET_COLORS.equity }}>{listing?.symbol.slice(0, 3) ?? "?"}</span>
        <span className="min-w-0"><span className="block truncate font-semibold text-[var(--app-text)]">{listing?.name ?? "Unknown asset"}</span><span className="block truncate text-[10px] font-medium text-[var(--app-text-faint)]">{listing?.symbol ?? row.position.listing_id}</span></span>
        {row.position.state !== "open" && <span className="ml-auto rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[8px] uppercase text-[var(--app-text-faint)]">{row.position.state}</span>}
      </span>
      <span className="text-right tabular-nums text-[var(--app-text-muted)]">{row.price === null ? "—" : fmtPrice(locale, row.price, listing?.currency ?? currency, row.type)}</span>
      <span className={`text-right font-medium tabular-nums ${row.dailyPct === null ? "text-[var(--app-text-faint)]" : dailyPositive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{row.dailyPct === null ? "—" : fmtPct(row.dailyPct)}</span>
      <span className="text-right font-medium tabular-nums text-[var(--app-text)]">{privateCurrency(locale, row.value, currency)}</span>
      <span className="text-right tabular-nums text-[var(--app-text-muted)]">{row.allocation.toFixed(1)}%</span>
      <span className={`text-right font-medium tabular-nums ${positive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{row.returnPct === null ? "—" : fmtPct(row.returnPct)}</span>
    </Link>
  )
}

function AllocationView({ rows, locale, currency }: { rows: HoldingRow[]; locale: string; currency: string }) {
  const { hidden, currency: privateCurrency } = useDashboardPrivacy()
  return (
    <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
      {rows.map((row) => {
        const profitable = row.pnl >= 0
        const tone = profitable ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"
        return (
          <Link key={row.position.id} href={`/positions/${row.position.id}`} className="app-muted-panel rounded-lg p-3 transition hover:border-[var(--app-border-strong)]">
            <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-[var(--app-text)]">{row.position.listing?.name ?? "Unknown asset"}</span><span className="shrink-0 tabular-nums text-[var(--app-text-muted)]">{row.allocation.toFixed(1)}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]"><div className="h-full rounded-full" style={{ width: `${row.allocation}%`, background: ASSET_COLORS[row.type] ?? ASSET_COLORS.equity }} /></div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div><p className="text-[9px] text-[var(--app-text-faint)]">Current value</p><p className={`text-[11px] font-semibold tabular-nums ${tone}`}>{privateCurrency(locale, row.value, currency)}</p></div>
              <div className="text-right"><p className="text-[9px] text-[var(--app-text-faint)]">Unrealized P&amp;L</p><p className={`text-[11px] font-semibold tabular-nums ${tone}`}>{!hidden && row.pnl >= 0 ? "+" : ""}{privateCurrency(locale, row.pnl, currency)}</p></div>
            </div>
          </Link>
        )
      })}
    </div>
  )
}

function SortButton({ label, sortKey, activeKey, direction, onSort, align = "left" }: { label: string; sortKey: HoldingSortKey; activeKey: HoldingSortKey; direction: SortDirection; onSort: (key: HoldingSortKey) => void; align?: "left" | "right" }) {
  const active = sortKey === activeKey
  return (
    <button
      type="button"
      onClick={() => onSort(sortKey)}
      className={`flex items-center gap-1 transition hover:text-[var(--app-text-muted)] ${align === "right" ? "justify-end text-right" : ""}`}
    >
      {label}
      <span className={active ? "text-[var(--app-accent)]" : "text-transparent"}>{direction === "asc" ? "^" : "v"}</span>
    </button>
  )
}

function compareHoldingRows(a: HoldingRow, b: HoldingRow, key: HoldingSortKey, direction: SortDirection) {
  const multiplier = direction === "asc" ? 1 : -1
  if (key === "name") {
    const aName = a.position.listing?.name ?? a.position.listing?.symbol ?? ""
    const bName = b.position.listing?.name ?? b.position.listing?.symbol ?? ""
    return aName.localeCompare(bName) * multiplier
  }
  const aValue = a[key] ?? Number.NEGATIVE_INFINITY
  const bValue = b[key] ?? Number.NEGATIVE_INFINITY
  return (aValue - bValue) * multiplier
}

const ACTIVITY_STYLE: Record<string, { label: string; className: string }> = {
  trade: { label: "Trade", className: "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" },
  cash_flow: { label: "Cash", className: "bg-[color-mix(in_srgb,var(--app-positive)_18%,transparent)] text-[var(--app-positive)]" },
  tax_event: { label: "Tax", className: "bg-[color-mix(in_srgb,var(--app-warning)_18%,transparent)] text-[var(--app-warning)]" },
}

function ActivityOverview({ activity, positions, portfolios, selectedPortfolioId, locale }: { activity: ActivityPage; positions: PositionView[]; portfolios: Portfolio[]; selectedPortfolioId?: string; locale: string }) {
  const portfolioNames = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name]))
  const positionNames = new Map(positions.map((position) => [position.id, position.listing?.name ?? position.listing?.symbol ?? position.id]))
  const positionAssetTypes = new Map(positions.map((position) => [position.id, position.listing?.asset_type ?? "equity"]))
  const counts = activity.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1
    return acc
  }, {})
  const fullHref = selectedPortfolioId ? `/activity?portfolio=${selectedPortfolioId}` : "/activity"

  if (activity.items.length === 0) {
    return (
      <div className="flex min-h-52 flex-col items-center justify-center px-6 text-center">
        <p className="text-sm font-medium text-[var(--app-text)]">No portfolio activity yet</p>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">Trades, cash flows, and tax events will appear here.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="grid border-b border-[var(--app-border)] sm:grid-cols-3">
        <ActivityMetric label="Trades" value={counts.trade ?? 0} tone="accent" />
        <ActivityMetric label="Cash flows" value={counts.cash_flow ?? 0} tone="positive" />
        <ActivityMetric label="Tax events" value={counts.tax_event ?? 0} tone="warning" />
      </div>
      <ul className="divide-y divide-[var(--app-border)]">
        {activity.items.map((item) => (
          <ActivityRow key={`${item.kind}:${item.id}`} item={item} portfolioNames={portfolioNames} positionNames={positionNames} positionAssetTypes={positionAssetTypes} locale={locale} />
        ))}
      </ul>
      <div className="border-t border-[var(--app-border)] p-3 text-center">
        <Link href={fullHref} className="inline-flex rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-1.5 text-xs font-medium text-[var(--app-text-muted)] transition hover:text-[var(--app-text)]">
          Open full activity workspace
        </Link>
      </div>
    </div>
  )
}

function ActivityMetric({ label, value, tone }: { label: string; value: number; tone: "accent" | "positive" | "warning" }) {
  const color = tone === "positive" ? "text-[var(--app-positive)]" : tone === "warning" ? "text-[var(--app-warning)]" : "text-[var(--app-accent)]"
  return <div className="border-b border-[var(--app-border)] px-4 py-3 last:border-b-0 sm:border-b-0 sm:border-l sm:first:border-l-0"><p className="text-[9px] uppercase tracking-wider text-[var(--app-text-faint)]">{label}</p><p className={`mt-1 text-lg font-semibold tabular-nums ${color}`}>{value}</p><p className="text-[9px] text-[var(--app-text-faint)]">in recent activity</p></div>
}

function ActivityRow({ item, portfolioNames, positionNames, positionAssetTypes, locale }: { item: ActivityItem; portfolioNames: Map<string, string>; positionNames: Map<string, string>; positionAssetTypes: Map<string, string>; locale: string }) {
  const { currency: privateCurrency } = useDashboardPrivacy()
  const style = ACTIVITY_STYLE[item.kind] ?? { label: item.kind, className: "text-[var(--app-text-muted)]" }
  const tradeStyle = item.kind === "trade"
    ? item.subtype === "sell"
      ? "border-[color-mix(in_srgb,var(--app-negative)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] text-[var(--app-negative)]"
      : "border-[color-mix(in_srgb,var(--app-positive)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_10%,transparent)] text-[var(--app-positive)]"
    : null
  const scope = item.position_id ? positionNames.get(item.position_id) : item.portfolio_id ? portfolioNames.get(item.portfolio_id) : "Unscoped"
  const amount = num(item.amount) ?? 0
  return (
    <li className="grid grid-cols-[72px_52px_minmax(0,1fr)_auto] items-center gap-3 px-4 py-2.5 text-[10px] transition hover:bg-[var(--app-surface-hover)]">
      <span className="tabular-nums text-[var(--app-text-faint)]">{new Date(item.occurred_at).toLocaleDateString(locale, { day: "2-digit", month: "short" })}</span>
      <span className={`inline-flex justify-center rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${style.className}`}>{style.label}</span>
      <span className="flex min-w-0 items-center gap-2">
        {tradeStyle ? <span className={`inline-flex shrink-0 rounded-md border px-2 py-0.5 text-[8px] font-semibold tracking-[0.08em] ${tradeStyle}`}>{item.subtype === "sell" ? "SELL" : "BUY"}</span> : null}
        <span className="min-w-0 truncate text-[var(--app-text)]">{activityDescription(item, locale, item.position_id ? positionAssetTypes.get(item.position_id) ?? "equity" : "equity")}<span className="ml-2 text-[var(--app-text-faint)]">· {scope}</span></span>
      </span>
      <span className="tabular-nums text-[var(--app-text-muted)]">{privateCurrency(locale, amount, item.currency)}</span>
    </li>
  )
}

function activityDescription(item: ActivityItem, locale: string, assetType: string): string {
  if (item.kind === "trade") {
    const quantity = num(item.quantity)
    const price = num(item.price)
    return `${quantity === null ? "" : fmtQty(locale, quantity, assetType)} @ ${price === null ? "" : fmtPrice(locale, price, item.currency, assetType)}`.trim()
  }
  if (item.kind === "tax_event") return `${item.subtype.replaceAll("_", " ")} ${item.direction ?? ""}`.trim()
  return item.subtype.replaceAll("_", " ")
}

function IntelligenceRail({ model, locale, currency, intelligence, notifications, selectedPortfolioId }: { model: Model; locale: string; currency: string; intelligence: IntelligenceReport | null; notifications: NotificationInbox; selectedPortfolioId?: string }) {
  const maxMoverPct = Math.max(1, ...model.biggestGainers.map((row) => Math.abs(row.dailyPct ?? 0)), ...model.biggestLosers.map((row) => Math.abs(row.dailyPct ?? 0)))
  return (
    <div className="space-y-3">
      <PulseCard intelligence={intelligence} />
      <RailCard title="Today's movers" subtitle="Ranked by daily percentage change">
        {model.biggestGainers.length > 0 || model.biggestLosers.length > 0 ? (
          <div className="space-y-4">
            <MoverGroup label="Top gainers" rows={model.biggestGainers} maxPct={maxMoverPct} />
            <MoverGroup label="Top losers" rows={model.biggestLosers} maxPct={maxMoverPct} />
          </div>
        ) : <p className="text-xs text-[var(--app-text-muted)]">No daily quote movement available.</p>}
      </RailCard>
      <RailCard title="Portfolio structure" subtitle="Instrument concentration and allocation">
        <StructureCard model={model} intelligence={intelligence} locale={locale} currency={currency} />
      </RailCard>
      <NotificationsCard model={model} inbox={notifications} locale={locale} selectedPortfolioId={selectedPortfolioId} />
      <RailCard title="Data quality" subtitle="Coverage behind the portfolio metrics">
        <DataQualityCard model={model} intelligence={intelligence} />
      </RailCard>
    </div>
  )
}

function PulseCard({ intelligence }: { intelligence: IntelligenceReport | null }) {
  const { hidden, toggle } = useDashboardPrivacy()
  const score = intelligence?.score ?? null
  const status = intelligence?.status ?? "insufficient_data"
  const tone = pulseTone(status)
  const driver = intelligence?.primary_driver ? componentLabel(intelligence.primary_driver) : null
  const gaugeValue = score ?? 0

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <CardHeader title="Portfolio pulse" subtitle={intelligence ? `Period ${intelligence.period} · model v${intelligence.version}` : "Portfolio health is currently unavailable"}>
        <button type="button" onClick={toggle} aria-label={hidden ? "Show monetary amounts" : "Hide monetary amounts"} title={hidden ? "Show monetary amounts" : "Hide monetary amounts"} className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md border transition ${hidden ? "border-[color-mix(in_srgb,var(--app-accent)_50%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-faint)] hover:text-[var(--app-text)]"}`}>
          <PrivacyIcon hidden={hidden} />
        </button>
      </CardHeader>
      <div className="p-4">
        <div className="flex items-center gap-4">
          <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: `conic-gradient(${tone.color} 0 ${gaugeValue}%, var(--app-border) ${gaugeValue}% 100%)` }}>
            <div className="absolute inset-2.5 flex flex-col items-center justify-center rounded-full bg-[var(--app-surface)]">
              <span className="text-2xl font-semibold tabular-nums text-[var(--app-text)]">{score ?? "—"}</span>
              <span className="text-[8px] uppercase tracking-wider text-[var(--app-text-faint)]">of 100</span>
            </div>
          </div>
          <div className="min-w-0">
            <span className={`inline-flex rounded-md px-2 py-1 text-[9px] font-semibold uppercase tracking-wider ${tone.className}`}>{status.replaceAll("_", " ")}</span>
            <p className="mt-2 text-[11px] leading-4 text-[var(--app-text-muted)]">
              {driver ? `Lowest-scoring component: ${driver}.` : score === null ? "Not enough structure or risk data to calculate a meaningful score." : "No primary score driver is available."}
            </p>
            <p className="mt-2 text-[9px] text-[var(--app-text-faint)]">Confidence {Math.round((intelligence?.confidence ?? 0) * 100)}%</p>
          </div>
        </div>
        {intelligence ? (
          <>
            <div className="mt-4 grid grid-cols-3 gap-2">
              <PulseMetric label="Structure" score={intelligence.components.structure.score} />
              <PulseMetric label="Risk" score={intelligence.components.risk.score} />
              <PulseMetric label="Data quality" score={intelligence.components.data_quality.score} />
            </div>
            <details className="mt-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)]">
              <summary className="cursor-pointer list-none px-3 py-2 text-[9px] font-semibold text-[var(--app-text-muted)] hover:text-[var(--app-text)]">Score breakdown</summary>
              <div className="space-y-2 border-t border-[var(--app-border)] px-3 py-2 text-[9px]">
                <PulseBreakdownRow label="Structure" score={intelligence.components.structure.score} weight={intelligence.components.structure.weight} />
                <PulseBreakdownRow label="Risk" score={intelligence.components.risk.score} weight={intelligence.components.risk.weight} />
                <PulseBreakdownRow label="Data quality" score={intelligence.components.data_quality.score} weight={intelligence.components.data_quality.weight} />
              </div>
            </details>
          </>
        ) : null}
      </div>
    </section>
  )
}

function PulseMetric({ label, score }: { label: string; score: number | null }) {
  return <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2 py-2 text-center"><p className="truncate text-[8px] uppercase tracking-wider text-[var(--app-text-faint)]">{label}</p><p className="mt-1 text-sm font-semibold tabular-nums text-[var(--app-text)]">{score ?? "—"}</p></div>
}

function PulseBreakdownRow({ label, score, weight }: { label: string; score: number | null; weight: number }) {
  return <div className="flex items-center justify-between gap-3"><span className="text-[var(--app-text-muted)]">{label}</span><span className="tabular-nums text-[var(--app-text)]">{score ?? "Unavailable"} <span className="text-[var(--app-text-faint)]">· {Math.round(weight * 100)}% weight</span></span></div>
}

function StructureCard({ model, intelligence, locale, currency }: { model: Model; intelligence: IntelligenceReport | null; locale: string; currency: string }) {
  const structure = intelligence?.components.structure
  const topThree = structure?.top3_pct ?? null
  const structureStatus = scoreStatus(structure?.score ?? null)
  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[9px] text-[var(--app-text-faint)]">Top 3 concentration</p>
            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-[var(--app-text)]">{topThree === null ? "—" : `${topThree.toFixed(1)}%`}</p>
            <p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">of total portfolio value</p>
          </div>
          <span className={`rounded-md px-2 py-1 text-[9px] font-semibold ${structureStatus.className}`}>{structureStatus.label}</span>
        </div>
        <ConcentrationScale value={topThree} />
        <div className="mt-3 flex items-center justify-between gap-3 text-[9px]">
          <span className="text-[var(--app-text-faint)]">Largest holding</span>
          <span className="font-semibold tabular-nums text-[var(--app-text)]">{structure?.top1_pct == null ? "Unavailable" : `${structure.top1_pct.toFixed(1)}%`}</span>
        </div>
      </div>
      <div className="border-t border-[var(--app-border)] pt-4">
        <p className="mb-3 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Asset allocation</p>
        <AllocationDonut model={model} locale={locale} currency={currency} />
      </div>
    </div>
  )
}

function ConcentrationScale({ value }: { value: number | null }) {
  const marker = Math.max(0, Math.min(100, value ?? 0))
  return (
    <div className="mt-4">
      <div className="relative pt-2">
        {value !== null ? <span className="absolute top-0 h-3 w-0.5 -translate-x-1/2 rounded-full bg-[var(--app-text)] shadow-[0_0_0_2px_var(--app-surface)]" style={{ left: `${marker}%` }} /> : null}
        <div className="h-2 overflow-hidden rounded-full border border-[var(--app-border)] bg-[linear-gradient(90deg,var(--app-positive)_0%,var(--app-positive)_32%,var(--app-warning)_62%,var(--app-negative)_100%)] opacity-80" />
      </div>
      <div className="mt-1.5 flex justify-between text-[8px] text-[var(--app-text-faint)]"><span>Low</span><span>Moderate</span><span>High</span></div>
    </div>
  )
}

function NotificationsCard({ model, inbox, locale, selectedPortfolioId }: { model: Model; inbox: NotificationInbox; locale: string; selectedPortfolioId?: string }) {
  const listingIds = new Set(model.rows.map((row) => row.position.listing_id))
  const positionByListing = new Map(model.rows.map((row) => [row.position.listing_id, row.position.id]))
  const unread = inbox.notifications
    .filter((item) => item.read_at === null)
    .sort((a, b) => Number(Boolean(b.listing_id && listingIds.has(b.listing_id))) - Number(Boolean(a.listing_id && listingIds.has(a.listing_id))))
    .slice(0, 3)

  return (
    <RailCard title="Notifications" subtitle={selectedPortfolioId ? "Portfolio-related notifications first" : "Unread notifications across your holdings"} action={<Link href="/notifications" className="text-[9px] font-semibold text-[var(--app-accent)] hover:underline">More</Link>}>
      {unread.length > 0 ? (
        <ul className="space-y-2">
          {unread.map((item) => <NotificationRow key={item.id} item={item} locale={locale} positionId={item.listing_id ? positionByListing.get(item.listing_id) : undefined} />)}
        </ul>
      ) : <p className="text-xs text-[var(--app-text-muted)]">No unread notifications.</p>}
      {inbox.unread_count > unread.length ? <p className="mt-3 text-[9px] text-[var(--app-text-faint)]">{inbox.unread_count - unread.length} more unread</p> : null}
    </RailCard>
  )
}

function NotificationRow({ item, locale, positionId }: { item: NotificationItem; locale: string; positionId?: string }) {
  const href = positionId ? `/positions/${positionId}` : "/notifications"
  const severity = item.severity === "critical" ? "bg-[var(--app-negative)]" : item.severity === "warning" ? "bg-[var(--app-warning)]" : "bg-[var(--app-accent)]"
  return (
    <li>
      <Link href={href} className="flex items-start gap-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2.5 transition hover:border-[var(--app-border-strong)]">
        <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${severity}`} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[10px] font-semibold text-[var(--app-text)]">{item.title}</span>
          <span className="mt-0.5 block truncate text-[9px] text-[var(--app-text-faint)]">{new Date(item.created_at).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" })}</span>
        </span>
        <span className="text-[var(--app-text-faint)]">›</span>
      </Link>
    </li>
  )
}

function DataQualityCard({ model, intelligence }: { model: Model; intelligence: IntelligenceReport | null }) {
  const quality = intelligence?.components.data_quality
  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div><p className="text-2xl font-semibold tabular-nums text-[var(--app-text)]">{quality?.score ?? "—"}</p><p className="text-[9px] text-[var(--app-text-faint)]">Data-quality score</p></div>
        <span className={`rounded-md px-2 py-1 text-[9px] font-semibold ${quality && quality.score >= 80 ? "bg-[color-mix(in_srgb,var(--app-positive)_14%,transparent)] text-[var(--app-positive)]" : "bg-[color-mix(in_srgb,var(--app-warning)_14%,transparent)] text-[var(--app-warning)]"}`}>{quality && quality.score >= 80 ? "Healthy" : "Needs attention"}</span>
      </div>
      <div className="space-y-2 text-[10px]">
        <QualityRow label="Priced value" value={quality ? `${quality.priced_value_pct.toFixed(1)}%` : "Unavailable"} warning={quality ? quality.priced_value_pct < 100 : true} />
        <QualityRow label="Fresh value" value={quality ? `${quality.fresh_value_pct.toFixed(1)}%` : "Unavailable"} warning={quality ? quality.fresh_value_pct < 100 : true} />
        <QualityRow label="Stale or unavailable" value={String(model.staleCount)} warning={model.staleCount > 0} />
        <QualityRow label="Invalid ledgers" value={String(model.invalidCount)} warning={model.invalidCount > 0} />
      </div>
    </div>
  )
}

function RailCard({ title, subtitle, action, children }: { title: string; subtitle?: string; action?: React.ReactNode; children: React.ReactNode }) {
  return <section className="app-panel overflow-hidden rounded-xl"><CardHeader title={title} subtitle={subtitle}>{action}</CardHeader><div className="p-4">{children}</div></section>
}

function CardHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: React.ReactNode }) {
  return <div className="flex items-start justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3"><div><h2 className="text-xs font-semibold text-[var(--app-text)]">{title}</h2>{subtitle ? <p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">{subtitle}</p> : null}</div>{children}</div>
}

function pulseTone(status: IntelligenceReport["status"]): { className: string; color: string } {
  if (status === "strong") return { className: "bg-[color-mix(in_srgb,var(--app-positive)_14%,transparent)] text-[var(--app-positive)]", color: "var(--app-positive)" }
  if (status === "balanced") return { className: "bg-[var(--app-accent-soft)] text-[var(--app-accent)]", color: "var(--app-accent)" }
  if (status === "fragile") return { className: "bg-[color-mix(in_srgb,var(--app-warning)_14%,transparent)] text-[var(--app-warning)]", color: "var(--app-warning)" }
  if (status === "at_risk") return { className: "bg-[color-mix(in_srgb,var(--app-negative)_14%,transparent)] text-[var(--app-negative)]", color: "var(--app-negative)" }
  return { className: "bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]", color: "var(--app-text-faint)" }
}

function componentLabel(component: IntelligenceReport["primary_driver"]): string {
  if (component === "data_quality") return "Data quality"
  if (component === "structure") return "Portfolio structure"
  if (component === "risk") return "Risk"
  return ""
}

function MoverGroup({ label, rows, maxPct }: { label: string; rows: HoldingRow[]; maxPct: number }) {
  return (
    <div>
      <p className="mb-1.5 text-[9px] font-medium uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</p>
      {rows.length > 0 ? (
        <div className="space-y-2.5">
          {rows.map((row) => {
            const value = row.dailyPct ?? 0
            const positive = value >= 0
            const width = Math.max(3, (Math.abs(value) / maxPct) * 100)
            return (
              <Link key={row.position.id} href={`/positions/${row.position.id}`} className="group block rounded-md px-1 py-1 transition hover:bg-[var(--app-surface-hover)]">
                <span className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate text-[10px] font-semibold text-[var(--app-text)]">{row.position.listing?.name ?? "Unknown asset"} <span className="font-normal text-[var(--app-text-faint)]">({row.position.listing?.symbol ?? "?"})</span></span>
                  <span className={`shrink-0 text-[10px] font-semibold tabular-nums ${positive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{fmtPct(value)}</span>
                </span>
                <span className="mt-1.5 block h-0.5 overflow-hidden rounded-full bg-[var(--app-border)]">
                  <span className={`block h-full rounded-full transition-all group-hover:brightness-125 ${positive ? "bg-[var(--app-positive)]" : "bg-[var(--app-negative)]"}`} style={{ width: `${width}%` }} />
                </span>
              </Link>
            )
          })}
        </div>
      ) : <p className="text-[10px] text-[var(--app-text-faint)]">None available</p>}
    </div>
  )
}

function scoreStatus(score: number | null): { label: string; className: string } {
  if (score === null) return { label: "Unavailable", className: "bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]" }
  if (score >= 75) return { label: "Balanced", className: "bg-[color-mix(in_srgb,var(--app-positive)_14%,transparent)] text-[var(--app-positive)]" }
  if (score >= 40) return { label: "Moderate", className: "bg-[color-mix(in_srgb,var(--app-warning)_14%,transparent)] text-[var(--app-warning)]" }
  return { label: "High", className: "bg-[color-mix(in_srgb,var(--app-negative)_14%,transparent)] text-[var(--app-negative)]" }
}

function AllocationDonut({ model, locale, currency }: { model: Model; locale: string; currency: string }) {
  const { currency: privateCurrency } = useDashboardPrivacy()
  let cursor = 0
  const stops = model.byType.map(([type, value]) => {
    const pct = model.totalValue > 0 ? (value / model.totalValue) * 100 : 0
    const start = cursor
    cursor += pct
    return `${ASSET_COLORS[type] ?? ASSET_COLORS.equity} ${start}% ${cursor}%`
  }).join(", ")
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops || "var(--app-border) 0 100%"})` }}><span className="absolute inset-4 flex items-center justify-center rounded-full bg-[var(--app-surface)] text-center text-[9px] font-semibold tabular-nums text-[var(--app-text)]">{privateCurrency(locale, model.totalValue, currency)}</span></div>
      <div className="min-w-0 flex-1 space-y-2">
        {model.byType.map(([type, value]) => <div key={type} className="flex items-center gap-2 text-[10px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ASSET_COLORS[type] ?? ASSET_COLORS.equity }} /><span className="min-w-0 flex-1 truncate text-[var(--app-text-muted)]">{ASSET_LABELS[type] ?? type}</span><span className="tabular-nums text-[var(--app-text)]">{model.totalValue > 0 ? ((value / model.totalValue) * 100).toFixed(1) : "0.0"}%</span></div>)}
      </div>
    </div>
  )
}

function QualityRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return <div className="flex items-center justify-between border-b border-[var(--app-border)] pb-2 last:border-0 last:pb-0"><span className="text-[var(--app-text-muted)]">{label}</span><span className={warning ? "font-semibold text-[var(--app-warning)]" : "font-semibold text-[var(--app-text)]"}>{value}</span></div>
}

function PrivacyIcon({ hidden }: { hidden: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z" />
      <circle cx="12" cy="12" r="2.5" />
      {hidden ? <path d="m4 4 16 16" /> : null}
    </svg>
  )
}
