import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { getTranslations } from "@/lib/i18n"
import type { AlertRule, PositionView } from "@/lib/types"
import { NotificationSettings, type InstrumentOption } from "@/components/NotificationSettings"

export default async function NotificationSettingsPage() {
  const t = getTranslations()
  const [rulesResp, posResp] = await Promise.all([
    apiFetch("/notifications/rules", { cache: "no-store" }),
    apiFetch("/positions", { cache: "no-store" }),
  ])
  const rules: AlertRule[] = rulesResp.ok ? ((await rulesResp.json()) as AlertRule[]) : []
  const positions: PositionView[] = posResp.ok ? ((await posResp.json()) as PositionView[]) : []

  const instMap = new Map<string, InstrumentOption>()
  for (const p of positions) {
    if (p.state === "open" && p.listing && !instMap.has(p.listing.instrument_id)) {
      instMap.set(p.listing.instrument_id, {
        instrument_id: p.listing.instrument_id,
        listing_id: p.listing_id,
        name: p.listing.name,
        symbol: p.listing.symbol,
        currency: p.listing.currency,
      })
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <Link href="/notifications" className="mb-4 inline-flex items-center gap-1.5 text-sm text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
        ← {t("notificationSettings.back")}
      </Link>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-[var(--app-text)]">{t("notificationSettings.title")}</h1>
      <NotificationSettings rules={rules} instruments={[...instMap.values()]} />
    </div>
  )
}
