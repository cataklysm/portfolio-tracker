import Link from "next/link"
import { fmtCurrency, fmtPct, num } from "@/lib/format"
import { getTranslations } from "@/lib/i18n"
import type { PerformancePeriod, PerformanceReport } from "@/lib/types"

interface Props {
  report: PerformanceReport | null
  period: PerformancePeriod
  portfolioId?: string
  currency: string
  locale: string
}

const PERIODS: PerformancePeriod[] = ["1W", "1M", "YTD", "1Y", "ALL"]
const W = 760
const H = 200

export function PerformanceChart({ report, period, portfolioId, currency, locale }: Props) {
  const t = getTranslations()
  const points = report?.points ?? []

  const last = points[points.length - 1]
  const totalPnl = last ? (num(last.total_pnl) ?? 0) : 0
  const value = last ? (num(last.value) ?? 0) : 0
  const invested = last ? (num(last.invested_capital) ?? 0) : 0
  const returnPct = invested > 0 ? (totalPnl / invested) * 100 : null
  const up = totalPnl >= 0
  const color = up ? "var(--app-positive)" : "var(--app-negative)"
  const anyPartial = points.some((p) => !p.complete)

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 pt-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--app-text-faint)]">
            {t("dashboard.performance")}
          </p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums text-[var(--app-text)]">
            {fmtCurrency(locale, value, currency)}
          </p>
          <p className="text-xs tabular-nums" style={{ color }}>
            {up ? "+" : ""}
            {fmtCurrency(locale, totalPnl, currency)}
            {returnPct !== null && <span className="ml-1">({fmtPct(returnPct)})</span>}
          </p>
        </div>
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={periodHref(portfolioId, p)}
              className={`rounded-md border px-2 py-1 text-[10px] font-medium transition-all ${
                p === period
                  ? "border-[color-mix(in_srgb,var(--app-accent)_48%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                  : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      </div>

      {points.length < 2 ? (
        <p className="px-4 py-10 text-center text-xs text-[var(--app-text-muted)]">
          {t("dashboard.performanceEmpty")}
        </p>
      ) : (
        <Chart points={points} color={color} currency={currency} locale={locale} />
      )}

      {anyPartial && points.length >= 2 && (
        <p className="px-4 pb-3 text-[10px] text-[var(--app-text-faint)]">{t("dashboard.performancePartial")}</p>
      )}
    </section>
  )
}

function Chart({
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
  const t = getTranslations()
  const values = points.map((p) => num(p.value) ?? 0)
  const invested = points.map((p) => num(p.invested_capital) ?? 0)
  const all = [...values, ...invested]
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1

  const x = (i: number) => (i / (points.length - 1)) * W
  const y = (v: number) => H - ((v - min) / range) * (H - 16) - 8
  const line = (series: number[]) => series.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ")

  const valuePoints = line(values)
  const investedPoints = line(invested)
  const areaPath = `M ${valuePoints.split(" ")[0]} L ${valuePoints.split(" ").slice(1).join(" L ")} L ${W},${H} L 0,${H} Z`
  const gridYs = [0.25, 0.5, 0.75].map((f) => 8 + (H - 16) * f)

  return (
    <div className="mt-2">
      <div className="relative px-4">
        <span className="absolute right-5 top-0 text-[10px] tabular-nums text-[var(--app-text-faint)]">
          {fmtCurrency(locale, max, currency)}
        </span>
        <span className="absolute bottom-0 right-5 text-[10px] tabular-nums text-[var(--app-text-faint)]">
          {fmtCurrency(locale, min, currency)}
        </span>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="h-48 w-full">
          <defs>
            <linearGradient id="perf-chart-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.22" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {gridYs.map((gy) => (
            <line key={gy} x1="0" y1={gy} x2={W} y2={gy} stroke="var(--app-border)" strokeWidth="1" strokeDasharray="4 6" />
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
        </svg>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-4 pb-3 text-[10px] text-[var(--app-text-faint)]">
        <span>{fmtDate(locale, points[0]!.date)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} /> {t("dashboard.currentValue")}
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dashed border-[var(--app-text-faint)]" />{" "}
            {t("dashboard.investedCapital")}
          </span>
        </span>
        <span>{fmtDate(locale, points[points.length - 1]!.date)}</span>
      </div>
    </div>
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
