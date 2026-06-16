"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type InputHTMLAttributes } from "react"
import { useRouter } from "next/navigation"
import {
  createAdminSymbolAction,
  deactivateAdminSymbolAction,
  getInstrumentSelectionsAction,
  searchProviderSymbolsAction,
  updateAdminSymbolAction,
  type ProviderSymbolHit,
} from "@/app/administration/symbols/actions"
import type { AdminSymbolView, ExchangeView, ProviderSettingsView } from "@/lib/types"

/**
 * Capability feed-groups that share one provider (mirrors the backend's
 * SELECTION_GROUPS): quotes+chart move together, earnings+corporate_actions+news
 * move together, fundamentals and analyst are standalone. `capability` is the
 * representative sent to the batch selection endpoint, which expands the group.
 */
const FEED_GROUPS = [
  { key: "price", label: "Quotes & chart", short: "Price", capability: "quotes" },
  { key: "events", label: "Earnings, actions & news", short: "Events", capability: "earnings" },
  { key: "fundamentals", label: "Fundamentals", short: "Fund.", capability: "fundamentals" },
  { key: "analyst", label: "Analyst", short: "Analyst", capability: "analyst" },
] as const

const fieldClass = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--app-text-faint)]"
const buttonClass = "rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"

export function SymbolsAdministration({
  symbols,
  exchanges,
  providers,
}: {
  symbols: AdminSymbolView[]
  exchanges: ExchangeView[]
  providers: ProviderSettingsView[]
}) {
  // Only symbol-class providers can serve an instrument's capabilities (ECB etc. are reference/FX).
  const symbolProviders = useMemo(() => providers.filter((p) => p.providerClass === "symbol"), [providers])
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [onlyUnused, setOnlyUnused] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<AdminSymbolView | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return symbols.filter((item) => {
      if (onlyUnused && item.in_use) return false
      return !needle || [item.instrument_name, item.symbol, item.isin, item.exchange_mic]
        .some((value) => value?.toLowerCase().includes(needle))
    })
  }, [symbols, query, onlyUnused])

  function run(action: () => Promise<string | null>, success: string) {
    setMessage(null)
    startTransition(async () => {
      const error = await action()
      setMessage(error ?? success)
      if (!error) {
        setShowAdd(false)
        setEditing(null)
        router.refresh()
      }
    })
  }

  return (
    <div className="mx-auto max-w-[1300px] px-4 py-5 lg:px-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]">Administration</p>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">Symbols</h1>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">Manage the instrument catalog and its active listings.</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110">Add symbol</button>
      </header>

      {message ? <p className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text-muted)]">{message}</p> : null}

      <section className="app-panel overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--app-border)] p-3">
          <div className="relative min-w-[220px] flex-1">
            <SearchIcon />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name, symbol, ISIN or exchange" className={`${fieldClass} pl-9`} />
          </div>
          <label className="flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
            <input type="checkbox" checked={onlyUnused} onChange={(event) => setOnlyUnused(event.target.checked)} className="accent-[var(--app-accent)]" />
            Unused only
          </label>
          <span className="text-[10px] text-[var(--app-text-faint)]">{filtered.length} of {symbols.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[880px] text-left">
            <thead className="bg-[var(--app-surface-raised)] text-[10px] uppercase tracking-wider text-[var(--app-text-faint)]">
              <tr>
                <th className="px-4 py-3">Instrument</th>
                <th className="px-4 py-3">Listing</th>
                <th className="px-4 py-3">Providers</th>
                <th className="px-4 py-3">Usage</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item) => (
                <tr key={item.id} className="border-t border-[var(--app-border)] transition hover:bg-[var(--app-surface-hover)]">
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-[var(--app-text)]">{item.instrument_name}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--app-text-faint)]">{item.asset_type}{item.isin ? ` - ${item.isin}` : ""}</p>
                  </td>
                  <td className="px-4 py-3">
                    <p className="text-xs font-semibold text-[var(--app-text)]">{item.symbol}</p>
                    <p className="mt-0.5 text-[10px] text-[var(--app-text-faint)]">{item.exchange_mic ?? "No exchange"} - {item.currency}</p>
                  </td>
                  <td className="px-4 py-3"><ProvidersCell selections={item.provider_selections} /></td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${item.in_use ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "bg-[color-mix(in_srgb,var(--app-positive)_12%,transparent)] text-[var(--app-positive)]"}`}>{item.in_use ? "In use" : "Unused"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEditing(item)} className={buttonClass}>Edit</button>
                      <button disabled={item.in_use || pending} title={item.in_use ? "Remove positions and watchlist entries first" : "Remove unused symbol"} onClick={() => { if (confirm(`Remove ${item.symbol} from the active catalog?`)) run(() => deactivateAdminSymbolAction(item.id), `${item.symbol} removed.`) }} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-negative)] disabled:cursor-not-allowed disabled:opacity-35">Remove</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {filtered.length === 0 ? <p className="py-16 text-center text-xs text-[var(--app-text-faint)]">No symbols match this view.</p> : null}
        </div>
      </section>

      {showAdd ? <SymbolDialog title="Add symbol" exchanges={exchanges} providers={symbolProviders} pending={pending} onClose={() => setShowAdd(false)} onSubmit={(formData) => run(() => createAdminSymbolAction(formData), "Symbol added.")} /> : null}
      {editing ? <SymbolDialog title="Edit symbol" exchanges={exchanges} providers={symbolProviders} symbol={editing} pending={pending} onClose={() => setEditing(null)} onSubmit={(formData) => run(() => updateAdminSymbolAction(formData), "Symbol updated.")} /> : null}
    </div>
  )
}

/**
 * Compact per-feed-group provider readout for the table: one line per group
 * (Price / Events / Fund. / Analyst) with its selected provider, or a muted "—"
 * when no provider is set — so it's obvious at a glance which feeds need wiring.
 */
function ProvidersCell({ selections }: { selections: { capability: string; provider: string }[] }) {
  const byCapability = useMemo(() => new Map(selections.map((s) => [s.capability, s.provider])), [selections])
  return (
    <div className="space-y-0.5">
      {FEED_GROUPS.map((group) => {
        const provider = byCapability.get(group.capability)
        return (
          <p key={group.key} className="flex items-center gap-1.5 text-[10px] leading-tight">
            <span className="w-12 shrink-0 text-[var(--app-text-faint)]">{group.short}</span>
            {provider ? (
              <span className="font-mono font-semibold text-[var(--app-text)]">{provider}</span>
            ) : (
              <span className="text-[var(--app-text-faint)]">—</span>
            )}
          </p>
        )
      })}
    </div>
  )
}

function SymbolDialog({
  title,
  exchanges,
  providers,
  symbol,
  pending,
  onClose,
  onSubmit,
}: {
  title: string
  exchanges: ExchangeView[]
  providers: ProviderSettingsView[]
  symbol?: AdminSymbolView
  pending: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  return (
    <dialog ref={dialogRef} onCancel={onClose} className="m-auto w-[min(720px,calc(100%-2rem))] rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-0 text-[var(--app-text)] shadow-2xl backdrop:bg-black/60">
      <form action={onSubmit} className="max-h-[85vh] overflow-y-auto">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-xs text-[var(--app-text-faint)] hover:text-[var(--app-text)]">Close</button></div>
        <div className="grid gap-4 p-5 sm:grid-cols-2">
          {symbol ? <><input type="hidden" name="instrument_id" value={symbol.instrument_id} /><input type="hidden" name="listing_id" value={symbol.id} /></> : null}
          <Field label="Instrument name" name="name" defaultValue={symbol?.instrument_name} required />
          <div><label className={labelClass}>Asset type</label><select name="asset_type" defaultValue={symbol?.asset_type ?? "equity"} disabled={!!symbol} className={fieldClass}><option value="equity">Equity</option><option value="fund">Fund</option><option value="crypto">Crypto</option></select></div>
          <Field label="ISIN" name="isin" defaultValue={symbol?.isin ?? ""} maxLength={12} />
          <Field label="Underlying identifier" name="underlying_identifier" defaultValue={symbol?.underlying_identifier ?? ""} disabled={!!symbol} />
          <Field label="Display symbol" name="symbol" defaultValue={symbol?.symbol} required />
          <Field label="Currency" name="currency" defaultValue={symbol?.currency ?? "EUR"} maxLength={3} required />
          <div><label className={labelClass}>Exchange</label><select name="exchange_id" defaultValue={symbol?.exchange_id ?? exchanges[0]?.id} className={fieldClass}>{exchanges.map((exchange) => <option key={exchange.id} value={exchange.id}>{exchange.mic} - {exchange.name}</option>)}</select></div>
        </div>
        {symbol ? <ProviderMatrix symbol={symbol} providers={providers} /> : null}
        <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--app-border)] bg-[var(--app-surface)] px-5 py-4"><button type="button" onClick={onClose} className={buttonClass}>Cancel</button><button disabled={pending} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save symbol"}</button></div>
      </form>
    </dialog>
  )
}

/**
 * Edits which provider serves each feed group and that provider's symbol for this
 * listing. Selections are per feed group (4 selectors); symbols are per *distinct
 * provider* (so quotes+chart on the same provider share one symbol field). State
 * is serialized into hidden inputs the save action reads.
 */
function ProviderMatrix({ symbol, providers }: { symbol: AdminSymbolView; providers: ProviderSettingsView[] }) {
  // group key -> selected provider name ("" = none)
  const [groupProvider, setGroupProvider] = useState<Record<string, string>>({})
  // provider name -> its symbol/identifier for this listing
  const [symbolByProvider, setSymbolByProvider] = useState<Record<string, string>>(() =>
    Object.fromEntries(symbol.provider_identifiers.map((p) => [p.provider, p.provider_identifier])),
  )
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    getInstrumentSelectionsAction(symbol.instrument_id).then((selections) => {
      if (!active) return
      const byCapability = new Map(selections.map((s) => [s.capability, s.provider]))
      setGroupProvider(Object.fromEntries(FEED_GROUPS.map((g) => [g.key, byCapability.get(g.capability) ?? ""])))
      setLoading(false)
    })
    return () => { active = false }
  }, [symbol.instrument_id])

  const distinctProviders = useMemo(
    () => [...new Set(Object.values(groupProvider).filter((p) => p.length > 0))],
    [groupProvider],
  )

  function setSymbol(provider: string, value: string) {
    setSymbolByProvider((prev) => ({ ...prev, [provider]: value }))
  }

  const selectionsPayload = FEED_GROUPS.filter((g) => groupProvider[g.key]).map((g) => ({
    capability: g.capability,
    provider: groupProvider[g.key],
  }))
  const identifiersPayload = distinctProviders.map((p) => ({ provider: p, provider_identifier: symbolByProvider[p] ?? "" }))

  return (
    <div className="border-t border-[var(--app-border)] p-5">
      <h3 className="mb-1 text-xs font-semibold text-[var(--app-text)]">Data providers</h3>
      <p className="mb-3 text-[10px] text-[var(--app-text-faint)]">
        Pick a provider per feed, then give each provider its symbol for this listing. Capabilities sharing a provider share one symbol.
      </p>
      <input type="hidden" name="provider_selections" value={JSON.stringify(selectionsPayload)} />
      <input type="hidden" name="provider_identifiers" value={JSON.stringify(identifiersPayload)} />

      {loading ? (
        <p className="text-[10px] text-[var(--app-text-faint)]">Loading current selections…</p>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {FEED_GROUPS.map((group) => (
              <div key={group.key}>
                <label className={labelClass}>{group.label}</label>
                <select
                  value={groupProvider[group.key] ?? ""}
                  onChange={(event) => setGroupProvider((prev) => ({ ...prev, [group.key]: event.target.value }))}
                  className={fieldClass}
                >
                  <option value="">— none —</option>
                  {providers.map((p) => <option key={p.provider} value={p.provider}>{p.provider}</option>)}
                </select>
              </div>
            ))}
          </div>

          {distinctProviders.length > 0 ? (
            <div className="mt-4 space-y-3">
              <h4 className="text-[10px] font-semibold uppercase tracking-wider text-[var(--app-text-faint)]">Provider symbols</h4>
              {distinctProviders.map((provider) => (
                <ProviderSymbolRow
                  key={provider}
                  provider={provider}
                  value={symbolByProvider[provider] ?? ""}
                  onChange={(value) => setSymbol(provider, value)}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}

/** One provider's symbol field for the listing, with a provider-specific search lookup. */
function ProviderSymbolRow({ provider, value, onChange }: { provider: string; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<ProviderSymbolHit[]>([])
  const [searching, startSearch] = useTransition()

  function search() {
    if (query.trim().length === 0) return
    startSearch(async () => setResults(await searchProviderSymbolsAction(provider, query)))
  }

  return (
    <div>
      <label className={labelClass}>{provider} symbol</label>
      <div className="flex gap-2">
        <input value={value} onChange={(event) => onChange(event.target.value)} placeholder="ISIN / WKN / id" className={fieldClass} />
        <button type="button" onClick={() => setOpen((v) => !v)} className={buttonClass}>{open ? "Close" : "Search"}</button>
      </div>
      {open ? (
        <div className="mt-2 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-2">
          <div className="flex gap-2">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); search() } }}
              placeholder={`Search ${provider} by ISIN, WKN or name`}
              className={fieldClass}
            />
            <button type="button" disabled={searching} onClick={search} className={buttonClass}>{searching ? "…" : "Find"}</button>
          </div>
          <div className="mt-2 max-h-40 overflow-y-auto">
            {results.length === 0 ? (
              <p className="px-1 py-2 text-[10px] text-[var(--app-text-faint)]">{searching ? "Searching…" : "No results yet."}</p>
            ) : (
              results.map((hit) => (
                <button
                  key={hit.symbol}
                  type="button"
                  onClick={() => { onChange(hit.symbol); setOpen(false) }}
                  className="flex w-full items-center justify-between gap-3 rounded-md px-2 py-1.5 text-left text-xs hover:bg-[var(--app-surface-hover)]"
                >
                  <span className="min-w-0 truncate text-[var(--app-text)]">{hit.name}</span>
                  <span className="shrink-0 font-mono text-[10px] text-[var(--app-text-faint)]">{hit.symbol}{hit.currency ? ` · ${hit.currency}` : ""}</span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div><label className={labelClass}>{label}</label><input {...props} className={`${fieldClass} ${props.className ?? ""}`} /></div>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--app-text-faint)]"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
}
