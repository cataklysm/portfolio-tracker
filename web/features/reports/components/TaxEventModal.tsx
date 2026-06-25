"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { createTaxEventAction, updateTaxEventAction } from "@/features/reports/actions"
import type { TaxEvent } from "@/lib/types"
import type { ReactNode } from "react"

const fieldClass =
  "h-[38px] w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 text-[13px] font-bold text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-text-faint)] focus:border-[var(--app-accent)]"
const labelClass = "mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-text-faint)]"
const closeButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
const cancelButtonClass =
  "inline-flex h-9 items-center justify-center rounded-md px-4 text-[12px] font-extrabold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-md bg-[var(--app-accent)] px-4 text-[12px] font-extrabold text-white transition hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,white)] disabled:opacity-50"
const errorClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-negative)_38%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] px-3 py-2 text-[12px] font-bold text-[var(--app-negative)]"

/**
 * The fields the edit form actually reads. This is narrower than the full
 * TaxEvent because embedded transaction tax events omit link/audit columns.
 */
export type EditableTaxEvent = Pick<
  TaxEvent,
  "id" | "position_id" | "component" | "direction" | "amount" | "currency" | "booking_date" | "note"
>

interface Props {
  event?: EditableTaxEvent
  triggerLabel?: string
  triggerClassName?: string
  triggerContent?: ReactNode
  triggerTitle?: string
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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={props.triggerClassName ?? "inline-flex h-7 items-center rounded-md border border-[var(--app-border)] px-2 text-[10px] font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}
        title={props.triggerTitle ?? (event ? "Edit tax event" : "Record broker tax")}
      >
        {props.triggerContent ?? props.triggerLabel ?? (event ? "Edit" : "Record tax")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="app-panel flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-lg shadow-2xl">
            <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
              <h3 className="text-[14px] font-[750] leading-tight text-[var(--app-text)]">{event ? "Edit recorded broker tax" : "Record broker tax"}</h3>
              <button type="button" onClick={() => setOpen(false)} className={closeButtonClass} aria-label="Close tax dialog">
                x
              </button>
            </div>

            <form action={formAction} className="min-h-0 overflow-y-auto">
              <div className="space-y-4 bg-[var(--app-surface-raised)] p-4">
                {error ? <p className={errorClass}>{error}</p> : null}

                <div className="grid grid-cols-2 gap-3">
                  <Field labelText="Component">
                    <select name="component" defaultValue={event?.component ?? "capital_income"} className={fieldClass}>
                      <option value="capital_income">Capital income tax</option>
                      <option value="solidarity">Solidarity surcharge</option>
                      <option value="church">Church tax</option>
                      <option value="foreign_withholding">Foreign withholding</option>
                      <option value="generic">Broker tax / correction</option>
                    </select>
                  </Field>
                  <Field labelText="Direction">
                    <select name="direction" defaultValue={event?.direction ?? "withheld"} className={fieldClass}>
                      <option value="withheld">Withheld</option>
                      <option value="refunded">Refunded</option>
                    </select>
                  </Field>
                  <Field labelText="Amount">
                    <input name="amount" type="number" step="any" min="0" required defaultValue={event?.amount} className={fieldClass} />
                  </Field>
                  <Field labelText="Currency">
                    <input name="currency" maxLength={3} required defaultValue={event?.currency ?? props.currency} className={`${fieldClass} uppercase`} />
                  </Field>
                  <Field labelText="Booking date">
                    <input name="booking_date" type="date" required defaultValue={event?.booking_date ?? today} className={fieldClass} />
                  </Field>
                  <Field labelText="Note">
                    <input name="note" maxLength={280} defaultValue={event?.note ?? ""} className={fieldClass} />
                  </Field>
                </div>

                {!event ? (
                  <>
                    {props.portfolioId ? <input type="hidden" name="portfolio_id" value={props.portfolioId} /> : null}
                    {props.positionId ? <input type="hidden" name="position_id" value={props.positionId} /> : null}
                    {props.transactionId ? <input type="hidden" name="transaction_id" value={props.transactionId} /> : null}
                    {props.cashFlowId ? <input type="hidden" name="cash_flow_id" value={props.cashFlowId} /> : null}
                  </>
                ) : (
                  <p className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 py-2 text-[11px] font-medium leading-4 text-[var(--app-text-faint)]">
                    Attribution links are immutable. Delete and recreate the event to change its linked transaction, cash flow, position, or portfolio.
                  </p>
                )}
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-surface-header)_82%,var(--app-surface-panel))] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,white_4%,transparent)]">
                <button type="button" onClick={() => setOpen(false)} disabled={pending} className={cancelButtonClass}>Cancel</button>
                <button type="submit" disabled={pending} className={primaryButtonClass}>{pending ? "Saving..." : event ? "Save changes" : "Record tax"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Field({ labelText, children }: { labelText: string; children: ReactNode }) {
  return (
    <label>
      <span className={labelClass}>{labelText}</span>
      {children}
    </label>
  )
}
