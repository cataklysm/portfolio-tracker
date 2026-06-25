"use client"

import { useEffect, useMemo, useState } from "react"
import { fmtPct, num } from "@/lib/format"
import type { ConvertedPriceTarget, SparklinePoint } from "@/lib/types"

const priceChartPeriods = [
  { key: "5m", label: "5m", durationMs: 5 * 60 * 1000 },
  { key: "1d", label: "1D", durationMs: null },
  { key: "1w", label: "1W", durationMs: 7 * 24 * 60 * 60 * 1000 },
  { key: "1m", label: "1M", durationMs: 31 * 24 * 60 * 60 * 1000 },
  { key: "3m", label: "3M", durationMs: 93 * 24 * 60 * 60 * 1000 },
  { key: "1y", label: "1Y", durationMs: 366 * 24 * 60 * 60 * 1000 },
  { key: "all", label: "All", durationMs: null },
] as const

type PriceChartPeriodKey = (typeof priceChartPeriods)[number]["key"]

interface AssetPriceChartProperties {
  currency: string
  dailyData?: SparklinePoint[]
  dailyPositive: boolean
  data: SparklinePoint[]
  locale: string
  targetZones?: ConvertedPriceTarget[]
  tradeMarkers?: AssetTradeMarker[]
}

interface ChartPoint {
  price: number
  time: string
  volume: number | null
}

interface TargetBand {
  high: number
  id: string
  label: string
  low: number
}

export interface AssetTradeMarker {
  id: string
  portfolioName: string
  price: number
  quantity: number | null
  side: "buy" | "sell"
  time: string
}

const chartWidth = 900
const chartHeight = 230
const priceChartPeriodStorageKey = "asset-detail-price-chart-period"

export function AssetPriceChart({
  currency,
  dailyData = [],
  dailyPositive,
  data,
  locale,
  targetZones = [],
  tradeMarkers = [],
}: AssetPriceChartProperties) {
  const intradaySeries = useMemo(() => normalizeSeries(data), [data])
  const dailySeries = useMemo(() => normalizeSeries(dailyData), [dailyData])
  const seriesByPeriod = useMemo(() => new Map(priceChartPeriods.map((period) => {
    const source = period.key === "5m" || period.key === "1d" ? intradaySeries : dailySeries.length >= 2 ? dailySeries : intradaySeries
    const latestTime = source.length > 0 ? new Date(source[source.length - 1]!.time).getTime() : 0
    const visible = getVisibleSeriesForPeriod(period.key, period.durationMs, source, latestTime)
    return [period.key, visible] as const
  })), [dailySeries, intradaySeries])
  const defaultPeriod = getDefaultPeriod(seriesByPeriod)
  const [period, setPeriod] = useState<PriceChartPeriodKey>(defaultPeriod)
  const [hasLoadedStoredPeriod, setHasLoadedStoredPeriod] = useState(false)
  const visibleSeries = seriesByPeriod.get(period) ?? []
  const [selectedIndex, setSelectedIndex] = useState(Math.max(0, visibleSeries.length - 1))
  const clampedIndex = Math.min(selectedIndex, Math.max(0, visibleSeries.length - 1))
  const selectedPoint = visibleSeries[clampedIndex] ?? null
  const start = visibleSeries[0]?.price ?? null
  const end = visibleSeries[visibleSeries.length - 1]?.price ?? null
  const periodReturn = start !== null && end !== null && start !== 0 ? ((end - start) / start) * 100 : null
  const positive = periodReturn === null ? dailyPositive : periodReturn >= 0

  useEffect(() => {
    const storedPeriod = readStoredPeriod()
    if (storedPeriod && isPeriodEnabled(storedPeriod, seriesByPeriod)) {
      setPeriod(storedPeriod)
      setSelectedIndex(Math.max(0, (seriesByPeriod.get(storedPeriod)?.length ?? 1) - 1))
    }
    setHasLoadedStoredPeriod(true)
  }, [seriesByPeriod])

  useEffect(() => {
    if (!hasLoadedStoredPeriod) return
    if (!isPeriodEnabled(period, seriesByPeriod)) {
      const nextPeriod = getDefaultPeriod(seriesByPeriod)
      setPeriod(nextPeriod)
      setSelectedIndex(Math.max(0, (seriesByPeriod.get(nextPeriod)?.length ?? 1) - 1))
    }
  }, [hasLoadedStoredPeriod, period, seriesByPeriod])

  useEffect(() => {
    if (!hasLoadedStoredPeriod) return
    storePeriod(period)
  }, [hasLoadedStoredPeriod, period])

  function changePeriod(nextPeriod: PriceChartPeriodKey) {
    const nextSeries = seriesByPeriod.get(nextPeriod) ?? []
    setPeriod(nextPeriod)
    setSelectedIndex(Math.max(0, nextSeries.length - 1))
  }

  return (
    <div className="flex min-h-[360px] flex-col">
      <div className="app-panel-header flex min-h-[43px] flex-wrap items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">Market price</h2>
          <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">{visibleSeries.length} stored price points</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className={`text-[12px] font-semibold tabular-nums ${periodReturn === null ? "text-[var(--app-text-faint)]" : positive ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
            {periodReturn === null ? "History unavailable" : `${fmtPct(periodReturn)} shown period`}
          </span>
          <div className="flex h-8 items-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-0.5">
            {priceChartPeriods.map((item) => {
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
            targetZones={targetZones}
            tradeMarkers={tradeMarkers}
          />
        ) : (
          <div className="flex h-full min-h-[240px] items-center justify-center text-[12px] font-medium text-[var(--app-text-faint)]">
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
  targetZones,
  tradeMarkers,
}: {
  currency: string
  locale: string
  onSelect: (index: number) => void
  positive: boolean
  selectedIndex: number
  selectedPoint: ChartPoint | null
  series: ChartPoint[]
  targetZones: ConvertedPriceTarget[]
  tradeMarkers: AssetTradeMarker[]
}) {
  const color = positive ? "var(--app-positive)" : "var(--app-negative)"
  const prices = series.map((point) => point.price)
  const targetBands = buildTargetBands(targetZones, currency)
  const visibleMarkers = buildVisibleTradeMarkers(series, tradeMarkers)
  const { min, max } = buildChartDomain(prices, targetBands, visibleMarkers)
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
  const periodStart = series[0] ?? null
  const selectedChange = selectedPoint && periodStart && periodStart.price !== 0
    ? ((selectedPoint.price - periodStart.price) / periodStart.price) * 100
    : null

  function handleMouseMove(event: React.MouseEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width))
    onSelect(Math.round(ratio * (series.length - 1)))
  }

  return (
    <div className="flex h-full min-h-[275px] flex-col">
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
            <p className="text-[12px] font-semibold tabular-nums text-[var(--app-text)]">{formatTooltipDate(locale, selectedPoint.time)}</p>
            <dl className="mt-2 space-y-1 text-[10px]">
              <TooltipMetric label="Price" value={formatPrice(locale, selectedPoint.price, currency)} />
              <TooltipMetric
                label="Period change"
                tone={selectedChange === null ? undefined : selectedChange >= 0 ? "positive" : "negative"}
                value={selectedChange === null ? "-" : fmtPct(selectedChange)}
              />
              {basis === "volume" ? (
                <TooltipMetric label="Volume" value={formatVolume(locale, selectedPoint.volume)} />
              ) : null}
            </dl>
          </div>
        ) : null}

        <svg
          aria-label="Market price chart"
          className="h-full min-h-[205px] w-full cursor-crosshair"
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
          {targetBands.map((band) => {
            const top = priceToY(band.high, min, range)
            const bottom = priceToY(band.low, min, range)
            const height = Math.max(6, bottom - top)
            return (
              <g key={band.id}>
                <rect
                  fill="rgba(52, 211, 153, 0.1)"
                  height={height}
                  stroke="rgba(52, 211, 153, 0.28)"
                  strokeDasharray="4 5"
                  vectorEffect="non-scaling-stroke"
                  width={chartWidth}
                  x="0"
                  y={top}
                />
                <text fill="var(--app-positive)" fontSize="10" fontWeight="600" x="10" y={top + 14}>
                  {band.label}
                </text>
              </g>
            )
          })}
          <polyline fill="none" points={points.join(" ")} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
          {visibleMarkers.map((marker) => {
            const markerColor = marker.side === "buy" ? "var(--app-positive)" : "var(--app-negative)"
            const markerY = priceToY(marker.price, min, range)
            const markerX = coords[marker.index]?.x ?? 0
            return (
              <g key={marker.id}>
                <title>{formatTradeMarkerTitle(marker, locale, currency)}</title>
                <circle
                  cx={markerX}
                  cy={markerY}
                  fill={markerColor}
                  r="6.2"
                  stroke="var(--app-surface-panel)"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
                <text
                  dominantBaseline="central"
                  fill="var(--app-bg)"
                  fontSize="7.5"
                  fontWeight="900"
                  textAnchor="middle"
                  x={markerX}
                  y={markerY + 0.2}
                >
                  {marker.side === "buy" ? "B" : "S"}
                </text>
              </g>
            )
          })}
          <line stroke="color-mix(in srgb, var(--app-accent) 72%, white)" strokeDasharray="3 5" strokeWidth="1" vectorEffect="non-scaling-stroke" x1={selectedCoord.x} x2={selectedCoord.x} y1="0" y2={chartHeight} />
          <circle cx={selectedCoord.x} cy={selectedCoord.y} fill={color} r="4" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>

      <div className="mt-3 border-t border-[var(--app-border)] pt-3">
        <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">
          {basis === "volume" ? "Volume" : "Price activity"}
        </p>
        <div className="grid h-9 grid-cols-[repeat(var(--bar-count),minmax(1px,1fr))] items-end gap-px" style={{ "--bar-count": bars.length } as React.CSSProperties}>
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

function TooltipMetric({
  label,
  tone,
  value,
}: {
  label: string
  tone?: "positive" | "negative"
  value: string
}) {
  const color = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="flex items-center justify-between gap-5">
      <dt className="text-[var(--app-text-faint)]">{label}</dt>
      <dd className={`font-semibold tabular-nums ${color}`}>{value}</dd>
    </div>
  )
}

function getDefaultPeriod(seriesByPeriod: Map<PriceChartPeriodKey, ChartPoint[]>): PriceChartPeriodKey {
  if (isPeriodEnabled("1d", seriesByPeriod)) return "1d"
  return priceChartPeriods.find((period) => isPeriodEnabled(period.key, seriesByPeriod))?.key ?? "1d"
}

function isPeriodEnabled(period: PriceChartPeriodKey, seriesByPeriod: Map<PriceChartPeriodKey, ChartPoint[]>): boolean {
  return (seriesByPeriod.get(period)?.length ?? 0) >= 2
}

function readStoredPeriod(): PriceChartPeriodKey | null {
  try {
    const storedPeriod = window.localStorage.getItem(priceChartPeriodStorageKey)
    return priceChartPeriods.some((period) => period.key === storedPeriod) ? (storedPeriod as PriceChartPeriodKey) : null
  } catch {
    return null
  }
}

function storePeriod(period: PriceChartPeriodKey) {
  try {
    window.localStorage.setItem(priceChartPeriodStorageKey, period)
  } catch {
    // Keep the chart usable when browser storage is disabled.
  }
}

function normalizeSeries(points: SparklinePoint[]): ChartPoint[] {
  return points
    .map((point) => ({ price: num(point.price), time: point.time, volume: num(point.volume ?? null) }))
    .filter((point): point is ChartPoint => point.price !== null)
    .sort((first, second) => new Date(first.time).getTime() - new Date(second.time).getTime())
}

function getVisibleSeriesForPeriod(
  period: PriceChartPeriodKey,
  durationMs: number | null,
  source: ChartPoint[],
  latestTime: number,
): ChartPoint[] {
  if (period === "1d") return filterLatestTradingDay(source)
  if (durationMs === null) return source
  return source.filter((point) => new Date(point.time).getTime() >= latestTime - durationMs)
}

function filterLatestTradingDay(source: ChartPoint[]): ChartPoint[] {
  const latestPoint = source[source.length - 1]
  if (!latestPoint) return []
  const latestDay = toLocalDateKey(latestPoint.time)
  return source.filter((point) => toLocalDateKey(point.time) === latestDay)
}

function toLocalDateKey(value: string): string {
  const date = new Date(value)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
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

function buildTargetBands(
  targetZones: ConvertedPriceTarget[],
  currency: string,
): TargetBand[] {
  return targetZones
    .filter((target) => target.display_currency === currency && target.fx_status !== "unavailable")
    .map((target) => {
      const low = num(target.display_zone_low)
      const high = num(target.display_zone_high)
      if (low === null && high === null) return null
      const lower = low ?? high!
      const upper = high ?? low!
      return {
        high: Math.max(lower, upper),
        id: target.id,
        label: formatTargetBandLabel(target, lower, upper),
        low: Math.min(lower, upper),
      }
    })
    .filter((target): target is TargetBand => target !== null)
    .slice(0, 3)
}

interface VisibleTradeMarker extends AssetTradeMarker {
  index: number
}

function buildVisibleTradeMarkers(series: ChartPoint[], tradeMarkers: AssetTradeMarker[]): VisibleTradeMarker[] {
  const firstTime = new Date(series[0]?.time ?? 0).getTime()
  const lastTime = new Date(series[series.length - 1]?.time ?? 0).getTime()
  if (!Number.isFinite(firstTime) || !Number.isFinite(lastTime)) return []

  return tradeMarkers
    .map((marker) => {
      const markerTime = new Date(marker.time).getTime()
      if (!Number.isFinite(markerTime) || markerTime < firstTime || markerTime > lastTime) return null
      return {
        ...marker,
        index: nearestSeriesIndex(series, markerTime),
      }
    })
    .filter((marker): marker is VisibleTradeMarker => marker !== null)
}

function nearestSeriesIndex(series: ChartPoint[], markerTime: number): number {
  let nearestIndex = 0
  let nearestDistance = Number.POSITIVE_INFINITY
  series.forEach((point, index) => {
    const distance = Math.abs(new Date(point.time).getTime() - markerTime)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearestIndex = index
    }
  })
  return nearestIndex
}

function buildChartDomain(prices: number[], targetBands: TargetBand[], tradeMarkers: VisibleTradeMarker[]): { max: number; min: number } {
  const targetValues = targetBands.flatMap((target) => [target.low, target.high])
  const tradeValues = tradeMarkers.map((marker) => marker.price)
  const values = [...prices, ...targetValues, ...tradeValues].filter((value) => Number.isFinite(value))
  const rawMin = Math.min(...values)
  const rawMax = Math.max(...values)
  const spread = rawMax - rawMin
  const padding = spread > 0 ? spread * 0.05 : Math.max(rawMax * 0.02, 1)
  return {
    max: rawMax + padding,
    min: Math.max(0, rawMin - padding),
  }
}

function formatTargetBandLabel(target: ConvertedPriceTarget, low: number, high: number): string {
  const displayed = low === high
    ? `Target ${low.toFixed(2)} ${target.display_currency}`
    : `Target zone ${low.toFixed(2)} - ${high.toFixed(2)} ${target.display_currency}`
  if (target.fx_status !== "converted") return displayed
  const sourceLow = num(target.zone_low)
  const sourceHigh = num(target.zone_high)
  const source = sourceLow !== null && sourceHigh !== null
    ? `${sourceLow.toFixed(2)} - ${sourceHigh.toFixed(2)} ${target.currency}`
    : sourceLow !== null
      ? `${sourceLow.toFixed(2)} ${target.currency}`
      : sourceHigh !== null
        ? `${sourceHigh.toFixed(2)} ${target.currency}`
        : target.currency
  return `${displayed} (from ${source})`
}

function priceToY(price: number, min: number, range: number): number {
  return chartHeight - ((price - min) / range) * (chartHeight - 20) - 10
}

function formatAxisDate(locale: string, value: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "short" })
}

function formatTooltipDate(locale: string, value: string): string {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
}

function formatTradeMarkerTitle(marker: AssetTradeMarker, locale: string, currency: string): string {
  const side = marker.side === "buy" ? "Buy" : "Sell"
  const quantity = marker.quantity === null ? "" : ` · ${new Intl.NumberFormat(locale, { maximumFractionDigits: 6 }).format(marker.quantity)}`
  return `${side}${quantity} · ${formatPrice(locale, marker.price, currency)} · ${marker.portfolioName}`
}

function formatPrice(locale: string, value: number, currency: string): string {
  return new Intl.NumberFormat(locale, {
    currency,
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  }).format(value)
}

function formatVolume(locale: string, value: number | null): string {
  if (value === null) return "-"
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 1, notation: "compact" }).format(value)
}
