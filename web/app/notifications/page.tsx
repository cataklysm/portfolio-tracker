import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import type { AlertRule, NotificationInbox, PositionView } from "@/lib/types"
import { NotificationsWorkspace } from "@/features/notifications/components/NotificationsWorkspace"

export default async function NotificationsPage() {
  const [resp, positionsResp, rulesResp, locale] = await Promise.all([
    apiFetch("/notifications?limit=100", { cache: "no-store" }),
    apiFetch("/positions", { cache: "no-store" }),
    apiFetch("/notifications/rules", { cache: "no-store" }),
    getLocale(),
  ])
  const inbox: NotificationInbox = resp.ok
    ? ((await resp.json()) as NotificationInbox)
    : { unread_count: 0, notifications: [] }
  const positions = positionsResp.ok ? ((await positionsResp.json()) as PositionView[]) : []
  const rules = rulesResp.ok ? ((await rulesResp.json()) as AlertRule[]) : []

  return <NotificationsWorkspace inbox={inbox} locale={locale} positions={positions} rules={rules} />
}
