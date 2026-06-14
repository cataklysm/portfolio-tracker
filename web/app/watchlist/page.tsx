import { apiFetch } from "@/lib/api"
import type { WatchlistItemView } from "@/lib/types"
import { WatchlistTable } from "@/components/WatchlistTable"
import { AddToWatchlist } from "@/components/AddToWatchlist"
import { getTranslations } from "@/lib/i18n"

export default async function WatchlistPage() {
  const t = getTranslations()
  const resp = await apiFetch("/watchlist", { cache: "no-store" })
  const items = resp.ok ? ((await resp.json()) as WatchlistItemView[]) : []

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-5 lg:px-6">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">{t("watchlist.title")}</h1>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">{t("watchlist.subtitle")}</p>
        </div>
        <AddToWatchlist />
      </header>

      {items.length === 0 ? (
        <div className="app-panel flex flex-col items-center justify-center rounded-xl py-24 text-center">
          <p className="mb-2 text-lg font-medium text-[var(--app-text)]">{t("watchlist.emptyTitle")}</p>
          <p className="text-sm text-[var(--app-text-muted)]">{t("watchlist.emptySubtitle")}</p>
        </div>
      ) : (
        <WatchlistTable items={items} />
      )}
    </div>
  )
}
