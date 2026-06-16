"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { searchInstrumentsAction } from "@/app/positions/add/actions"
import { setPreferredBenchmarkAction } from "@/app/portfolios/[id]/settings/actions"
import type { InstrumentWithListings } from "@/lib/types"

export function PortfolioBenchmarkSettings({
  portfolioId,
  current,
}: {
  portfolioId: string
  current: { listingId: string; label: string } | null
}) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<InstrumentWithListings[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [searching, startSearch] = useTransition()
  const [saving, startSave] = useTransition()

  function search() {
    startSearch(async () => {
      setResults(await searchInstrumentsAction(query))
      setSearched(true)
    })
  }

  function save(listingId: string | null) {
    setError(null)
    startSave(async () => {
      const result = await setPreferredBenchmarkAction(portfolioId, listingId)
      if (result) setError(result)
      else router.refresh()
    })
  }

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="border-b border-[var(--app-border)] px-5 py-4">
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Benchmark asset</h2>
        <p className="mt-1 text-[10px] leading-4 text-[var(--app-text-faint)]">
          The selected benchmark is compared with this portfolio in the dashboard performance chart. One benchmark per portfolio is currently supported.
        </p>
      </div>
      <div className="space-y-4 p-5">
        {current ? (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-3">
            <div><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Current benchmark</p><p className="mt-0.5 text-xs font-semibold text-[var(--app-text)]">{current.label}</p></div>
            <button type="button" disabled={saving} onClick={() => save(null)} className="rounded-md border border-[var(--app-border)] px-2.5 py-1 text-[10px] text-[var(--app-text-muted)] hover:border-[var(--app-negative)] hover:text-[var(--app-negative)] disabled:opacity-50">Clear</button>
          </div>
        ) : <p className="text-xs text-[var(--app-text-muted)]">No benchmark selected.</p>}

        {error ? <p className="rounded-lg bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] px-3 py-2 text-xs text-[var(--app-negative)]">{error}</p> : null}
        <div className="flex gap-2">
          <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); search() } }} placeholder="Search an index, ETF, or ticker" className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
          <button type="button" onClick={search} disabled={searching} className="rounded-lg bg-[var(--app-accent)] px-3 text-xs font-semibold text-white disabled:opacity-50">{searching ? "Searching..." : "Search"}</button>
        </div>
        {searched && results.length === 0 ? <p className="text-xs text-[var(--app-text-faint)]">No matches.</p> : null}
        <div className="space-y-2">
          {results.map((instrument) => (
            <div key={instrument.id} className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-3">
              <p className="text-xs font-semibold text-[var(--app-text)]">{instrument.name}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {instrument.listings.map((listing) => <button key={listing.id} type="button" disabled={saving} onClick={() => save(listing.id)} className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[10px] text-[var(--app-text-muted)] hover:border-[var(--app-accent)] hover:text-[var(--app-accent)] disabled:opacity-50">{listing.symbol} · {listing.exchange_mic ?? "?"} · {listing.currency}</button>)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
