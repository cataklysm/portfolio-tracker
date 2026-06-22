"use client"
import { useMemo, useState } from "react"
import type { SparklinePoint } from "@/lib/types"
import { fmtPct, num } from "@/lib/format"
import { PriceChart } from "./PriceChart"

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

interface Props {
  data: SparklinePoint[]
  dailyData?: SparklinePoint[]
  currency: string
  locale: string
  dailyPositive: boolean
}

export function PositionPriceChart({ data, dailyData = [], currency, locale, dailyPositive }: Props) {
  const sorted = useMemo(() => [...data].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()), [data])
  const dailySorted = useMemo(() => [...dailyData].sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime()), [dailyData])
  const seriesByPeriod = useMemo(() => new Map(PERIODS.map((period) => {
    const source = period.key === "5m" || period.key === "1d" ? sorted : dailySorted.length >= 2 ? dailySorted : sorted
    const latestTime = source.length > 0 ? new Date(source[source.length - 1]!.time).getTime() : 0
    return [
      period.key,
      period.durationMs === null ? source : source.filter((point) => new Date(point.time).getTime() >= latestTime - period.durationMs!),
    ]
  })), [dailySorted, sorted])
  const defaultPeriod = PERIODS.find((period) => period.key === "1m" && (seriesByPeriod.get(period.key)?.length ?? 0) >= 2)
    ?? [...PERIODS].reverse().find((period) => (seriesByPeriod.get(period.key)?.length ?? 0) >= 2)
    ?? PERIODS[PERIODS.length - 1]
  const [period, setPeriod] = useState<PeriodKey>(defaultPeriod.key)
  const visible = seriesByPeriod.get(period) ?? []
  const start = visible.length > 1 ? num(visible[0]?.price) : null
  const end = visible.length > 1 ? num(visible[visible.length - 1]?.price) : null
  const periodReturn = start !== null && end !== null && start !== 0 ? ((end - start) / start) * 100 : null

  return (
    <div className="flex min-h-[440px] flex-col">
      <div className="shrink-0 border-b border-[var(--app-border)] px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-semibold text-[var(--app-text)]">Market price</h2>
            <p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">{visible.length} stored price points</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-3">
            <span className={`text-xs font-semibold tabular-nums ${periodReturn === null ? "text-[var(--app-text-faint)]" : periodReturn >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
              {periodReturn === null ? "History unavailable" : `${fmtPct(periodReturn)} shown period`}
            </span>
            <div className="flex items-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-0.5">
              {PERIODS.map((item) => {
                const enabled = (seriesByPeriod.get(item.key)?.length ?? 0) >= 2
                return (
                  <button
                    key={item.key}
                    type="button"
                    disabled={!enabled}
                    onClick={() => setPeriod(item.key)}
                    className={`rounded-md px-2 py-1 text-[9px] font-semibold transition ${period === item.key ? "bg-[var(--app-surface)] text-[var(--app-accent)] shadow-sm" : enabled ? "text-[var(--app-text-muted)] hover:text-[var(--app-text)]" : "cursor-not-allowed text-[var(--app-text-faint)] opacity-35"}`}
                  >
                    {item.label}
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 p-4">
        {visible.length >= 2 ? <PriceChart data={visible} currency={currency} positive={periodReturn !== null ? periodReturn >= 0 : dailyPositive} locale={locale} /> : <div className="flex h-full min-h-[300px] items-center justify-center text-xs text-[var(--app-text-faint)]">Price history is not available for this period.</div>}
      </div>
    </div>
  )
}
