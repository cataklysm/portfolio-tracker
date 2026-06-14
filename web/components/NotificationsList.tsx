"use client"
import Link from "next/link"
import { useTransition } from "react"
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import type { NotificationItem } from "@/lib/types"

const TYPE_LABEL: Record<NotificationItem["type"], MessageKey> = {
  daily_move: "notifications.typeDailyMove",
  earnings_upcoming: "notifications.typeEarnings",
  target_zone: "notifications.typeTargetZone",
  price_threshold: "notifications.typePriceThreshold",
  cost_basis_move: "notifications.typeCostBasis",
}

const SEVERITY_DOT: Record<NotificationItem["severity"], string> = {
  info: "bg-[var(--app-accent)]",
  warning: "bg-[var(--app-warning)]",
  critical: "bg-[var(--app-negative)]",
}

interface Props {
  items: NotificationItem[]
  unreadCount: number
  locale: string
  positionByListing: Record<string, string>
}

export function NotificationsList({ items, unreadCount, locale, positionByListing }: Props) {
  const t = useTranslations()
  const [pending, start] = useTransition()

  if (items.length === 0) {
    return (
      <div className="app-panel rounded-xl p-8 text-center text-sm text-[var(--app-text-faint)]">
        {t("notifications.empty")}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-[var(--app-text-muted)]">
          {unreadCount > 0 ? t("notifications.unread", { count: String(unreadCount) }) : t("notifications.allRead")}
        </span>
        {unreadCount > 0 && (
          <button
            onClick={() => start(async () => void (await markAllNotificationsReadAction()))}
            disabled={pending}
            className="rounded-lg border border-[var(--app-border)] px-2.5 py-1 text-xs text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
          >
            {t("notifications.markAllRead")}
          </button>
        )}
      </div>

      <ul className="space-y-2">
        {items.map((n) => (
          <Row key={n.id} n={n} locale={locale} positionId={n.listing_id ? positionByListing[n.listing_id] : undefined} />
        ))}
      </ul>
    </div>
  )
}

function Row({ n, locale, positionId }: { n: NotificationItem; locale: string; positionId?: string }) {
  const t = useTranslations()
  const [pending, start] = useTransition()
  const unread = n.read_at === null
  const when = new Date(n.created_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })

  return (
    <li className={`app-panel flex items-start gap-3 rounded-xl p-3.5 ${unread ? "" : "opacity-60"}`}>
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${unread ? SEVERITY_DOT[n.severity] : "bg-[var(--app-border)]"}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="rounded border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-[var(--app-text-muted)]">
            {t(TYPE_LABEL[n.type])}
          </span>
          <span className="text-[10px] text-[var(--app-text-faint)]">{when}</span>
        </div>
        <p className="mt-1 text-sm font-medium text-[var(--app-text)]">{n.title}</p>
        {n.body && <p className="mt-0.5 text-xs text-[var(--app-text-muted)]">{n.body}</p>}
        {positionId ? <Link href={`/positions/${positionId}`} className="mt-2 inline-flex text-[10px] font-semibold text-[var(--app-accent)] hover:underline">Open asset</Link> : null}
      </div>
      {unread && (
        <button
          onClick={() => start(async () => void (await markNotificationReadAction(n.id)))}
          disabled={pending}
          title={t("notifications.markRead")}
          className="shrink-0 rounded-md border border-[var(--app-border)] px-2 py-1 text-[10px] text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
        >
          {pending ? "…" : "✓"}
        </button>
      )}
    </li>
  )
}
