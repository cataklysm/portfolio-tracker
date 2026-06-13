import type { PositionView } from "@/lib/types"
import { fmtCurrency, num } from "@/lib/format"
import { getTranslations } from "@/lib/i18n"

const SEGMENT_COLORS = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f87171", "#22d3ee", "#e879f9", "#fb923c"]

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-700/35 bg-gradient-to-b from-slate-800/50 to-slate-900/80 px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <p className="mb-0.5 text-xs text-slate-500">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? "text-white"}`}>{value}</p>
      {sub && <p className={`text-xs tabular-nums ${color ?? "text-slate-500"} opacity-60`}>{sub}</p>}
    </div>
  )
}

interface Props {
  positions: PositionView[]
  reportingCurrency: string
  locale: string
}

/**
 * Reporting-currency totals across the shown positions. Values arrive already
 * converted by the portfolio service, so no FX conversion happens here.
 */
export function PortfolioSummary({ positions, reportingCurrency, locale }: Props) {
  const t = getTranslations()
  // Open holdings with a current value drive value/allocation/unrealized/daily.
  // Closed positions hold nothing (value 0), so they'd only add empty 0% slices.
  // Sorted by value (largest first) so the allocation bar/legend reads top-down.
  const valued = positions
    .filter((p) => p.state !== "closed" && num(p.performance.current_value_reporting) !== null)
    .sort(
      (a, b) =>
        (num(b.performance.current_value_reporting) ?? 0) - (num(a.performance.current_value_reporting) ?? 0),
    )

  const totalValue = valued.reduce((s, p) => s + (num(p.performance.current_value_reporting) ?? 0), 0)
  const totalCost = valued.reduce((s, p) => s + (num(p.performance.open_cost_basis_reporting) ?? 0), 0)
  const unrealized = valued.reduce((s, p) => s + (num(p.performance.unrealized_pnl_reporting) ?? 0), 0)
  const realized = positions.reduce((s, p) => s + (num(p.performance.realized_pnl_reporting) ?? 0), 0)
  const totalPnl = unrealized + realized
  const totalPnlPct = totalCost > 0 ? (unrealized / totalCost) * 100 : 0

  let dailyChange: number | null = null
  for (const p of valued) {
    const daily = num(p.performance.daily_change_pct)
    const value = num(p.performance.current_value_reporting)
    if (daily !== null && value !== null) dailyChange = (dailyChange ?? 0) + value * (daily / 100)
  }

  const isUp = totalPnl >= 0
  const isDailyUp = dailyChange !== null ? dailyChange >= 0 : true
  if (positions.length === 0) return null

  return (
    <div className="relative mb-8 overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />

      <div className="relative grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label={t("summary.totalValue", { currency: reportingCurrency })} value={fmtCurrency(locale, totalValue, reportingCurrency)} />
        <StatTile
          label={t("summary.totalPnl", { currency: reportingCurrency })}
          value={`${totalPnl >= 0 ? "+" : ""}${fmtCurrency(locale, totalPnl, reportingCurrency)}`}
          sub={t("summary.unrealizedSuffix", { value: `${totalPnlPct >= 0 ? "+" : ""}${totalPnlPct.toFixed(2)}%` })}
          color={isUp ? "text-emerald-400" : "text-rose-400"}
        />
        <StatTile
          label={t("summary.realizedPnl")}
          value={`${realized >= 0 ? "+" : ""}${fmtCurrency(locale, realized, reportingCurrency)}`}
          color={realized >= 0 ? "text-emerald-400" : "text-rose-400"}
        />
        {dailyChange !== null && (
          <StatTile
            label={t("summary.today", { currency: reportingCurrency })}
            value={`${dailyChange >= 0 ? "+" : ""}${fmtCurrency(locale, dailyChange, reportingCurrency)}`}
            color={isDailyUp ? "text-emerald-400" : "text-rose-400"}
          />
        )}
      </div>

      {totalValue > 0 && (
        <div className="relative mt-5">
          <p className="mb-2 text-xs text-slate-500">{t("summary.allocation")}</p>
          <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-slate-800/80">
            {valued.map((p, i) => {
              const pct = ((num(p.performance.current_value_reporting) ?? 0) / totalValue) * 100
              return (
                <div
                  key={p.id}
                  style={{ width: `${pct.toFixed(2)}%`, backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }}
                  title={`${p.listing?.symbol ?? ""} ${pct.toFixed(1)}%`}
                />
              )
            })}
          </div>
          <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1">
            {valued.map((p, i) => {
              const pct = ((num(p.performance.current_value_reporting) ?? 0) / totalValue) * 100
              return (
                <div key={p.id} className="flex items-center gap-1.5 text-xs">
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: SEGMENT_COLORS[i % SEGMENT_COLORS.length] }} />
                  <span className="text-slate-400">{p.listing?.symbol ?? "?"}</span>
                  <span className="text-slate-600">{pct.toFixed(1)}%</span>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
