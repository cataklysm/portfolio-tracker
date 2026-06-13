"use client"
import Link from "next/link"
import type { PositionView } from "@/lib/types"
import { useLocale } from "@/lib/locale-context"
import { useTranslations } from "@/lib/i18n"
import { fmtCurrency, fmtQty, num } from "@/lib/format"

interface TypeTheme {
  pill: string
  pillActive: string
  avatarText: string
}

const TYPE_THEME: Record<string, TypeTheme> = {
  equity: {
    pill: "border-sky-400/55 bg-sky-500/10 text-sky-200 shadow-[0_0_14px_rgba(56,189,248,0.28)]",
    pillActive: "border-sky-300/80 shadow-[0_0_22px_rgba(56,189,248,0.55)]",
    avatarText: "text-sky-300",
  },
  crypto: {
    pill: "border-violet-400/55 bg-violet-500/10 text-violet-200 shadow-[0_0_14px_rgba(167,139,250,0.28)]",
    pillActive: "border-violet-300/80 shadow-[0_0_22px_rgba(167,139,250,0.55)]",
    avatarText: "text-violet-300",
  },
}
const FALLBACK_THEME: TypeTheme = {
  pill: "border-slate-500/50 bg-slate-500/10 text-slate-200",
  pillActive: "border-slate-300/70",
  avatarText: "text-slate-300",
}

const IconUp = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 12V4M4 8l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)
const IconDown = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M8 4v8M4 8l4 4 4-4" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
)

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center gap-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="flex-1 border-b border-dashed border-slate-700/60" />
      <span className="text-sm tabular-nums text-slate-300">{value}</span>
    </div>
  )
}

const STATE_BADGE: Record<string, string> = {
  closed: "border-slate-500/40 bg-slate-700/40 text-slate-300",
  invalid: "border-rose-500/40 bg-rose-950/50 text-rose-300",
}

interface Props {
  position: PositionView
  activeFilter: string | null
  onTypeClick: (type: string) => void
  showPortfolioBadge?: boolean
}

export function PositionCard({ position, activeFilter, onTypeClick }: Props) {
  const locale = useLocale()
  const t = useTranslations()
  const { listing, performance: p, state } = position
  const assetType = listing?.asset_type ?? "equity"
  const symbol = listing?.symbol ?? "—"
  const name = listing?.name ?? position.listing_id.slice(0, 8)
  const reporting = p.reporting_currency

  const price = num(p.current_price)
  const daily = num(p.daily_change_pct)
  const qty = num(p.open_quantity) ?? 0
  const value = num(p.current_value_reporting)
  const cost = num(p.open_cost_basis_reporting)
  const unrealized = num(p.unrealized_pnl_reporting)
  const realized = num(p.realized_pnl_reporting)
  const unrealizedReturn = num(p.simple_return_pct)
  const realizedReturn = num(p.realized_return_pct)

  // A closed position holds nothing, so its meaningful result is realized P&L,
  // not unrealized. Open (and invalid) positions show unrealized.
  const isClosed = state === "closed"
  const pnlLabel = isClosed ? t("position.realizedPnl") : t("position.unrealizedPnl")
  const pnl = isClosed ? realized : unrealized
  // Closed → return on the cost of sold shares; open → unrealized return.
  // Both share the sign of the P&L amount shown beside them.
  const pnlPct = isClosed ? realizedReturn : unrealizedReturn

  const isUp = pnl !== null && pnl >= 0
  const isDailyUp = daily !== null && daily >= 0
  const isActive = activeFilter === assetType
  const theme = TYPE_THEME[assetType] ?? FALLBACK_THEME
  const isStale = position.freshness_status === "stale" || position.freshness_status === "unavailable"

  return (
    <Link href={`/positions/${position.id}`} className="block">
      <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-5 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)] transition-all duration-200 hover:-translate-y-px hover:border-slate-600/50">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />

        <div className="relative mb-5 flex items-start gap-3">
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-2xl border border-slate-700/50 bg-gradient-to-br from-slate-800 to-slate-900/90 text-[11px] font-bold tracking-widest">
            <span className={theme.avatarText}>{symbol.slice(0, 3)}</span>
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-bold leading-tight text-white">{name}</p>
            <p className="mt-0.5 text-xs font-medium tracking-wide text-slate-500">{symbol}</p>
            <div className="mt-1.5 flex min-h-[18px] flex-wrap items-center gap-1.5">
              {state !== "open" && (
                <span className={`rounded-md border px-1.5 py-px text-[11px] font-medium ${STATE_BADGE[state]}`}>
                  {state}
                </span>
              )}
              {isStale && (
                <span className="rounded-md bg-amber-950/60 px-1.5 py-px text-[11px] text-amber-400" title={t("position.quoteOutOfDate")}>
                  {position.freshness_status}
                </span>
              )}
            </div>
          </div>

          <button
            onClick={(e) => {
              e.preventDefault()
              e.stopPropagation()
              onTypeClick(assetType)
            }}
            className={`shrink-0 rounded-full border px-3.5 py-1 text-[11px] font-semibold tracking-wide transition-all duration-150 ${theme.pill} ${isActive ? theme.pillActive : ""}`}
          >
            {assetType}
          </button>
        </div>

        <div className="relative mb-4 flex items-end justify-between gap-4">
          <div>
            <span className="text-[26px] font-bold leading-none tabular-nums text-white">
              {price !== null ? fmtCurrency(locale, price, listing?.currency ?? reporting) : "—"}
            </span>
            {daily !== null && (
              <span className={`ml-3 text-sm font-semibold ${isDailyUp ? "text-emerald-400" : "text-rose-400"}`}>
                {isDailyUp ? "▲" : "▼"} {Math.abs(daily).toFixed(2)}%
              </span>
            )}
          </div>
        </div>

        <div className="mb-4 h-px bg-gradient-to-r from-transparent via-slate-700/70 to-transparent" />

        <div className="space-y-2.5">
          <StatRow label={t("position.quantity")} value={fmtQty(locale, qty, assetType)} />
          <StatRow label={t("position.costBasis")} value={cost !== null ? fmtCurrency(locale, cost, reporting) : "—"} />
          <StatRow label={t("position.currentValue")} value={value !== null ? fmtCurrency(locale, value, reporting) : "—"} />
        </div>

        <div
          className={`relative mt-4 flex items-center gap-3 rounded-xl border px-3.5 py-3 ${
            pnl === null
              ? "border-slate-600/12 bg-[rgba(15,18,23,0.70)]"
              : isUp
                ? "border-emerald-500/12 bg-[rgba(15,23,20,0.70)]"
                : "border-rose-500/12 bg-[rgba(23,15,18,0.70)]"
          }`}
        >
          <div
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
              pnl === null ? "bg-slate-700/70 text-slate-400" : isUp ? "bg-emerald-500/12 text-emerald-400" : "bg-rose-500/12 text-rose-400"
            }`}
          >
            {isUp ? <IconUp /> : <IconDown />}
          </div>
          <span className="flex-1 text-xs font-medium text-slate-400">{pnlLabel}</span>
          {pnl !== null ? (
            <div className={`flex items-baseline gap-1.5 font-bold ${isUp ? "text-emerald-300" : "text-rose-300"}`}>
              <span className="tabular-nums text-[15px]">
                {pnl >= 0 ? "+" : ""}
                {fmtCurrency(locale, pnl, reporting)}
              </span>
              {pnlPct !== null && (
                <span className="text-xs font-semibold opacity-70">
                  ({pnlPct >= 0 ? "+" : ""}
                  {pnlPct.toFixed(2)}%)
                </span>
              )}
            </div>
          ) : (
            <span className="text-sm text-slate-600">—</span>
          )}
        </div>
      </div>
    </Link>
  )
}
