"use client"

import { useState } from "react"
import { loadActivityAction } from "@/app/activity/feed-actions"
import { fmtCurrency, num } from "@/lib/format"
import type { ActivityItem, ActivityPage } from "@/lib/types"

interface Props {
  initial: ActivityPage
  type?: string
  portfolioId?: string
  portfolioNames: Map<string, string>
  positionNames: Map<string, string>
  locale: string
}

const KIND_STYLE: Record<string, { label: string; className: string }> = {
  trade: { label: "Trade", className: "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" },
  cash_flow: { label: "Cash", className: "bg-[color-mix(in_srgb,var(--app-positive)_18%,transparent)] text-[var(--app-positive)]" },
  tax_event: { label: "Tax", className: "bg-[color-mix(in_srgb,var(--app-warning)_18%,transparent)] text-[var(--app-warning)]" },
}

export function ActivityFeed({ initial, type, portfolioId, portfolioNames, positionNames, locale }: Props) {
  const [items, setItems] = useState<ActivityItem[]>(initial.items)
  const [cursor, setCursor] = useState<string | null>(initial.next_cursor)
  const [loading, setLoading] = useState(false)

  async function loadMore() {
    if (!cursor || loading) return
    setLoading(true)
    const page = await loadActivityAction({ cursor, type, portfolioId })
    setItems((prev) => [...prev, ...page.items])
    setCursor(page.next_cursor)
    setLoading(false)
  }

  if (items.length === 0) {
    return (
      <section className="app-panel rounded-xl px-5 py-16 text-center text-sm text-[var(--app-text-muted)]">
        No activity matches the selected filters.
      </section>
    )
  }

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <ul className="divide-y divide-[var(--app-border)]">
        {items.map((item) => (
          <Row key={`${item.kind}:${item.id}`} item={item} portfolioNames={portfolioNames} positionNames={positionNames} locale={locale} />
        ))}
      </ul>
      {cursor && (
        <div className="border-t border-[var(--app-border)] p-3 text-center">
          <button
            type="button"
            onClick={loadMore}
            disabled={loading}
            className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-1.5 text-xs font-medium text-[var(--app-text-muted)] transition hover:text-[var(--app-text)] disabled:opacity-50"
          >
            {loading ? "Loading…" : "Load more"}
          </button>
        </div>
      )}
    </section>
  )
}

function Row({
  item,
  portfolioNames,
  positionNames,
  locale,
}: {
  item: ActivityItem
  portfolioNames: Map<string, string>
  positionNames: Map<string, string>
  locale: string
}) {
  const kind = KIND_STYLE[item.kind] ?? { label: item.kind, className: "text-[var(--app-text-muted)]" }
  const scope = item.position_id
    ? positionNames.get(item.position_id)
    : item.portfolio_id
      ? portfolioNames.get(item.portfolio_id)
      : "Unscoped"
  const amount = num(item.amount) ?? 0

  return (
    <li className="grid grid-cols-[88px_60px_1fr_auto] items-center gap-3 px-4 py-3 text-[11px] hover:bg-[var(--app-surface-hover)]">
      <span className="tabular-nums text-[var(--app-text-faint)]">
        {new Date(item.occurred_at).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "2-digit" })}
      </span>
      <span className={`inline-flex justify-center rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${kind.className}`}>
        {kind.label}
      </span>
      <span className="min-w-0 truncate text-[var(--app-text)]">
        {describe(item)}
        <span className="ml-2 text-[var(--app-text-faint)]">· {scope}</span>
        {item.note ? <span className="ml-2 text-[var(--app-text-faint)]">· {item.note}</span> : null}
      </span>
      <span className="tabular-nums text-[var(--app-text-muted)]">{fmtCurrency(locale, amount, item.currency)}</span>
    </li>
  )
}

function describe(item: ActivityItem): string {
  if (item.kind === "trade") {
    const side = item.subtype === "sell" ? "Sell" : "Buy"
    return `${side} ${item.quantity ?? ""} @ ${item.price ?? ""}`.trim()
  }
  if (item.kind === "tax_event") {
    return `${item.subtype.replaceAll("_", " ")} ${item.direction ?? ""}`.trim()
  }
  return item.subtype.replaceAll("_", " ")
}
