"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { createTaxEventAction, updateTaxEventAction } from "@/app/reports/tax-actions"
import type { TaxEvent } from "@/lib/types"

const field = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none focus:ring-1 focus:ring-[var(--app-accent)]"
const label = "mb-1 block text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]"

interface Props {
  event?: TaxEvent
  triggerLabel?: string
  currency: string
  portfolioId?: string | null
  positionId?: string | null
  transactionId?: string | null
  cashFlowId?: string | null
}

export function TaxEventModal(props: Props) {
  const [open, setOpen] = useState(false)
  const action = props.event
    ? updateTaxEventAction.bind(null, props.event.id, props.event.position_id)
    : createTaxEventAction
  const [error, formAction, pending] = useActionState(action, null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !error) setOpen(false)
    wasPending.current = pending
  }, [pending, error])

  const event = props.event
  const today = new Date().toISOString().slice(0, 10)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-[var(--app-border)] px-2 py-1 text-[10px] text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
        {props.triggerLabel ?? (event ? "Edit" : "Record tax")}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="app-panel max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--app-text)]">{event ? "Edit recorded broker tax" : "Record broker tax"}</h3>
              <button type="button" onClick={() => setOpen(false)} className="text-[var(--app-text-faint)] hover:text-[var(--app-text)]">×</button>
            </div>
            <form action={formAction} className="space-y-3">
              {error ? <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p> : null}
              <div className="grid grid-cols-2 gap-3">
                <Field labelText="Component"><select name="component" defaultValue={event?.component ?? "capital_income"} className={field}><option value="capital_income">Capital income tax</option><option value="solidarity">Solidarity surcharge</option><option value="church">Church tax</option><option value="foreign_withholding">Foreign withholding</option><option value="generic">Broker tax / correction</option></select></Field>
                <Field labelText="Direction"><select name="direction" defaultValue={event?.direction ?? "withheld"} className={field}><option value="withheld">Withheld</option><option value="refunded">Refunded</option></select></Field>
                <Field labelText="Amount"><input name="amount" type="number" step="any" min="0" required defaultValue={event?.amount} className={field} /></Field>
                <Field labelText="Currency"><input name="currency" maxLength={3} required defaultValue={event?.currency ?? props.currency} className={`${field} uppercase`} /></Field>
                <Field labelText="Booking date"><input name="booking_date" type="date" required defaultValue={event?.booking_date ?? today} className={field} /></Field>
                <Field labelText="Note"><input name="note" maxLength={280} defaultValue={event?.note ?? ""} className={field} /></Field>
              </div>
              {!event ? <>
                {props.portfolioId ? <input type="hidden" name="portfolio_id" value={props.portfolioId} /> : null}
                {props.positionId ? <input type="hidden" name="position_id" value={props.positionId} /> : null}
                {props.transactionId ? <input type="hidden" name="transaction_id" value={props.transactionId} /> : null}
                {props.cashFlowId ? <input type="hidden" name="cash_flow_id" value={props.cashFlowId} /> : null}
              </> : (
                <p className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-[10px] text-[var(--app-text-faint)]">
                  Attribution links are immutable. Delete and recreate the event to change its linked transaction, cash flow, position, or portfolio.
                </p>
              )}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)]">Cancel</button>
                <button type="submit" disabled={pending} className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : event ? "Save changes" : "Record tax"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Field({ labelText, children }: { labelText: string; children: React.ReactNode }) {
  return <label><span className={label}>{labelText}</span>{children}</label>
}
