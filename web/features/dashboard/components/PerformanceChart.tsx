"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { fmtPct, num } from "@/lib/format"
import { useTranslations } from "@/lib/i18n"
import type { BenchmarkReport, PerformancePeriod, PerformanceReport } from "@/lib/types"
import { useDashboardPrivacy } from "./DashboardPrivacy"

interface PerformanceChartProperties {
  report: PerformanceReport | null
  benchmark?: BenchmarkReport | null
  period: PerformancePeriod
  portfolioId?: string
  latestQuote?: string
  currency: string
  locale: string
  defaultMode?: ChartMode
}

type ChartMode = "portfolio" | "benchmark"

const performancePeriods: PerformancePeriod[] = ["1W", "1M", "YTD", "1Y", "ALL"]
const performanceChartModeStorageKey = "performance-chart-mode"
const chartWidth = 760
const chartHeight = 200

export function PerformanceChart({ report, benchmark, period, portfolioId, latestQuote, currency, locale, defaultMode = "portfolio" }: PerformanceChartProperties) {
  const [chartMode, setChartMode] = useState<ChartMode>(defaultMode)
  const { hidden, currency: privateCurrency } = useDashboardPrivacy()
  const translations = useTranslations()
  const points = report?.points ?? []
  const hasBenchmark = !!benchmark && benchmark.series.length >= 2

  const last = points[points.length - 1]
  const totalPnl = last ? (num(last.total_pnl) ?? 0) : 0
  const value = last ? (num(last.value) ?? 0) : 0
  const invested = last ? (num(last.invested_capital) ?? 0) : 0
  const returnPct = invested > 0 ? (totalPnl / invested) * 100 : null
  const up = totalPnl >= 0
  const color = up ? "var(--app-positive)" : "var(--app-negative)"
  const anyPartial = points.some((point) => !point.complete)
  const xirr = num(report?.returns?.money_weighted ?? null)
  const twr = num(report?.returns?.time_weighted ?? null)

  useEffect(() => {
    if (defaultMode === "benchmark") {
      setChartMode(hasBenchmark ? "benchmark" : "portfolio")
      return
    }
    const saved = localStorage.getItem(performanceChartModeStorageKey)
    if (saved === "portfolio" || saved === "benchmark") setChartMode(saved)
  }, [defaultMode, hasBenchmark])

  function selectChartMode(mode: ChartMode) {
    setChartMode(mode)
    localStorage.setItem(performanceChartModeStorageKey, mode)
  }

  return (
    <section className="app-panel overflow-hidden rounded-lg">
      <div className="app-panel-header flex min-h-[43px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">
            {translations("dashboard.performance")}
          </h2>
          <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">
            {latestQuote ? translations("dashboard.quotesAsOf", { time: new Date(latestQuote).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) }) : `${points.length} performance points`}
          </p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {hasBenchmark ? (
            <div className="flex h-8 items-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-0.5">
              <ChartModeButton active={chartMode === "portfolio"} onClick={() => selectChartMode("portfolio")}>Portfolio value</ChartModeButton>
              <ChartModeButton active={chartMode === "benchmark"} onClick={() => selectChartMode("benchmark")}>Benchmark comparison</ChartModeButton>
            </div>
          ) : null}
          <div className="flex h-8 items-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-0.5">
            {performancePeriods.map((performancePeriod) => (
              <Link
                key={performancePeriod}
                href={periodHref(portfolioId, performancePeriod)}
                className={`flex h-7 items-center rounded px-2 text-[10.5px] font-semibold transition ${
                  performancePeriod === period
                    ? "bg-[var(--app-accent)] text-white"
                    : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
                }`}
              >
                {performancePeriod}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-px border-b border-[var(--app-border)] bg-[var(--app-border)] sm:grid-cols-3">
        <div className="bg-[var(--app-surface-panel)] px-4 py-3">
          <p className="text-[10.5px] font-semibold text-[var(--app-text-muted)]">Portfolio value</p>
          <p className="mt-1 text-[16px] font-semibold tabular-nums leading-6 text-[var(--app-text)]">
            {privateCurrency(locale, value, currency)}
          </p>
          <p className="mt-0.5 text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">
            Current value
          </p>
        </div>
        <div className="bg-[var(--app-surface-panel)] px-4 py-3">
          <p className="text-[10.5px] font-semibold text-[var(--app-text-muted)]">Total P&L</p>
          <p className="mt-1 text-[16px] font-semibold tabular-nums leading-6" style={{ color }}>
            {!hidden && up ? "+" : ""}
            {privateCurrency(locale, totalPnl, currency)}
          </p>
          <p className="mt-0.5 text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">{returnPct !== null ? fmtPct(returnPct) : "Return unavailable"}</p>
        </div>
        <div className="bg-[var(--app-surface-panel)] px-4 py-3">
          <p className="text-[10.5px] font-semibold text-[var(--app-text-muted)]">Return method</p>
          <div className="mt-1 flex min-h-6 items-center gap-4">
            {xirr !== null ? <Metric label={translations("dashboard.xirr")} hint={translations("dashboard.xirrHint")} value={xirr} /> : null}
            {twr !== null ? <Metric label={translations("dashboard.twr")} hint={translations("dashboard.twrHint")} value={twr} /> : null}
            {xirr === null && twr === null ? <span className="text-[16px] font-semibold leading-6 text-[var(--app-text-faint)]">-</span> : null}
          </div>
          <p className="mt-0.5 text-[10.5px] font-medium text-[var(--app-text-faint)]">Money / time weighted</p>
        </div>
      </div>

      {points.length < 2 ? (
        <p className="px-4 py-10 text-center text-xs text-[var(--app-text-muted)]">
          {translations("dashboard.performanceEmpty")}
        </p>
      ) : (
        <Chart points={points} benchmark={chartMode === "benchmark" ? benchmark : null} color={color} currency={currency} locale={locale} />
      )}

      {anyPartial && points.length >= 2 && (
        <p className="px-4 pb-3 text-[10px] text-[var(--app-text-faint)]">{translations("dashboard.performancePartial")}</p>
      )}
    </section>
  )
}

function Chart({
  points,
  benchmark,
  color,
  currency,
  locale,
}: {
  points: NonNullable<PerformanceReport["points"]>
  benchmark?: BenchmarkReport | null
  color: string
  currency: string
  locale: string
}) {
  if (benchmark && benchmark.series.length >= 2) {
    return <RelativeChart benchmark={benchmark} locale={locale} />
  }
  return <AbsoluteChart points={points} color={color} currency={currency} locale={locale} />
}

function RelativeChart({
  benchmark,
  locale,
}: {
  benchmark: BenchmarkReport
  locale: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const portfolio = benchmark.series.map((point) => {
    const value = num(point.portfolio)
    return value === null ? null : value - 100
  })
  const comparison = benchmark.series.map((point) => {
    const value = num(point.benchmark)
    return value === null ? null : value - 100
  })
  const all = [...portfolio, ...comparison].filter((value): value is number => value !== null)
  const min = Math.min(0, ...all)
  const max = Math.max(0, ...all)
  const range = max - min || 1
  const x = (index: number) => (index / (benchmark.series.length - 1)) * chartWidth
  const y = (value: number) => chartHeight - ((value - min) / range) * (chartHeight - 16) - 8
  const path = (series: (number | null)[]) => {
    let result = ""
    let drawing = false
    series.forEach((value, index) => {
      if (value === null) {
        drawing = false
        return
      }
      result += `${drawing ? " L" : " M"} ${x(index).toFixed(1)},${y(value).toFixed(1)}`
      drawing = true
    })
    return result
  }
  const zero = y(0)
  const gridYs = [0.25, 0.5, 0.75].map((fraction) => 8 + (chartHeight - 16) * fraction)
  const portfolioReturn = num(benchmark.portfolio_return_pct)
  const benchmarkReturn = num(benchmark.benchmark_return_pct)
  const active = hovered === null ? null : benchmark.series[hovered]
  const activePortfolio = hovered === null ? null : portfolio[hovered]
  const activeBenchmark = hovered === null ? null : comparison[hovered]

  return (
    <div className="mt-2">
      <div className="relative px-4" onMouseLeave={() => setHovered(null)}>
        <span className="absolute right-5 top-0 text-[10px] tabular-nums text-[var(--app-text-faint)]">{fmtPct(max)}</span>
        <span className="absolute bottom-0 right-5 text-[10px] tabular-nums text-[var(--app-text-faint)]">{fmtPct(min)}</span>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-label="Relative portfolio and benchmark performance" className="h-48 w-full" onPointerMove={(event) => setHovered(nearestIndex(event, benchmark.series.length))}>
          {gridYs.map((gridY) => <line key={gridY} x1="0" y1={gridY} x2={chartWidth} y2={gridY} stroke="var(--app-border)" strokeWidth="1" strokeDasharray="4 6" />)}
          <line x1="0" y1={zero} x2={chartWidth} y2={zero} stroke="var(--app-border-strong)" strokeWidth="1" />
          <path d={path(comparison)} fill="none" stroke="var(--app-accent)" strokeWidth="1.75" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
          <path d={path(portfolio)} fill="none" stroke="var(--app-positive)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          {hovered !== null ? (
            <>
              <line x1={x(hovered)} y1="0" x2={x(hovered)} y2={chartHeight} stroke="var(--app-text-muted)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              {activePortfolio !== null ? <circle cx={x(hovered)} cy={y(activePortfolio)} r="3" fill="var(--app-positive)" vectorEffect="non-scaling-stroke" /> : null}
              {activeBenchmark !== null ? <circle cx={x(hovered)} cy={y(activeBenchmark)} r="3" fill="var(--app-accent)" vectorEffect="non-scaling-stroke" /> : null}
            </>
          ) : null}
        </svg>
        {active ? (
          <ChartTooltip position={tooltipPosition(hovered!, benchmark.series.length)} title={new Date(`${active.date}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium" })}>
            <TooltipRow label="Portfolio TWR" value={activePortfolio === null ? "-" : fmtPct(activePortfolio)} color="var(--app-positive)" />
            <TooltipRow label="Benchmark" value={activeBenchmark === null ? "-" : fmtPct(activeBenchmark)} color="var(--app-accent)" />
          </ChartTooltip>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between px-4 pb-3 text-[10px] text-[var(--app-text-faint)]">
        <span>{fmtDate(locale, benchmark.series[0]!.date)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1"><span className="inline-block h-0.5 w-3 rounded bg-[var(--app-positive)]" /> Portfolio TWR {portfolioReturn === null ? "" : `(${fmtPct(portfolioReturn)})`}</span>
          <span className="flex items-center gap-1"><span className="inline-block h-0 w-3 border-t border-dashed border-[var(--app-accent)]" /> Benchmark {benchmarkReturn === null ? "" : `(${fmtPct(benchmarkReturn)})`}</span>
        </span>
        <span>{fmtDate(locale, benchmark.series[benchmark.series.length - 1]!.date)}</span>
      </div>
    </div>
  )
}

function AbsoluteChart({
  points,
  color,
  currency,
  locale,
}: {
  points: NonNullable<PerformanceReport["points"]>
  color: string
  currency: string
  locale: string
}) {
  const [hovered, setHovered] = useState<number | null>(null)
  const { currency: privateCurrency } = useDashboardPrivacy()
  const translations = useTranslations()
  const values = points.map((point) => num(point.value) ?? 0)
  const invested = points.map((point) => num(point.invested_capital) ?? 0)
  const all = [...values, ...invested]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1

  const x = (i: number) => (i / (points.length - 1)) * chartWidth
  const y = (v: number) => chartHeight - ((v - min) / range) * (chartHeight - 16) - 8
  const line = (series: number[]) => series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")
  const valuePoints = line(values)
  const investedPoints = line(invested)
  const areaPath = `M ${valuePoints.split(" ")[0]} L ${valuePoints.split(" ").slice(1).join(" L ")} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`
  const gridYs = [0.25, 0.5, 0.75].map((f) => 8 + (chartHeight - 16) * f)
  const active = hovered === null ? null : points[hovered]

  return (
    <div className="mt-2">
      <div className="relative px-4" onMouseLeave={() => setHovered(null)}>
        <span className="absolute right-5 top-0 text-[10px] tabular-nums text-[var(--app-text-faint)]">
          {privateCurrency(locale, max, currency)}
        </span>
        <span className="absolute bottom-0 right-5 text-[10px] tabular-nums text-[var(--app-text-faint)]">
          {privateCurrency(locale, min, currency)}
        </span>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none" aria-label="Portfolio value and invested capital" className="h-48 w-full" onPointerMove={(event) => setHovered(nearestIndex(event, points.length))}>
          <defs>
            <linearGradient id="perf-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridYs.map((gy) => (
            <line key={gy} x1="0" y1={gy} x2={chartWidth} y2={gy} stroke="var(--app-border)" strokeWidth="1" strokeDasharray="4 6" />
          ))}
          <path d={areaPath} fill="url(#perf-chart-fill)" />
          {/* Cost basis reference line (muted, dashed). */}
          <polyline
            points={investedPoints}
            fill="none"
            stroke="var(--app-text-faint)"
            strokeWidth="1.5"
            strokeDasharray="5 5"
            vectorEffect="non-scaling-stroke"
          />
          {/* Portfolio value (primary). */}
          <polyline
            points={valuePoints}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {hovered !== null ? (
            <>
              <line x1={x(hovered)} y1="0" x2={x(hovered)} y2={chartHeight} stroke="var(--app-text-muted)" strokeWidth="1" strokeDasharray="3 4" vectorEffect="non-scaling-stroke" />
              <circle cx={x(hovered)} cy={y(values[hovered]!)} r="3" fill={color} vectorEffect="non-scaling-stroke" />
              <circle cx={x(hovered)} cy={y(invested[hovered]!)} r="3" fill="var(--app-text-faint)" vectorEffect="non-scaling-stroke" />
            </>
          ) : null}
        </svg>
        {active ? (
          <ChartTooltip position={tooltipPosition(hovered!, points.length)} title={new Date(`${active.date}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium" })}>
            <TooltipRow label={translations("dashboard.currentValue")} value={privateCurrency(locale, values[hovered!]!, currency)} color={color} />
            <TooltipRow label={translations("dashboard.investedCapital")} value={privateCurrency(locale, invested[hovered!]!, currency)} color="var(--app-text-muted)" />
            <TooltipRow label="Total P&L" value={privateCurrency(locale, num(active.total_pnl) ?? 0, currency)} color={(num(active.total_pnl) ?? 0) >= 0 ? "var(--app-positive)" : "var(--app-negative)"} />
          </ChartTooltip>
        ) : null}
      </div>
      <div className="mt-1.5 flex items-center justify-between px-4 pb-3 text-[10px] text-[var(--app-text-faint)]">
        <span>{fmtDate(locale, points[0]!.date)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} /> {translations("dashboard.currentValue")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dashed border-[var(--app-text-faint)]" />{" "}
            {translations("dashboard.investedCapital")}
          </span>
        </span>
        <span>{fmtDate(locale, points[points.length - 1]!.date)}</span>
      </div>
    </div>
  )
}

function nearestIndex(event: React.PointerEvent<SVGSVGElement>, count: number): number {
  const rect = event.currentTarget.getBoundingClientRect()
  const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
  return Math.round(ratio * (count - 1))
}

function tooltipPosition(index: number, count: number): { left: string; transform: string } {
  const ratio = count <= 1 ? 0.5 : index / (count - 1)
  const translate = ratio <= 0.15 ? 0 : ratio >= 0.85 ? -100 : -50
  return { left: `${ratio * 100}%`, transform: `translateX(${translate}%)` }
}

function ChartTooltip({ position, title, children }: { position: { left: string; transform: string }; title: string; children: React.ReactNode }) {
  return (
    <div className="pointer-events-none absolute top-2 z-10 min-w-40 rounded-lg border border-[var(--app-border-strong)] bg-[color-mix(in_srgb,var(--app-surface)_96%,transparent)] px-3 py-2 shadow-xl backdrop-blur" style={position}>
      <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{title}</p>
      <div className="space-y-1">{children}</div>
    </div>
  )
}

function TooltipRow({ label, value, color }: { label: string; value: string; color: string }) {
  return <div className="flex items-center justify-between gap-4 text-[10px]"><span className="text-[var(--app-text-muted)]">{label}</span><span className="font-semibold tabular-nums" style={{ color }}>{value}</span></div>
}

function ChartModeButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-7 rounded px-2 text-[10.5px] font-semibold transition ${
        active
          ? "bg-[var(--app-accent)] text-white"
          : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
      }`}
    >
      {children}
    </button>
  )
}

function Metric({ label, hint, value }: { label: string; hint: string; value: number }) {
  const color = value >= 0 ? "var(--app-positive)" : "var(--app-negative)"
  return (
    <span className="min-w-0 leading-tight" title={hint}>
      <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</span>
      <span className="mt-0.5 block text-[13px] font-semibold tabular-nums" style={{ color }}>
        {fmtPct(value)}
      </span>
    </span>
  )
}

function periodHref(portfolioId: string | undefined, period: PerformancePeriod): string {
  const params = new URLSearchParams()
  if (portfolioId) params.set("portfolio", portfolioId)
  params.set("period", period)
  return `/dashboard?${params.toString()}`
}

function fmtDate(locale: string, s: string): string {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "2-digit" })
}
