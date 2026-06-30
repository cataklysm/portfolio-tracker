"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { createCashFlowAction, updateCashFlowAction } from "@/app/activity/actions"
import type { CashFlow, CashFlowType, Portfolio, PositionView, TaxComponent } from "@/lib/types"
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
const addButtonClass =
  "inline-flex h-7 items-center rounded-md border border-[var(--app-border)] px-2 text-[10px] font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
const errorClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-negative)_38%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] px-3 py-2 text-[12px] font-bold text-[var(--app-negative)]"

const CASH_FLOW_TYPES: { value: CashFlowType; label: string }[] = [
  { value: "dividend", label: "Dividend" },
  { value: "interest", label: "Interest" },
  { value: "cash_in_lieu", label: "Cash in lieu" },
  { value: "deposit", label: "Deposit" },
  { value: "withdrawal", label: "Withdrawal" },
]

const TAX_COMPONENTS: { field: string; component: TaxComponent; label: string }[] = [
  { field: "tax_component_capital_income", component: "capital_income", label: "Capital income tax" },
  { field: "tax_component_solidarity", component: "solidarity", label: "Solidarity surcharge" },
  { field: "tax_component_church", component: "church", label: "Church tax" },
  { field: "tax_component_foreign_withholding", component: "foreign_withholding", label: "Foreign withholding" },
  { field: "tax_component_generic", component: "generic", label: "Broker tax / correction" },
]

export interface CashFlowPreset {
  amountPerShare?: string | null
  currency?: string
  exDate?: string
  fee?: string
  grossAmount?: string
  instrumentId?: string
  note?: string
  paymentDate?: string
  portfolioId?: string
  positionId?: string | null
  revalidatePath?: string
  sourceEventId?: string
  sourceEventType?: string
  sourceEventVersion?: number | null
  taxRelevantValueDate?: string
  type?: CashFlowType
  withholdingTax?: string
}

interface CashFlowModalProps {
  flow?: CashFlow
  portfolios: Portfolio[]
  positions: PositionView[]
  preset?: CashFlowPreset
  triggerClassName?: string
  triggerContent?: ReactNode
  triggerLabel?: string
  triggerTitle?: string
}

export function CashFlowModal({ portfolios, positions, flow, preset, triggerClassName, triggerContent, triggerLabel, triggerTitle }: CashFlowModalProps) {
  const presetPosition = preset?.positionId ? positions.find((position) => position.id === preset.positionId) : undefined
  const [open, setOpen] = useState(false)
  const [portfolioId, setPortfolioId] = useState(flow?.portfolio_id ?? preset?.portfolioId ?? presetPosition?.portfolio_id ?? portfolios[0]?.id ?? "")
  const [type, setType] = useState<CashFlowType>(flow?.type ?? preset?.type ?? "dividend")
  const [selectedPositionId, setSelectedPositionId] = useState(flow?.position_id ?? preset?.positionId ?? "")
  const action = flow ? updateCashFlowAction.bind(null, flow.portfolio_id, flow.id) : createCashFlowAction.bind(null, portfolioId)
  const [error, formAction, pending] = useActionState(action, null)
  const wasPending = useRef(false)

  useEffect(() => {
    if (wasPending.current && !pending && !error) setOpen(false)
    wasPending.current = pending
  }, [pending, error])

  const requiresPosition = type === "dividend" || type === "cash_in_lieu"
  const incomeType = requiresPosition || type === "interest"
  const showsAssetSelect = !flow && incomeType
  const today = new Date().toISOString().slice(0, 10)
  const grossAmount = flow?.gross_amount ?? preset?.grossAmount ?? estimateGrossAmount(preset, presetPosition)
  const paymentDate = flow?.payment_date ?? preset?.paymentDate ?? preset?.exDate ?? today
  const taxRelevantValueDate = flow?.tax_relevant_value_date ?? preset?.taxRelevantValueDate ?? preset?.exDate ?? today
  const hasEventLink = !flow && Boolean(preset?.sourceEventId)
  const availablePositions = positions.filter((position) =>
    position.portfolio_id === portfolioId
    && (!hasEventLink || !preset?.instrumentId || position.listing?.instrument_id === preset.instrumentId),
  )

  function changePortfolio(nextPortfolioId: string) {
    setPortfolioId(nextPortfolioId)
    const currentPosition = positions.find((position) => position.id === selectedPositionId)
    if (currentPosition && currentPosition.portfolio_id !== nextPortfolioId) setSelectedPositionId("")
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName ?? addButtonClass} title={triggerTitle}>
        {triggerContent ?? triggerLabel ?? (flow ? "Edit" : "+ Add cash flow")}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
          <div className="app-panel flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg shadow-2xl">
            <div className="app-panel-header flex min-h-[52px] items-center justify-between gap-3 px-4 py-3">
              <div>
                <h3 className="text-[15px] font-[750] leading-tight text-[var(--app-text)]">{flow ? "Edit cash flow" : "Add cash flow"}</h3>
                <p className="mt-1 text-[11px] font-medium text-[var(--app-text-muted)]">
                  {flow ? "Amounts can be corrected here. Linked income taxes stay controlled by the booking." : "Book dividends, interest, deposits, withdrawals, and linked income tax."}
                </p>
              </div>
              <button type="button" onClick={() => setOpen(false)} className={closeButtonClass} aria-label="Close cash flow dialog">
                x
              </button>
            </div>

            <form action={formAction} className="min-h-0 overflow-y-auto">
              <div className="space-y-5 bg-[var(--app-surface-raised)] p-4">
                {error ? <p className={errorClass}>{error}</p> : null}

                <Section title="Basics">
                  <div className="grid gap-3 sm:grid-cols-2">
                    {!flow ? (
                      <Field labelText="Portfolio">
                        <select value={portfolioId} onChange={(e) => changePortfolio(e.target.value)} className={fieldClass}>
                          {portfolios.map((portfolio) => (
                            <option value={portfolio.id} key={portfolio.id}>{portfolio.name}</option>
                          ))}
                        </select>
                      </Field>
                    ) : null}

                    {!flow ? (
                      <Field labelText="Type">
                        <select name="type" value={type} onChange={(e) => setType(e.target.value as CashFlowType)} className={fieldClass}>
                          {CASH_FLOW_TYPES.map((option) => (
                            <option value={option.value} key={option.value}>{option.label}</option>
                          ))}
                        </select>
                      </Field>
                    ) : null}

                    {showsAssetSelect ? (
                      <Field labelText={requiresPosition ? "Asset" : "Asset (optional)"}>
                        <select name="position_id" required={requiresPosition} className={fieldClass} value={selectedPositionId} onChange={(e) => setSelectedPositionId(e.target.value)}>
                          <option value="">{requiresPosition ? "Select asset" : "Portfolio-level income"}</option>
                          {availablePositions.map((position) => (
                            <option value={position.id} key={position.id}>{position.listing?.name ?? position.listing?.symbol ?? position.id}</option>
                          ))}
                        </select>
                      </Field>
                    ) : null}

                    <Field labelText="Gross amount">
                      <input name="gross_amount" type="number" step="any" required defaultValue={grossAmount} className={fieldClass} />
                    </Field>
                    <Field labelText="Withholding tax">
                      <input name="withholding_tax" type="number" step="any" min="0" defaultValue={flow?.withholding_tax ?? preset?.withholdingTax ?? "0"} className={fieldClass} />
                    </Field>
                    <Field labelText="Fee">
                      <input name="fee" type="number" step="any" min="0" defaultValue={flow?.fee ?? preset?.fee ?? "0"} className={fieldClass} />
                    </Field>
                    <Field labelText="Currency">
                      <input name="currency" maxLength={3} required defaultValue={flow?.currency ?? preset?.currency ?? "EUR"} className={`${fieldClass} uppercase`} />
                    </Field>
                    <Field labelText="Payment date">
                      <input name="payment_date" type="date" required defaultValue={paymentDate} className={fieldClass} />
                    </Field>
                    <Field labelText="Tax-relevant date">
                      <input name="tax_relevant_value_date" type="date" defaultValue={taxRelevantValueDate} className={fieldClass} />
                    </Field>
                    <div className="sm:col-span-2">
                      <Field labelText="Note">
                        <input name="note" maxLength={280} defaultValue={flow?.note ?? preset?.note ?? ""} className={fieldClass} />
                      </Field>
                    </div>
                  </div>
                  {hasEventLink ? (
                    <>
                      <input type="hidden" name="source_event_id" value={preset?.sourceEventId ?? ""} />
                      {preset?.sourceEventVersion != null ? <input type="hidden" name="source_event_version" value={preset.sourceEventVersion} /> : null}
                      {preset?.sourceEventType ? <input type="hidden" name="source_event_type" value={preset.sourceEventType} /> : null}
                      {preset?.exDate ? <input type="hidden" name="ex_date" value={preset.exDate} /> : null}
                      {preset?.amountPerShare ? <input type="hidden" name="amount_per_share" value={preset.amountPerShare} /> : null}
                      {preset?.revalidatePath ? <input type="hidden" name="revalidate_path" value={preset.revalidatePath} /> : null}
                    </>
                  ) : null}
                </Section>

                {incomeType && !flow ? (
                  <Section
                    title="Income tax components"
                    detail="Optional. If any component is entered, withholding tax is derived from these linked tax events."
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {TAX_COMPONENTS.map((component) => (
                        <Field labelText={component.label} key={component.component}>
                          <input name={component.field} type="number" step="any" min="0" className={fieldClass} />
                        </Field>
                      ))}
                    </div>
                  </Section>
                ) : null}

                {flow?.source_event_id || hasEventLink ? (
                  <div className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 py-2 text-[11px] font-medium leading-4 text-[var(--app-text-faint)]">
                    Linked to {flow?.source_event_type ?? preset?.sourceEventType ?? "event"} {flow?.source_event_id ?? preset?.sourceEventId}. Event linkage is immutable after booking.
                  </div>
                ) : null}
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-surface-header)_82%,var(--app-surface-panel))] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,white_4%,transparent)]">
                <button type="button" onClick={() => setOpen(false)} disabled={pending} className={cancelButtonClass}>Cancel</button>
                <button type="submit" disabled={pending || !portfolioId} className={primaryButtonClass}>{pending ? "Saving..." : "Save cash flow"}</button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}

function Section({ title, detail, children }: { title: string; detail?: string; children: ReactNode }) {
  return (
    <section>
      <div className="mb-3">
        <h4 className="text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{title}</h4>
        {detail ? <p className="mt-1 text-[11px] font-medium leading-4 text-[var(--app-text-muted)]">{detail}</p> : null}
      </div>
      {children}
    </section>
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

function estimateGrossAmount(preset: CashFlowPreset | undefined, position: PositionView | undefined): string | undefined {
  if (!preset?.amountPerShare || !position) return undefined
  const amountPerShare = Number(preset.amountPerShare)
  const quantity = Number(position.performance.open_quantity)
  if (!Number.isFinite(amountPerShare) || !Number.isFinite(quantity)) return undefined
  return decimalInputValue(amountPerShare * quantity)
}

function decimalInputValue(value: number): string {
  if (!Number.isFinite(value)) return ""
  return value.toFixed(8).replace(/\.?0+$/, "")
}
