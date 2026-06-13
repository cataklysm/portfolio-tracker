"use client"
import { useState, useTransition } from "react"
import { addToWatchlistAction } from "@/app/watchlist/actions"
import { searchInstrumentsAction } from "@/app/positions/add/actions"
import { useTranslations } from "@/lib/i18n"
import type { InstrumentWithListings } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"

export function AddToWatchlist() {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<InstrumentWithListings[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const [isAdding, startAdd] = useTransition()

  function doSearch() {
    setError(null)
    startSearch(async () => {
      setResults(await searchInstrumentsAction(query))
      setSearched(true)
    })
  }

  function add(listingId: string) {
    startAdd(async () => {
      const err = await addToWatchlistAction(listingId, null)
      if (err) {
        setError(err)
        return
      }
      // Added — reset and close.
      setOpen(false)
      setQuery("")
      setResults([])
      setSearched(false)
    })
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="rounded-lg border border-sky-500/30 bg-sky-500/15 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/20"
      >
        {t("watchlist.addButton")}
      </button>
    )
  }

  return (
    <div className="w-full max-w-md rounded-xl border border-slate-700/50 bg-slate-900/70 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-medium text-slate-400">{t("watchlist.searchCatalog")}</span>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-300">
          {t("common.close")}
        </button>
      </div>

      {error && <p className="mb-2 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              doSearch()
            }
          }}
          placeholder={t("common.searchPlaceholder")}
          className={inputClass}
        />
        <button
          type="button"
          onClick={doSearch}
          disabled={isSearching}
          className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:border-slate-600 disabled:opacity-50"
        >
          {isSearching ? t("addPosition.searching") : t("common.search")}
        </button>
      </div>

      {searched && results.length === 0 && <p className="mt-2 text-xs text-slate-500">{t("common.noMatches")}</p>}

      <div className="mt-2 max-h-64 space-y-2 overflow-y-auto">
        {results.map((inst) => (
          <div key={inst.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
            <p className="mb-1 text-sm text-slate-200">
              {inst.name} <span className="text-slate-500">· {inst.asset_type}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {inst.listings.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={isAdding}
                  onClick={() => add(l.id)}
                  className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:border-sky-500/50 hover:text-sky-200 disabled:opacity-50"
                >
                  {l.symbol} · {l.exchange_mic ?? "?"} · {l.currency}
                </button>
              ))}
              {inst.listings.length === 0 && <span className="text-xs text-slate-600">{t("common.noListings")}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
