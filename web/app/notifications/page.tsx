import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { getTranslations } from "@/lib/i18n"
import type { NotificationInbox, PositionView } from "@/lib/types"
import { NotificationsList } from "@/components/NotificationsList"

export default async function NotificationsPage() {
  const t = getTranslations()
  const [resp, positionsResp, locale] = await Promise.all([
    apiFetch("/notifications?limit=50", { cache: "no-store" }),
    apiFetch("/positions", { cache: "no-store" }),
    getLocale(),
  ])
  const inbox: NotificationInbox = resp.ok
    ? ((await resp.json()) as NotificationInbox)
    : { unread_count: 0, notifications: [] }
  const positions = positionsResp.ok ? ((await positionsResp.json()) as PositionView[]) : []
  const positionByListing = Object.fromEntries(positions.map((position) => [position.listing_id, position.id]))

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--app-text)]">{t("notifications.title")}</h1>
          <p className="mt-1 text-xs text-[var(--app-text-faint)]">{t("notifications.subtitle")}</p>
        </div>
        <Link href="/notifications/settings" className="shrink-0 rounded-lg border border-[var(--app-border)] px-2.5 py-1 text-xs text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
          {t("notificationSettings.settingsLink")}
        </Link>
      </header>
      <NotificationsList items={inbox.notifications} unreadCount={inbox.unread_count} locale={locale} positionByListing={positionByListing} />
    </div>
  )
}
