"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { createTaxEventAction, deleteTaxEventAction } from "@/features/reports/actions"
import { TaxEventModal } from "@/features/reports/components/TaxEventModal"
import { fmtCurrency, num } from "@/lib/format"
import type { TaxComponent, TaxEvent, TaxReport } from "@/lib/types"
import type { FormEvent } from "react"

const COMPONENT_LABEL: Record<TaxComponent, string> = {
  capital_income: "Capital income tax",
  solidarity: "Solidarity surcharge",
  church: "Church tax",
  foreign_withholding: "Foreign withholding",
  generic: "Broker tax / correction",
}

const STATUS_LABEL: Record<TaxReport["status"], { text: string; cls: string }> = {
  unavailable: { text: "No tax recorded", cls: "text-[var(--app-text-muted)]" },
  actual_partial: { text: "Partial - some events unconverted", cls: "text-[var(--app-warning)]" },
  actual_complete: { text: "Complete", cls: "text-[var(--app-positive)]" },
}

interface Props {
  report: TaxReport
  events: TaxEvent[]
  locale: string
  portfolios: { id: string; name: string }[]
  selectedPortfolioId?: string
}

export function TaxCenter({ report, events, locale, portfolios, selectedPortfolioId }: Props) {
  const currency = report.reporting_currency
  const status = STATUS_LABEL[report.status]
  const after = num(report.realized_pnl_after_actual_tax) ?? 0
  const gross = num(report.gross_realized_pnl) ?? 0

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] px-4 py-3">
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Tax (recorded broker tax)</h2>
        <span className={`text-[9px] font-semibold ${status.cls}`}>{status.text}</span>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Gross realized P&L" value={signed(report.gross_realized_pnl, locale, currency)} tone={tone(gross)} />
        <Metric label="Tax withheld" value={money(report.actual_tax_withheld, locale, currency)} />
        <Metric label="Tax refunded" value={money(report.actual_tax_refunded, locale, currency)} />
        <Metric
          label="Realized P&L after actual tax"
          value={signed(report.realized_pnl_after_actual_tax, locale, currency)}
          tone={tone(after)}
          sub={`Net tax ${money(report.net_actual_tax, locale, currency)}`}
        />
      </div>

      <p className="border-t border-[var(--app-border)] px-4 py-2 text-[10px] leading-4 text-[var(--app-text-faint)]">
        Recorded broker tax is information your broker booked, not a tax-liability calculation. Income tax linked to
        dividends, cash-in-lieu, or interest is managed through the income booking.
      </p>

      {report.by_component.length > 0 ? (
        <div className="border-t border-[var(--app-border)] px-4 py-3">
          <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">By component</p>
          <table className="w-full text-[11px]">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">
                <th className="py-1 text-left font-semibold">Component</th>
                <th className="py-1 text-right font-semibold">Withheld</th>
                <th className="py-1 text-right font-semibold">Refunded</th>
                <th className="py-1 text-right font-semibold">Net</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--app-border)]">
              {report.by_component.map((row) => (
                <tr key={row.component}>
                  <td className="py-1.5 text-[var(--app-text)]">{COMPONENT_LABEL[row.component]}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--app-text-muted)]">{money(row.withheld, locale, currency)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--app-text-muted)]">{money(row.refunded, locale, currency)}</td>
                  <td className="py-1.5 text-right tabular-nums text-[var(--app-text)]">{money(row.net, locale, currency)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <TaxEventList events={events} locale={locale} />
      <AddTaxEvent currency={currency} portfolios={portfolios} selectedPortfolioId={selectedPortfolioId} />
    </section>
  )
}

function TaxEventList({ events, locale }: { events: TaxEvent[]; locale: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(event: TaxEvent) {
    if (event.source === "income_booking") return
    setBusy(event.id)
    await deleteTaxEventAction(event.id, event.position_id, null)
    setBusy(null)
    router.refresh()
  }

  if (events.length === 0) {
    return <p className="border-t border-[var(--app-border)] px-4 py-3 text-[11px] text-[var(--app-text-faint)]">No tax events recorded for this scope.</p>
  }

  return (
    <div className="border-t border-[var(--app-border)] px-4 py-3">
      <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Recorded events</p>
      <ul className="space-y-1">
        {events.map((event) => {
          const managedIncomeBooking = event.source === "income_booking"
          return (
            <li key={event.id} className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] px-3 py-2 text-[11px]">
              <div className="min-w-0">
                <span className="font-medium text-[var(--app-text)]">{COMPONENT_LABEL[event.component]}</span>
                <span className={`ml-2 rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase ${event.direction === "withheld" ? "bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] text-[var(--app-negative)]" : "bg-[color-mix(in_srgb,var(--app-positive)_12%,transparent)] text-[var(--app-positive)]"}`}>
                  {event.direction}
                </span>
                {managedIncomeBooking ? <span className="ml-2 rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[9px] font-semibold text-[var(--app-text-muted)]">Managed</span> : null}
                {event.note ? <span className="ml-2 text-[var(--app-text-faint)]">{event.note}</span> : null}
                <span className="mt-1 block text-[9px] text-[var(--app-text-faint)]">
                  Source: {event.source} - {event.transaction_id ? "transaction linked - " : ""}{event.cash_flow_id ? "cash flow linked - " : ""}{event.position_id ? "position linked - " : ""}{event.portfolio_id ? "portfolio linked" : "no portfolio link"}
                </span>
                <span className="ml-2 text-[var(--app-text-faint)]">- {event.booking_date}{event.portfolio_id ? "" : " - standalone"}</span>
              </div>
              <div className="flex items-center gap-3 whitespace-nowrap">
                <span className="tabular-nums text-[var(--app-text)]">{fmtCurrency(locale, num(event.amount) ?? 0, event.currency)}</span>
                <TaxEventModal event={event} currency={event.currency} />
                {managedIncomeBooking ? null : (
                  <button onClick={() => remove(event)} disabled={busy === event.id} className="text-[var(--app-text-faint)] transition hover:text-[var(--app-negative)] disabled:opacity-50" title="Delete">
                    x
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function AddTaxEvent({ currency, portfolios, selectedPortfolioId }: { currency: string; portfolios: { id: string; name: string }[]; selectedPortfolioId?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const today = new Date().toISOString().slice(0, 10)

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const result = await createTaxEventAction(null, new FormData(e.currentTarget))
    setSaving(false)
    if (result) setError(result)
    else {
      setOpen(false)
      router.refresh()
    }
  }

  const field = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-[11px] text-[var(--app-text)] outline-none focus:ring-1 focus:ring-[var(--app-accent)]"
  const label = "mb-1 block text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]"

  if (!open) {
    return (
      <div className="border-t border-[var(--app-border)] px-4 py-3">
        <button onClick={() => setOpen(true)} className="rounded-md border border-[var(--app-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]">
          + Record tax event
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 border-t border-[var(--app-border)] px-4 py-3">
      {error ? <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-[11px] text-rose-400">{error}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <div>
          <label className={label}>Component</label>
          <select name="component" className={field} defaultValue="capital_income">
            <option value="capital_income">Capital income tax</option>
            <option value="solidarity">Solidarity surcharge</option>
            <option value="church">Church tax</option>
            <option value="foreign_withholding">Foreign withholding</option>
            <option value="generic">Broker tax / correction</option>
          </select>
        </div>
        <div>
          <label className={label}>Direction</label>
          <select name="direction" className={field} defaultValue="withheld">
            <option value="withheld">Withheld</option>
            <option value="refunded">Refunded</option>
          </select>
        </div>
        <div>
          <label className={label}>Amount</label>
          <input name="amount" type="number" step="any" min="0" required className={field} />
        </div>
        <div>
          <label className={label}>Currency</label>
          <input name="currency" type="text" defaultValue={currency} maxLength={3} className={`${field} uppercase`} />
        </div>
        <div>
          <label className={label}>Booking date</label>
          <input name="booking_date" type="date" required defaultValue={today} className={field} />
        </div>
        <div className="sm:col-span-2">
          <label className={label}>Portfolio</label>
          <select name="portfolio_id" className={field} defaultValue={selectedPortfolioId ?? ""}>
            <option value="">Standalone (no portfolio)</option>
            {portfolios.map((portfolio) => (
              <option key={portfolio.id} value={portfolio.id}>{portfolio.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={label}>Note</label>
          <input name="note" type="text" maxLength={280} className={field} />
        </div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-[11px] text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)]">Cancel</button>
        <button type="submit" disabled={saving} className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-sky-500 disabled:opacity-50">{saving ? "Saving..." : "Record"}</button>
      </div>
    </form>
  )
}

function Metric({ label, value, sub, tone: metricTone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" }) {
  const color = metricTone === "positive" ? "text-[var(--app-positive)]" : metricTone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="border-b border-[var(--app-border)] px-4 py-3 last:border-b-0 sm:border-r">
      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</p>
      <p className={`mt-1 text-base font-semibold tabular-nums ${color}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] text-[var(--app-text-muted)]">{sub}</p> : null}
    </div>
  )
}

function money(value: string, locale: string, currency: string): string {
  return fmtCurrency(locale, num(value) ?? 0, currency)
}

function signed(value: string, locale: string, currency: string): string {
  const amount = num(value) ?? 0
  return `${amount >= 0 ? "+" : ""}${fmtCurrency(locale, amount, currency)}`
}

function tone(value: number): "positive" | "negative" {
  return value >= 0 ? "positive" : "negative"
}
