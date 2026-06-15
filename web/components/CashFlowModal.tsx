"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { createCashFlowAction, updateCashFlowAction } from "@/app/activity/actions"
import type { CashFlow, Portfolio, PositionView } from "@/lib/types"

const input = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-2 text-xs text-[var(--app-text)] outline-none focus:ring-1 focus:ring-[var(--app-accent)]"

export function CashFlowModal({ portfolios, positions, flow }: { portfolios: Portfolio[]; positions: PositionView[]; flow?: CashFlow }) {
  const [open, setOpen] = useState(false)
  const [portfolioId, setPortfolioId] = useState(flow?.portfolio_id ?? portfolios[0]?.id ?? "")
  const [type, setType] = useState(flow?.type ?? "dividend")
  const action = flow ? updateCashFlowAction.bind(null, flow.portfolio_id, flow.id) : createCashFlowAction.bind(null, portfolioId)
  const [error, formAction, pending] = useActionState(action, null)
  const previous = useRef(false)
  useEffect(() => {
    if (previous.current && !pending && !error) setOpen(false)
    previous.current = pending
  }, [pending, error])
  const linked = type === "dividend" || type === "cash_in_lieu"
  const availablePositions = positions.filter((position) => position.portfolio_id === portfolioId)
  const today = new Date().toISOString().slice(0, 10)

  return <>
    <button type="button" onClick={() => setOpen(true)} className="rounded-md border border-[var(--app-border)] px-2.5 py-1 text-[10px] font-medium text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">{flow ? "Edit" : "+ Add cash flow"}</button>
    {open ? <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div className="app-panel max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between"><h3 className="text-sm font-semibold text-[var(--app-text)]">{flow ? "Edit cash flow" : "Add cash flow"}</h3><button onClick={() => setOpen(false)} className="text-[var(--app-text-faint)]">×</button></div>
        <form action={formAction} className="space-y-3">
          {error ? <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p> : null}
          <div className="grid gap-3 sm:grid-cols-2">
            {!flow ? <Field label="Portfolio"><select value={portfolioId} onChange={(e) => setPortfolioId(e.target.value)} className={input}>{portfolios.map((p) => <option value={p.id} key={p.id}>{p.name}</option>)}</select></Field> : null}
            {!flow ? <Field label="Type"><select name="type" value={type} onChange={(e) => setType(e.target.value as CashFlow["type"])} className={input}><option value="dividend">Dividend</option><option value="deposit">Deposit</option><option value="withdrawal">Withdrawal</option><option value="cash_in_lieu">Cash in lieu</option></select></Field> : null}
            {linked && !flow ? <Field label="Asset"><select name="position_id" required className={input} defaultValue=""><option value="" disabled>Select asset</option>{availablePositions.map((p) => <option value={p.id} key={p.id}>{p.listing?.name ?? p.id}</option>)}</select></Field> : null}
            <Field label="Gross amount"><input name="gross_amount" type="number" step="any" required defaultValue={flow?.gross_amount} className={input} /></Field>
            <Field label="Withholding tax"><input name="withholding_tax" type="number" step="any" min="0" defaultValue={flow?.withholding_tax ?? "0"} className={input} /></Field>
            <Field label="Fee"><input name="fee" type="number" step="any" min="0" defaultValue={flow?.fee ?? "0"} className={input} /></Field>
            <Field label="Currency"><input name="currency" maxLength={3} required defaultValue={flow?.currency ?? "EUR"} className={`${input} uppercase`} /></Field>
            <Field label="Payment date"><input name="payment_date" type="date" required defaultValue={flow?.payment_date ?? today} className={input} /></Field>
            <Field label="Tax-relevant date"><input name="tax_relevant_value_date" type="date" defaultValue={flow?.tax_relevant_value_date ?? today} className={input} /></Field>
            <Field label="Note"><input name="note" maxLength={280} defaultValue={flow?.note ?? ""} className={input} /></Field>
          </div>
          <p className="text-[10px] text-[var(--app-text-faint)]">Net amount is calculated by the backend from gross amount, withholding tax, and fee.</p>
          <div className="flex justify-end gap-2"><button type="button" onClick={() => setOpen(false)} className="rounded-md border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)]">Cancel</button><button disabled={pending || !portfolioId} className="rounded-md bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">{pending ? "Saving…" : "Save cash flow"}</button></div>
        </form>
      </div>
    </div> : null}
  </>
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label><span className="mb-1 block text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</span>{children}</label>
}
