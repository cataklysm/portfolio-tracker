"use client"

import { useMemo, useState } from "react"
import { fmtPct, num } from "@/lib/format"
import type { SparklinePoint } from "@/lib/types"

const PERIODS = [
  { key: "5m", label: "5m", durationMs: 5 * 60 * 1000 },
  { key: "1d", label: "1D", durationMs: 24 * 60 * 60 * 1000 },
  { key: "1w", label: "1W", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "1M", durationMs: 31 * 24 * 60 * 60 * 1000 },
  { key: "3m", label: "3M", durationMs: 93 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "1Y", durationMs: 366 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All", durationMs: null },
] as const

type PeriodKey = (typeof PERIODS)[number]["key"]

interface AssetPriceChartProperties {
  currency: string
  dailyData?: SparklinePoint[]
  dailyPositive: boolean
  data: SparklinePoint[]
  locale: string
}

interface ChartPoint {
  price: number
  time: string
  volume: number | null
}

const chartWidth = 900
const chartHeight = 270

export function AssetPriceChart({
  currency,
  dailyData = [],
  dailyPositive,
  data,
  locale,
}: AssetPriceChartProperties) {
  const intradaySeries = useMemo(() => normalizeSeries(data), [data])
  const dailySeries = useMemo(() => normalizeSeries(dailyData), [dailyData])
  const seriesByPeriod = useMemo(() => new Map(PERIODS.map((period) => {
    const source = period.key === "5m" || period.key === "1d" ? intradaySeries : dailySeries.length >= 2 ? dailySeries : intradaySeries
    const latestTime = source.length > 0 ? new Date(source[source.length - 1]!.time).getTime() : 0
    const visible = period.durationMs === null
      ? source
      : source.filter((point) => new Date(point.time).getTime() >= latestTime - period.durationMs!)
    return [period.key, visible] as const
  })), [dailySeries, intradaySeries])
  const defaultPeriod = PERIODS.find((period) => period.key === "1m" && (seriesByPeriod.get(period.key)?.length ?? 0) >= 2)
    ?? [...PERIODS].reverse().find((period) => (seriesByPeriod.get(period.key)?.length ?? 0) >= 2)
    ?? PERIODS[PERIODS.length - 1]
  const [period, setPeriod] = useState<PeriodKey>(defaultPeriod.key)
  const visibleSeries = seriesByPeriod.get(period) ?? []
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, visibleSeries.length - 1))
  const clampedIndex = Math.min(selectedIndex, Math.max(0, visibleSeries.length - 1))
  const selectedPoint = visibleSeries[clampedIndex] ?? null
  const start = visibleSeries[0]?.price ?? null
  const end = visibleSeries[visibleSeries.length - 1]?.price ?? null
  const periodReturn = start !== null && end !== null && start !== 0 ? ((end - start) / start) * 100 : null
  const positive = periodReturn === null ? dailyPositive : periodReturn >= 0

  function changePeriod(nextPeriod: PeriodKey) {
    const nextSeries = seriesByPeriod.get(nextPeriod) ?? []
    setPeriod(nextPeriod)
    setSelectedIndex(Math.max(0, nextSeries.length - 1))
  }

  return (
    <div className="flex min-h-[470px] flex-col">
      <div className="border-b border-[var(--app-border)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-[13px] font-semibold leading-5 text-[var(--app-text)]">Market price</h2>
            <p className="mt-0.5 text-[10.5px] font-medium text-[var(--app-text-faint)]">{visibleSeries.length} stored price points</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className={`text-[12px] font-semibold tabular-nums ${periodReturn === null ? "text-[var(--app-text-faint)]" : positive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
              {periodReturn === null ? "History unavailable" : `${fmtPct(periodReturn)} shown period`}
            </span>
            <div className="flex h-8 items-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-0.5">
              {PERIODS.map((item) => {
                const enabled = (seriesByPeriod.get(item.key)?.length ?? 0) >= 2
                return (
                  <button
                    className={`h-7 rounded px-2 text-[10.5px] font-semibold transition ${period === item.key ? "bg-[var(--app-accent)] text-white" : enabled ? "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]" : "cursor-not-allowed text-[var(--app-text-faint)] opacity-35"}`}
                    disabled={!enabled}
                    key={item.key}
                    onClick={() => changePeriod(item.key)}
                    type="button"
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 px-4 pb-4 pt-3">
        {visibleSeries.length >= 2 ? (
          <InteractivePriceChart
            currency={currency}
            locale={locale}
            onSelect={setSelectedIndex}
            positive={positive}
            selectedIndex={clampedIndex}
            selectedPoint={selectedPoint}
            series={visibleSeries}
          />
        ) : (
          <div className="flex h-full min-h-[340px] items-center justify-center text-[12px] font-medium text-[var(--app-text-faint)]">
            Price history is not available for this period.
          </div>
        )}
      </div>
    </div>
  )
}

function InteractivePriceChart({
  currency,
  locale,
  onSelect,
  positive,
  selectedIndex,
  selectedPoint,
  series,
}: {
  currency: string
  locale: string
  onSelect: (index: number) => void
  positive: boolean
  selectedIndex: number
  selectedPoint: ChartPoint | null
  series: ChartPoint[]
}) {
  const color = positive ? "var(--app-positive)" : "var(--app-negative)"
  const prices = series.map((point) => point.price)
  const min = Math.min(...prices)
  const max = Math.max(...prices)
  const range = max - min || 1
  const coords = series.map((point, index) => {
    const x = (index / (series.length - 1)) * chartWidth
    const y = chartHeight - ((point.price - min) / range) * (chartHeight - 20) - 10
    return { x, y }
  })
  const selectedCoord = coords[selectedIndex] ?? coords[coords.length - 1]!
  const points = coords.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`)
  const areaPath = `M ${points[0]} L ${points.slice(1).join(" L ")} L ${chartWidth},${chartHeight} L 0,${chartHeight} Z`
  const { bars, basis } = buildBrushBars(series)

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    onSelect(Math.round(ratio * (series.length - 1)))
  }

  return (
    <div className="flex h-full min-h-[370px] flex-col">
      <div className="relative min-h-0 flex-1">
        <span className="absolute right-2 top-1 text-[11px] font-medium tabular-nums text-[var(--app-text-faint)]">
          {formatPrice(locale, max, currency)}
        </span>
        <span className="absolute bottom-1 right-2 text-[11px] font-medium tabular-nums text-[var(--app-text-faint)]">
          {formatPrice(locale, min, currency)}
        </span>
        {selectedPoint ? (
          <div
            className="pointer-events-none absolute z-10 min-w-32 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-panel)] px-2.5 py-2 shadow-[var(--app-shadow)]"
            style={{
              left: `${Math.min(82, Math.max(3, (selectedCoord.x / chartWidth) * 100))}%`,
              top: `${Math.min(76, Math.max(8, (selectedCoord.y / chartHeight) * 100))}%`,
              transform: selectedCoord.x > chartWidth * 0.72 ? "translate(-100%, -12px)" : "translate(10px, -12px)",
            }}
          >
            <p className="text-[12px] font-semibold tabular-nums text-[var(--app-text)]">{formatPrice(locale, selectedPoint.price, currency)}</p>
            <p className="mt-0.5 text-[10px] font-medium text-[var(--app-text-faint)]">{formatTooltipDate(locale, selectedPoint.time)}</p>
          </div>
        ) : null}

        <svg
          aria-label="Market price chart"
          className="h-full min-h-[300px] w-full cursor-crosshair"
          onMouseLeave={() => onSelect(series.length - 1)}
          onMouseMove={handleMouseMove}
          preserveAspectRatio="none"
          role="img"
          viewBox={`0 0 ${chartWidth} ${chartHeight}`}
        >
          <defs>
            <linearGradient id="asset-price-chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={positive ? "#34d399" : "#fb7185"} stopOpacity="0.24" />
              <stop offset="100%" stopColor={positive ? "#34d399" : "#fb7185"} stopOpacity="0" />
            </linearGradient>
          </defs>
          {[0.25, 0.5, 0.75].map((fraction) => {
            const y = 10 + (chartHeight - 20) * fraction
            return <line key={fraction} stroke="var(--app-border)" strokeDasharray="5 8" strokeWidth="1" vectorEffect="non-scaling-stroke" x1="0" x2={chartWidth} y1={y} y2={y} />
          })}
          <path d={areaPath} fill="url(#asset-price-chart-fill)" />
          <polyline fill="none" points={points.join(" ")} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
          <line stroke="color-mix(in srgb, var(--app-accent) 72%, white)" strokeDasharray="3 5" strokeWidth="1" vectorEffect="non-scaling-stroke" x1={selectedCoord.x} x2={selectedCoord.x} y1="0" y2={chartHeight} />
          <circle cx={selectedCoord.x} cy={selectedCoord.y} fill={color} r="4" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="mt-3 border-t border-[var(--app-border)] pt-3">
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">
          {basis === "volume" ? "Volume" : "Price activity"}
        </p>
        <div className="grid h-12 grid-cols-[repeat(var(--bar-count),minmax(1px,1fr))] items-end gap-px" style={{ "--bar-count": bars.length } as React.CSSProperties}>
          {bars.map((bar, index) => (
            <button
              aria-label={`Select price point ${index + 1}`}
              className={`min-h-1 rounded-t-sm transition ${index === selectedIndex ? "bg-[var(--app-accent)]" : "bg-[color-mix(in_srgb,var(--app-accent)_26%,var(--app-surface-raised))] hover:bg-[color-mix(in_srgb,var(--app-accent)_48%,var(--app-surface-raised))]"}`}
              key={`${series[index]?.time ?? index}-${index}`}
              onClick={() => onSelect(index)}
              style={{ height: `${Math.max(12, bar * 100)}%` }}
              type="button"
            />
          ))}
        </div>
        <input
          aria-label="Scrub through price history"
          className="mt-2 w-full accent-[var(--app-accent)]"
          max={series.length - 1}
          min={0}
          onChange={(event) => onSelect(Number(event.target.value))}
          type="range"
          value={selectedIndex}
        />
        <div className="mt-1 flex justify-between text-[10.5px] font-medium text-[var(--app-text-faint)]">
          <span>{formatAxisDate(locale, series[0]!.time)}</span>
          <span>{formatAxisDate(locale, series[Math.floor(series.length / 2)]!.time)}</span>
          <span>{formatAxisDate(locale, series[series.length - 1]!.time)}</span>
        </div>
      </div>
    </div>
  )
}

function normalizeSeries(points: SparklinePoint[]): ChartPoint[] {
  return points
    .map((point) => ({ price: num(point.price), time: point.time, volume: num(point.volume ?? null) }))
    .filter((point): point is ChartPoint => point.price !== null)
    .sort((first, second) => new Date(first.time).getTime() - new Date(second.time).getTime())
}

/**
 * Bars under the chart. When the series carries real trading volume we render
 * that (true volume); otherwise we fall back to a neutral per-point price-change
 * proxy ("price activity") rather than presenting a fabricated volume (theme 1).
 */
function buildBrushBars(series: ChartPoint[]): { bars: number[]; basis: "volume" | "activity" } {
  const hasVolume = series.some((point) => point.volume !== null && point.volume > 0)
  if (hasVolume) {
    const values = series.map((point) => point.volume ?? 0)
    const max = Math.max(...values, 1)
    return { bars: values.map((value) => Math.max(0.04, value / max)), basis: "volume" }
  }
  const values = series.map((point, index) => Math.abs(point.price - (series[index - 1]?.price ?? point.price)))
  const max = Math.max(...values, 1)
  return { bars: values.map((value) => Math.max(0.08, value / max)), basis: "activity" }
}

function formatAxisDate(locale: string, value: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short" })
}

function formatTooltipDate(locale: string, value: string): string {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
}

function formatPrice(locale: string, value: number, currency: string): string {
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value)
}
