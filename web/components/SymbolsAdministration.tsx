"use client"

import { useEffect, useMemo, useRef, useState, useTransition, type InputHTMLAttributes } from "react"
import { useRouter } from "next/navigation"
import {
  createAdminSymbolAction,
  deactivateAdminSymbolAction,
  updateAdminSymbolAction,
} from "@/app/administration/symbols/actions"
import type { AdminSymbolView, ExchangeView } from "@/lib/types"

const fieldClass = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--app-text-faint)]"
const buttonClass = "rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"

export function SymbolsAdministration({
  symbols,
  exchanges,
}: {
  symbols: AdminSymbolView[]
  exchanges: ExchangeView[]
}) {
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
          <table className="w-full min-w-[760px] text-left">
            <thead className="bg-[var(--app-surface-raised)] text-[10px] uppercase tracking-wider text-[var(--app-text-faint)]">
              <tr>
                <th className="px-4 py-3">Instrument</th>
                <th className="px-4 py-3">Listing</th>
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

      {showAdd ? <SymbolDialog title="Add symbol" exchanges={exchanges} pending={pending} onClose={() => setShowAdd(false)} onSubmit={(formData) => run(() => createAdminSymbolAction(formData), "Symbol added.")} /> : null}
      {editing ? <SymbolDialog title="Edit symbol" exchanges={exchanges} symbol={editing} pending={pending} onClose={() => setEditing(null)} onSubmit={(formData) => run(() => updateAdminSymbolAction(formData), "Symbol updated.")} /> : null}
    </div>
  )
}

function SymbolDialog({
  title,
  exchanges,
  symbol,
  pending,
  onClose,
  onSubmit,
}: {
  title: string
  exchanges: ExchangeView[]
  symbol?: AdminSymbolView
  pending: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  useEffect(() => { dialogRef.current?.showModal() }, [])
  return (
    <dialog ref={dialogRef} onCancel={onClose} className="m-auto w-[min(700px,calc(100%-2rem))] rounded-xl border border-[var(--app-border)] bg-[var(--app-surface)] p-0 text-[var(--app-text)] shadow-2xl backdrop:bg-black/60">
      <form action={onSubmit}>
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-5 py-4"><h2 className="text-sm font-semibold">{title}</h2><button type="button" onClick={onClose} className="text-xs text-[var(--app-text-faint)] hover:text-[var(--app-text)]">Close</button></div>
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
        <div className="flex justify-end gap-2 border-t border-[var(--app-border)] px-5 py-4"><button type="button" onClick={onClose} className={buttonClass}>Cancel</button><button disabled={pending} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{pending ? "Saving..." : "Save symbol"}</button></div>
      </form>
    </dialog>
  )
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div><label className={labelClass}>{label}</label><input {...props} className={`${fieldClass} ${props.className ?? ""}`} /></div>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--app-text-faint)]"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
}
