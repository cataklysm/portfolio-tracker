"use client"
import { useActionState, useState, useTransition } from "react"
import { createPositionAction, searchInstrumentsAction } from "@/app/positions/add/actions"
import { useTranslations } from "@/lib/i18n"
import type { ExchangeView, InstrumentWithListings, Portfolio } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
const labelClass = "mb-1 block text-xs text-slate-500"

interface SelectedListing {
  listingId: string
  label: string
  currency: string
}

export function AddPositionForm({ portfolios, exchanges }: { portfolios: Portfolio[]; exchanges: ExchangeView[] }) {
  const t = useTranslations()
  const [error, formAction, isPending] = useActionState(createPositionAction, null)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<InstrumentWithListings[]>([])
  const [searched, setSearched] = useState(false)
  const [selected, setSelected] = useState<SelectedListing | null>(null)
  const [manual, setManual] = useState(false)
  const [isSearching, startSearch] = useTransition()
  const today = new Date().toISOString().slice(0, 10)

  function doSearch() {
    startSearch(async () => {
      setResults(await searchInstrumentsAction(query))
      setSearched(true)
    })
  }

  return (
    <form action={formAction} className="space-y-5">
      {error && <p className="rounded-xl border border-rose-500/20 bg-rose-950/40 px-3 py-2.5 text-sm text-rose-400">{error}</p>}

      <div>
        <label htmlFor="portfolio_id" className={labelClass}>{t("addPosition.portfolio")}</label>
        <select id="portfolio_id" name="portfolio_id" required className={inputClass} defaultValue={portfolios[0]?.id}>
          {portfolios.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      {/* Instrument selection */}
      {!manual && (
        <div>
          <label className={labelClass}>{t("addPosition.instrument")}</label>
          {selected ? (
            <div className="flex items-center justify-between rounded-lg border border-sky-500/40 bg-sky-500/10 px-3 py-2 text-sm">
              <span className="text-sky-100">{selected.label}</span>
              <button type="button" onClick={() => setSelected(null)} className="text-sky-400 hover:text-white">{t("addPosition.change")}</button>
            </div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); doSearch() } }}
                  placeholder={t("common.searchPlaceholder")}
                  className={inputClass}
                />
                <button type="button" onClick={doSearch} disabled={isSearching} className="shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-300 hover:border-slate-600 disabled:opacity-50">
                  {isSearching ? t("addPosition.searching") : t("common.search")}
                </button>
              </div>
              {searched && results.length === 0 && (
                <p className="mt-2 text-xs text-slate-500">{t("common.noMatches")}</p>
              )}
              <div className="mt-2 max-h-56 space-y-2 overflow-y-auto">
                {results.map((inst) => (
                  <div key={inst.id} className="rounded-lg border border-slate-800 bg-slate-900/60 p-2">
                    <p className="mb-1 text-sm text-slate-200">{inst.name} <span className="text-slate-500">· {inst.asset_type}</span></p>
                    <div className="flex flex-wrap gap-1.5">
                      {inst.listings.map((l) => (
                        <button
                          key={l.id}
                          type="button"
                          onClick={() => setSelected({ listingId: l.id, label: `${l.symbol} · ${l.exchange_mic ?? "?"} · ${l.currency}`, currency: l.currency })}
                          className="rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-slate-300 hover:border-sky-500/50 hover:text-sky-200"
                        >
                          {l.symbol} · {l.exchange_mic ?? "?"} · {l.currency}
                        </button>
                      ))}
                      {inst.listings.length === 0 && <span className="text-xs text-slate-600">{t("common.noListings")}</span>}
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setManual(true)} className="mt-2 text-xs text-slate-500 hover:text-sky-300">
                {t("addPosition.cantFind")}
              </button>
            </>
          )}
          {selected && <input type="hidden" name="listing_id" value={selected.listingId} />}
          {selected && <input type="hidden" name="currency" value={selected.currency} />}
        </div>
      )}

      {manual && (
        <div className="space-y-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-slate-400">{t("addPosition.newInstrument")}</span>
            <button type="button" onClick={() => setManual(false)} className="text-xs text-slate-500 hover:text-sky-300">{t("addPosition.backToSearch")}</button>
          </div>
          <div>
            <label htmlFor="name" className={labelClass}>{t("addPosition.name")}</label>
            <input id="name" name="name" placeholder={t("addPosition.namePlaceholder")} className={inputClass} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="asset_type" className={labelClass}>{t("addPosition.type")}</label>
              <select id="asset_type" name="asset_type" className={inputClass}>
                <option value="equity">{t("addPosition.equity")}</option>
                <option value="crypto">{t("addPosition.crypto")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="symbol" className={labelClass}>{t("addPosition.symbol")}</label>
              <input id="symbol" name="symbol" placeholder={t("addPosition.symbolPlaceholder")} className={inputClass} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="exchange_mic" className={labelClass}>{t("addPosition.exchange")}</label>
              <select id="exchange_mic" name="exchange_mic" className={inputClass}>
                {exchanges.map((e) => (
                  <option key={e.id} value={e.mic}>{e.mic} — {e.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="currency-manual" className={labelClass}>{t("addPosition.currency")}</label>
              <input id="currency-manual" name="currency" placeholder={t("addPosition.currencyPlaceholder")} maxLength={3} className={`${inputClass} uppercase`} />
            </div>
          </div>
        </div>
      )}

      {/* First buy transaction */}
      <div className="space-y-3 border-t border-slate-800 pt-4">
        <p className="text-xs font-medium text-slate-400">{t("addPosition.firstBuy")}</p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="quantity" className={labelClass}>{t("addPosition.quantity")}</label>
            <input id="quantity" name="quantity" type="number" step="any" min="0" required placeholder={t("addPosition.quantityPlaceholder")} className={inputClass} />
          </div>
          <div>
            <label htmlFor="price" className={labelClass}>{t("addPosition.price")}</label>
            <input id="price" name="price" type="number" step="any" min="0" required placeholder={t("addPosition.pricePlaceholder")} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="fee" className={labelClass}>{t("addPosition.brokerFee")}</label>
            <input id="fee" name="fee" type="number" step="any" min="0" defaultValue="0" className={inputClass} />
          </div>
          <div>
            <label htmlFor="effective_at" className={labelClass}>{t("addPosition.tradeDate")}</label>
            <input id="effective_at" name="effective_at" type="date" required defaultValue={today} className={inputClass} />
          </div>
        </div>
      </div>

      <button
        type="submit"
        disabled={isPending || (!selected && !manual)}
        className="w-full rounded-xl border border-sky-500/30 bg-sky-500/15 py-2.5 text-sm font-semibold text-sky-200 transition-all hover:border-sky-400/50 hover:bg-sky-500/20 disabled:opacity-40"
      >
        {isPending ? t("addPosition.creating") : t("addPosition.submit")}
      </button>
    </form>
  )
}
