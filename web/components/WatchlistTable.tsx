"use client"
import { useTransition } from "react"
import { removeFromWatchlistAction } from "@/app/watchlist/actions"
import { useLocale } from "@/lib/locale-context"
import { useTranslations } from "@/lib/i18n"
import { fmtCurrency, num } from "@/lib/format"
import type { WatchlistItemView } from "@/lib/types"

export function WatchlistTable({ items }: { items: WatchlistItemView[] }) {
  const t = useTranslations()
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/40 to-[#080d17]/70">
      <div className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-slate-700/40 px-5 py-2.5 text-[11px] font-semibold uppercase tracking-widest text-slate-500">
        <span>{t("watchlist.instrument")}</span>
        <span className="text-right">{t("watchlist.price")}</span>
        <span className="text-right">{t("watchlist.today")}</span>
        <span className="text-right">{t("watchlist.remove")}</span>
      </div>
      <ul>
        {items.map((item) => (
          <Row key={item.id} item={item} />
        ))}
      </ul>
    </div>
  )
}

function Row({ item }: { item: WatchlistItemView }) {
  const locale = useLocale()
  const t = useTranslations()
  const [isRemoving, startRemove] = useTransition()

  const symbol = item.listing?.symbol ?? "—"
  const name = item.listing?.name ?? item.listing_id.slice(0, 8)
  const currency = item.listing?.currency ?? "EUR"
  const price = num(item.current_price)
  const daily = num(item.daily_change_pct)
  const isUp = daily !== null && daily >= 0
  const isStale = item.freshness_status === "stale" || item.freshness_status === "unavailable"

  return (
    <li className="grid grid-cols-[1fr_auto_auto_auto] items-center gap-4 border-b border-slate-800/60 px-5 py-3 last:border-0 hover:bg-slate-800/20">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/50 bg-slate-800/80 text-[10px] font-bold tracking-wider text-slate-300">
          {symbol.slice(0, 3)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{name}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-slate-500">{symbol}</p>
            {isStale && <span className="text-[10px] text-amber-400/80">{item.freshness_status}</span>}
            {item.note && <p className="truncate text-xs text-slate-600">· {item.note}</p>}
          </div>
        </div>
      </div>

      <span className="text-right text-sm tabular-nums text-white">
        {price !== null ? fmtCurrency(locale, price, currency) : "—"}
      </span>

      <span className={`text-right text-sm font-medium tabular-nums ${daily === null ? "text-slate-600" : isUp ? "text-emerald-400" : "text-rose-400"}`}>
        {daily !== null ? `${isUp ? "▲" : "▼"} ${Math.abs(daily).toFixed(2)}%` : "—"}
      </span>

      <div className="text-right">
        <button
          onClick={() => startRemove(async () => void (await removeFromWatchlistAction(item.listing_id)))}
          disabled={isRemoving}
          title={t("watchlist.removeTitle")}
          className="rounded-md border border-slate-700/60 px-2 py-1 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          {isRemoving ? "…" : "✕"}
        </button>
      </div>
    </li>
  )
}
