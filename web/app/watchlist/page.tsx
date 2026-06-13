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
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t("watchlist.title")}</h1>
          <p className="mt-0.5 text-sm text-slate-500">{t("watchlist.subtitle")}</p>
        </div>
        <AddToWatchlist />
      </header>

      {items.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-slate-800 py-24 text-center">
          <p className="mb-2 text-lg font-medium text-slate-300">{t("watchlist.emptyTitle")}</p>
          <p className="text-sm text-slate-500">{t("watchlist.emptySubtitle")}</p>
        </div>
      ) : (
        <WatchlistTable items={items} />
      )}
    </div>
  )
}
