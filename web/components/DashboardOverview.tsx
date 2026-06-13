"use client"
import Link from "next/link"
import { useMemo, useState } from "react"
import { fmtCurrency, fmtPct, num } from "@/lib/format"
import type { PositionView } from "@/lib/types"

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

interface Props {
  positions: PositionView[]
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

export function DashboardOverview({ positions, reportingCurrency, locale }: Props) {
  const [view, setView] = useState<View>("holdings")
  const [showClosed, setShowClosed] = useState(false)

  const model = useMemo(() => buildModel(positions), [positions])
  const visibleRows = showClosed ? model.rows : model.rows.filter((row) => row.position.state !== "closed")

  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_300px]">
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
            <label className="flex items-center gap-2 text-[11px] text-[var(--app-text-muted)]">
              <input type="checkbox" checked={showClosed} onChange={(event) => setShowClosed(event.target.checked)} className="accent-[var(--app-accent)]" />
              Include closed
            </label>
          </div>

          {view === "holdings" && <HoldingsTable rows={visibleRows} locale={locale} currency={reportingCurrency} />}
          {view === "allocation" && <AllocationView rows={model.openRows} locale={locale} currency={reportingCurrency} />}
          {view === "activity" && <ActivityPlaceholder />}
        </section>
      </div>

      <IntelligenceRail model={model} locale={locale} currency={reportingCurrency} />
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
  const biggestMover = [...openRows].filter((row) => row.dailyPct !== null).sort((a, b) => Math.abs(b.dailyPct ?? 0) - Math.abs(a.dailyPct ?? 0))[0]

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
    biggestMover,
    staleCount: positions.filter((position) => position.freshness_status === "stale" || position.freshness_status === "unavailable").length,
    invalidCount: positions.filter((position) => position.state === "invalid").length,
  }
}

type Model = ReturnType<typeof buildModel>

function PortfolioHeader({ model, locale, currency }: { model: Model; locale: string; currency: string }) {
  return (
    <section className="app-panel grid overflow-hidden rounded-xl sm:grid-cols-2 xl:grid-cols-4">
      <HeadlineMetric label="Portfolio value" value={fmtCurrency(locale, model.totalValue, currency)} sub={model.dailyEstimate === null ? "Daily movement unavailable" : `${model.dailyEstimate >= 0 ? "+" : ""}${fmtCurrency(locale, model.dailyEstimate, currency)} estimated today`} tone={model.dailyEstimate !== null && model.dailyEstimate < 0 ? "negative" : "positive"} />
      <HeadlineMetric label="Invested capital" value={fmtCurrency(locale, model.invested, currency)} sub="Open cost basis" />
      <HeadlineMetric label="Open return" value={model.openReturnPct === null ? "—" : fmtPct(model.openReturnPct)} sub={`${model.unrealized >= 0 ? "+" : ""}${fmtCurrency(locale, model.unrealized, currency)} unrealized`} tone={model.unrealized < 0 ? "negative" : "positive"} />
      <HeadlineMetric label="Total P&L" value={`${model.totalPnl >= 0 ? "+" : ""}${fmtCurrency(locale, model.totalPnl, currency)}`} sub={`${model.realized >= 0 ? "+" : ""}${fmtCurrency(locale, model.realized, currency)} realized`} tone={model.totalPnl < 0 ? "negative" : "positive"} />
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
            <Link key={row.position.id} href={`/positions/${row.position.id}`} title={`${row.position.listing?.name ?? row.position.listing?.symbol ?? "Position"}: ${fmtPct(value)} · ${fmtCurrency(locale, row.value, currency)}`} className="group flex h-full flex-col items-center justify-center">
              <div className="relative h-[136px] w-full">
                <span className="absolute inset-x-0 top-1/2 h-px bg-[var(--app-border-strong)]" />
                <span
                  className={`absolute left-1/2 w-2 -translate-x-1/2 rounded-sm transition-all group-hover:w-3 ${value >= 0 ? "bottom-1/2 bg-[var(--app-positive)]" : "top-1/2 bg-[var(--app-negative)]"}`}
                  style={{ height }}
                />
              </div>
              <span className="group/symbol relative mt-1 max-w-full text-[9px] font-medium text-[var(--app-text-muted)]">
                <span className="block truncate">{row.position.listing?.symbol ?? "?"}</span>
                <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 w-max max-w-44 -translate-x-1/2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2 py-1 text-center text-[10px] font-medium text-[var(--app-text)] opacity-0 shadow-lg transition-opacity group-hover/symbol:opacity-100">
                  {row.position.listing?.name ?? row.position.listing?.symbol ?? "Unknown asset"}
                </span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}

function HoldingsTable({ rows, locale, currency }: { rows: HoldingRow[]; locale: string; currency: string }) {
  const [sortKey, setSortKey] = useState<HoldingSortKey>("value")
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc")
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(() => new Set())

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
            <button
              type="button"
              onClick={() => toggleType(type)}
              aria-expanded={!collapsedTypes.has(type)}
              className="flex w-full items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-raised)] px-4 py-2 text-left text-[10px] font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)]"
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: ASSET_COLORS[type] ?? ASSET_COLORS.equity }} />
              {ASSET_LABELS[type] ?? type}
              <span className="font-normal text-[var(--app-text-faint)]">({group.length})</span>
              <span className="ml-auto text-[11px] text-[var(--app-text-faint)]">{collapsedTypes.has(type) ? "+" : "-"}</span>
            </button>
            {!collapsedTypes.has(type) ? group.map((row) => <Holding key={row.position.id} row={row} locale={locale} currency={currency} />) : null}
          </div>
        ))}
      </div>
    </div>
  )
}

function Holding({ row, locale, currency }: { row: HoldingRow; locale: string; currency: string }) {
  const listing = row.position.listing
  const positive = row.pnl >= 0
  const dailyPositive = (row.dailyPct ?? 0) >= 0
  return (
    <Link href={`/positions/${row.position.id}`} className="grid grid-cols-[minmax(220px,1.5fr)_110px_105px_125px_100px_110px] items-center gap-3 border-b border-[var(--app-border)] px-4 py-2.5 text-xs transition last:border-b-0 hover:bg-[var(--app-surface-hover)]">
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[9px] font-bold" style={{ color: ASSET_COLORS[row.type] ?? ASSET_COLORS.equity }}>{listing?.symbol.slice(0, 3) ?? "?"}</span>
        <span className="min-w-0"><span className="block truncate font-semibold text-[var(--app-text)]">{listing?.name ?? "Unknown asset"}</span><span className="block truncate text-[10px] font-medium text-[var(--app-text-faint)]">{listing?.symbol ?? row.position.listing_id}</span></span>
        {row.position.state !== "open" && <span className="ml-auto rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[8px] uppercase text-[var(--app-text-faint)]">{row.position.state}</span>}
      </span>
      <span className="text-right tabular-nums text-[var(--app-text-muted)]">{row.price === null ? "—" : fmtCurrency(locale, row.price, listing?.currency ?? currency)}</span>
      <span className={`text-right font-medium tabular-nums ${row.dailyPct === null ? "text-[var(--app-text-faint)]" : dailyPositive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{row.dailyPct === null ? "—" : fmtPct(row.dailyPct)}</span>
      <span className="text-right font-medium tabular-nums text-[var(--app-text)]">{fmtCurrency(locale, row.value, currency)}</span>
      <span className="text-right tabular-nums text-[var(--app-text-muted)]">{row.allocation.toFixed(1)}%</span>
      <span className={`text-right font-medium tabular-nums ${positive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{row.returnPct === null ? "—" : fmtPct(row.returnPct)}</span>
    </Link>
  )
}

function AllocationView({ rows, locale, currency }: { rows: HoldingRow[]; locale: string; currency: string }) {
  return (
    <div className="grid gap-4 p-4 md:grid-cols-2">
      {rows.map((row) => {
        const profitable = row.pnl >= 0
        const tone = profitable ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"
        return (
          <Link key={row.position.id} href={`/positions/${row.position.id}`} className="app-muted-panel rounded-lg p-3 transition hover:border-[var(--app-border-strong)]">
            <div className="flex items-center justify-between gap-3 text-xs"><span className="truncate font-semibold text-[var(--app-text)]">{row.position.listing?.name ?? "Unknown asset"}</span><span className="shrink-0 tabular-nums text-[var(--app-text-muted)]">{row.allocation.toFixed(1)}%</span></div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]"><div className="h-full rounded-full" style={{ width: `${row.allocation}%`, background: ASSET_COLORS[row.type] ?? ASSET_COLORS.equity }} /></div>
            <div className="mt-2 flex items-end justify-between gap-3">
              <div><p className="text-[9px] text-[var(--app-text-faint)]">Current value</p><p className={`text-[11px] font-semibold tabular-nums ${tone}`}>{fmtCurrency(locale, row.value, currency)}</p></div>
              <div className="text-right"><p className="text-[9px] text-[var(--app-text-faint)]">Unrealized P&amp;L</p><p className={`text-[11px] font-semibold tabular-nums ${tone}`}>{row.pnl >= 0 ? "+" : ""}{fmtCurrency(locale, row.pnl, currency)}</p></div>
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

function ActivityPlaceholder() {
  return (
    <div className="flex min-h-52 items-center justify-center px-6 text-center">
      <div><p className="text-sm font-medium text-[var(--app-text)]">Portfolio activity is coming next</p><p className="mt-1 max-w-sm text-xs leading-5 text-[var(--app-text-muted)]">Transactions are currently available inside each position. A cross-portfolio activity API is required for this view.</p></div>
    </div>
  )
}

function IntelligenceRail({ model, locale, currency }: { model: Model; locale: string; currency: string }) {
  const topThree = model.openRows.slice(0, 3).reduce((sum, row) => sum + row.allocation, 0)
  return (
    <aside className="app-panel h-fit overflow-hidden rounded-xl">
      <div className="border-b border-[var(--app-border)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--app-text)]">Portfolio intelligence</h2><p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">Based on currently available data</p></div>
      <RailBlock title="Concentration">
        <div className="flex items-end justify-between gap-3"><div><p className="text-2xl font-semibold tabular-nums text-[var(--app-text)]">{topThree.toFixed(1)}%</p><p className="mt-1 text-[10px] text-[var(--app-text-muted)]">Top 3 holdings</p></div><span className={`rounded px-2 py-1 text-[9px] font-semibold ${topThree > 60 ? "bg-[color-mix(in_srgb,var(--app-negative)_14%,transparent)] text-[var(--app-negative)]" : "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"}`}>{topThree > 60 ? "High" : "Balanced"}</span></div>
      </RailBlock>
      <RailBlock title="Biggest mover today">
        {model.biggestMover ? <div className="flex items-center justify-between gap-3"><div><p className="font-semibold text-[var(--app-text)]">{model.biggestMover.position.listing?.symbol}</p><p className="text-[10px] text-[var(--app-text-faint)]">{model.biggestMover.position.listing?.name}</p></div><p className={`font-semibold tabular-nums ${(model.biggestMover.dailyPct ?? 0) >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{fmtPct(model.biggestMover.dailyPct ?? 0)}</p></div> : <p className="text-xs text-[var(--app-text-muted)]">No daily quote movement available.</p>}
      </RailBlock>
      <RailBlock title="Asset allocation"><AllocationDonut model={model} locale={locale} currency={currency} /></RailBlock>
      <RailBlock title="Data quality">
        <div className="space-y-2 text-[10px]"><QualityRow label="Open positions" value={String(model.openRows.length)} /><QualityRow label="Stale or unavailable" value={String(model.staleCount)} warning={model.staleCount > 0} /><QualityRow label="Invalid ledgers" value={String(model.invalidCount)} warning={model.invalidCount > 0} /></div>
      </RailBlock>
    </aside>
  )
}

function RailBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="border-b border-[var(--app-border)] p-4 last:border-b-0"><h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">{title}</h3>{children}</div>
}

function AllocationDonut({ model, locale, currency }: { model: Model; locale: string; currency: string }) {
  let cursor = 0
  const stops = model.byType.map(([type, value]) => {
    const pct = model.totalValue > 0 ? (value / model.totalValue) * 100 : 0
    const start = cursor
    cursor += pct
    return `${ASSET_COLORS[type] ?? ASSET_COLORS.equity} ${start}% ${cursor}%`
  }).join(", ")
  return (
    <div className="flex items-center gap-4">
      <div className="relative h-24 w-24 shrink-0 rounded-full" style={{ background: `conic-gradient(${stops || "var(--app-border) 0 100%"})` }}><span className="absolute inset-4 flex items-center justify-center rounded-full bg-[var(--app-surface)] text-center text-[9px] font-semibold tabular-nums text-[var(--app-text)]">{fmtCurrency(locale, model.totalValue, currency)}</span></div>
      <div className="min-w-0 flex-1 space-y-2">
        {model.byType.map(([type, value]) => <div key={type} className="flex items-center gap-2 text-[10px]"><span className="h-1.5 w-1.5 rounded-full" style={{ background: ASSET_COLORS[type] ?? ASSET_COLORS.equity }} /><span className="min-w-0 flex-1 truncate text-[var(--app-text-muted)]">{ASSET_LABELS[type] ?? type}</span><span className="tabular-nums text-[var(--app-text)]">{model.totalValue > 0 ? ((value / model.totalValue) * 100).toFixed(1) : "0.0"}%</span></div>)}
      </div>
    </div>
  )
}

function QualityRow({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return <div className="flex items-center justify-between border-b border-[var(--app-border)] pb-2 last:border-0 last:pb-0"><span className="text-[var(--app-text-muted)]">{label}</span><span className={warning ? "font-semibold text-[var(--app-warning)]" : "font-semibold text-[var(--app-text)]"}>{value}</span></div>
}
