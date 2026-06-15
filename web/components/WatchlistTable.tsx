"use client"
import { useTransition } from "react"
import { removeFromWatchlistAction } from "@/app/watchlist/actions"
import { useLocale } from "@/lib/locale-context"
import { useTranslations } from "@/lib/i18n"
import { fmtPrice, num } from "@/lib/format"
import type { WatchlistItemView } from "@/lib/types"

export function WatchlistTable({ items }: { items: WatchlistItemView[] }) {
  const t = useTranslations()
  return (
    <div className="app-panel overflow-x-auto rounded-xl">
      <div className="min-w-[700px]">
        <div className="grid grid-cols-[minmax(240px,1fr)_130px_100px_70px] items-center gap-4 border-b border-[var(--app-border)] px-4 py-2.5 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">
          <span>{t("watchlist.instrument")}</span>
          <span className="text-right">{t("watchlist.price")}</span>
          <span className="text-right">{t("watchlist.today")}</span>
          <span className="text-right">{t("watchlist.remove")}</span>
        </div>
        <ul>
          {items.map((item) => <Row key={item.id} item={item} />)}
        </ul>
      </div>
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
    <li className="grid grid-cols-[minmax(240px,1fr)_130px_100px_70px] items-center gap-4 border-b border-[var(--app-border)] px-4 py-3 transition last:border-0 hover:bg-[var(--app-surface-hover)]">
      <div className="flex min-w-0 items-center gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[10px] font-bold tracking-wider text-[var(--app-accent)]">{symbol.slice(0, 3)}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-[var(--app-text)]">{name}</p>
          <div className="flex items-center gap-2">
            <p className="text-xs text-[var(--app-text-faint)]">{symbol}</p>
            {isStale ? <span className="text-[10px] text-[var(--app-warning)]">{item.freshness_status}</span> : null}
            {item.note ? <p className="truncate text-xs text-[var(--app-text-faint)]">· {item.note}</p> : null}
          </div>
        </div>
      </div>
      <span className="text-right text-sm tabular-nums text-[var(--app-text)]">{price !== null ? fmtPrice(locale, price, currency, item.listing?.asset_type ?? "equity") : "—"}</span>
      <span className={`text-right text-sm font-medium tabular-nums ${daily === null ? "text-[var(--app-text-faint)]" : isUp ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{daily !== null ? `${isUp ? "+" : ""}${daily.toFixed(2)}%` : "—"}</span>
      <div className="text-right">
        <button onClick={() => startRemove(async () => void (await removeFromWatchlistAction(item.listing_id)))} disabled={isRemoving} title={t("watchlist.removeTitle")} className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-faint)] hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50">{isRemoving ? "..." : "×"}</button>
      </div>
    </li>
  )
}
