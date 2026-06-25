import Link from "next/link"
import { NotificationSettings, type InstrumentOption } from "@/components/NotificationSettings"
import { apiFetch } from "@/lib/api"
import { getTranslations } from "@/lib/i18n"
import type { AlertRule, PositionView } from "@/lib/types"

export default async function NotificationSettingsPage() {
  const t = getTranslations()
  const [rulesResp, posResp] = await Promise.all([
    apiFetch("/notifications/rules", { cache: "no-store" }),
    apiFetch("/positions", { cache: "no-store" }),
  ])
  const rules: AlertRule[] = rulesResp.ok ? ((await rulesResp.json()) as AlertRule[]) : []
  const positions: PositionView[] = posResp.ok ? ((await posResp.json()) as PositionView[]) : []

  const instMap = new Map<string, InstrumentOption>()
  for (const position of positions) {
    if (position.state === "open" && position.listing && !instMap.has(position.listing.instrument_id)) {
      instMap.set(position.listing.instrument_id, {
        instrument_id: position.listing.instrument_id,
        listing_id: position.listing_id,
        name: position.listing.name,
        symbol: position.listing.symbol,
        currency: position.listing.currency,
      })
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/notifications" className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
        Back to {t("notificationSettings.back")}
      </Link>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--app-text)]">{t("notificationSettings.title")}</h1>
      <NotificationSettings rules={rules} instruments={[...instMap.values()]} />
    </div>
  )
}
