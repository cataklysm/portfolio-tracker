"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { deleteCashFlowAction } from "@/app/activity/actions"
import { fmtCurrency, num } from "@/lib/format"
import type { BookingChange, CashFlow, Portfolio, PositionView } from "@/lib/types"
import { CashFlowModal } from "./CashFlowModal"
import { TaxEventModal } from "./TaxEventModal"

interface Props {
  tab: "cash" | "changes"
  cashFlows: CashFlow[]
  changes: BookingChange[]
  portfolios: Portfolio[]
  positions: PositionView[]
  selectedPortfolio?: string
  selectedType?: string
  selectedEntity?: string
  locale: string
}

export function ActivityWorkspace(props: Props) {
  const portfolioNames = new Map(props.portfolios.map((p) => [p.id, p.name]))
  const positionNames = new Map(props.positions.map((p) => [p.id, p.listing?.name ?? p.listing?.symbol ?? p.id]))
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex gap-1 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] p-1">
        <Tab href={query({ tab: "cash", portfolio: props.selectedPortfolio })} active={props.tab === "cash"}>Cash flows</Tab>
        <Tab href={query({ tab: "changes", portfolio: props.selectedPortfolio })} active={props.tab === "changes"}>Change history</Tab>
      </div>
      {props.tab === "cash" ? <CashFlowModal portfolios={props.portfolios} positions={props.positions} /> : <span className="text-[10px] text-[var(--app-text-faint)]">Latest 200 changes · not paginated</span>}
    </div>
    <Filters {...props} />
    {props.tab === "cash"
      ? <CashFlowTable flows={props.cashFlows} portfolios={props.portfolios} positions={props.positions} locale={props.locale} portfolioNames={portfolioNames} positionNames={positionNames} />
      : <ChangeList changes={props.changes} locale={props.locale} portfolioNames={portfolioNames} positionNames={positionNames} />}
  </div>
}

function Filters(props: Props) {
  const base = props.tab === "cash" ? { tab: "cash", type: props.selectedType } : { tab: "changes", entity: props.selectedEntity }
  return <div className="flex flex-wrap gap-1">
    <Pill href={query(base)} active={!props.selectedPortfolio}>All portfolios</Pill>
    {props.portfolios.map((p) => <Pill key={p.id} href={query({ ...base, portfolio: p.id })} active={props.selectedPortfolio === p.id}>{p.name}</Pill>)}
    <span className="mx-1 border-l border-[var(--app-border)]" />
    {(props.tab === "cash" ? ["dividend", "deposit", "withdrawal", "cash_in_lieu"] : ["transaction", "cash_flow", "tax_event"]).map((value) => {
      const active = props.tab === "cash" ? props.selectedType === value : props.selectedEntity === value
      const href = props.tab === "cash" ? query({ tab: "cash", portfolio: props.selectedPortfolio, type: active ? undefined : value }) : query({ tab: "changes", portfolio: props.selectedPortfolio, entity: active ? undefined : value })
      return <Pill key={value} href={href} active={active}>{value.replaceAll("_", " ")}</Pill>
    })}
  </div>
}

function CashFlowTable({ flows, portfolios, positions, locale, portfolioNames, positionNames }: { flows: CashFlow[]; portfolios: Portfolio[]; positions: PositionView[]; locale: string; portfolioNames: Map<string, string>; positionNames: Map<string, string> }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  async function remove(flow: CashFlow) { if (!confirm("Delete this cash flow?")) return; setBusy(flow.id); await deleteCashFlowAction(flow.portfolio_id, flow.id); setBusy(null); router.refresh() }
  if (!flows.length) return <Empty text="No cash flows match the selected filters." />
  return <section className="app-panel overflow-hidden rounded-xl"><div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-[11px]"><thead><tr className="border-b border-[var(--app-border)] text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{["Date","Type","Portfolio","Asset","Gross","Withholding","Fee","Net","Note",""].map((h) => <th key={h} className={`px-3 py-2 font-semibold ${["Gross","Withholding","Fee","Net"].includes(h) ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
    <tbody className="divide-y divide-[var(--app-border)]">{flows.map((flow) => <tr key={flow.id} className="hover:bg-[var(--app-surface-hover)]"><td className="px-3 py-2.5 tabular-nums text-[var(--app-text-muted)]">{flow.payment_date}</td><td className="px-3 py-2.5 capitalize text-[var(--app-text)]">{flow.type.replaceAll("_"," ")}</td><td className="px-3 py-2.5 text-[var(--app-text-muted)]">{portfolioNames.get(flow.portfolio_id)}</td><td className="px-3 py-2.5 text-[var(--app-text-muted)]">{flow.position_id ? positionNames.get(flow.position_id) : ""}</td><MoneyCell value={flow.gross_amount} currency={flow.currency} locale={locale} signed /><MoneyCell value={flow.withholding_tax} currency={flow.currency} locale={locale} /><MoneyCell value={flow.fee} currency={flow.currency} locale={locale} /><MoneyCell value={flow.net_amount} currency={flow.currency} locale={locale} signed /><td className="max-w-56 truncate px-3 py-2.5 text-[var(--app-text-muted)]">{flow.note}</td><td className="px-3 py-2.5"><div className="flex gap-1"><CashFlowModal portfolios={portfolios} positions={positions} flow={flow} /><TaxEventModal currency={flow.currency} portfolioId={flow.portfolio_id} positionId={flow.position_id} cashFlowId={flow.id} /><button disabled={busy === flow.id} onClick={() => remove(flow)} className="rounded-md px-2 py-1 text-[10px] text-[var(--app-negative)] disabled:opacity-50">Delete</button></div></td></tr>)}</tbody>
  </table></div></section>
}

function ChangeList({ changes, locale, portfolioNames, positionNames }: { changes: BookingChange[]; locale: string; portfolioNames: Map<string, string>; positionNames: Map<string, string> }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!changes.length) return <Empty text="No changes match the selected filters." />
  return <section className="app-panel overflow-hidden rounded-xl"><ul className="divide-y divide-[var(--app-border)]">{changes.map((change) => <li key={change.id}><button onClick={() => setOpen(open === change.id ? null : change.id)} className="grid w-full grid-cols-[110px_110px_1fr_auto] items-center gap-3 px-4 py-3 text-left text-[11px] hover:bg-[var(--app-surface-hover)]"><span className={`font-semibold uppercase ${change.action === "deleted" ? "text-[var(--app-negative)]" : change.action === "created" ? "text-[var(--app-positive)]" : "text-[var(--app-warning)]"}`}>{change.action}</span><span className="text-[var(--app-text-muted)]">{change.entity_type.replaceAll("_"," ")}</span><span className="truncate text-[var(--app-text)]">{change.position_id ? positionNames.get(change.position_id) : change.portfolio_id ? portfolioNames.get(change.portfolio_id) : "Unscoped"} <span className="ml-2 text-[var(--app-text-faint)]">· {change.source}{change.reason ? ` · ${change.reason}` : ""}</span></span><span className="tabular-nums text-[var(--app-text-faint)]">{new Date(change.changed_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</span></button>{open === change.id ? <Diff before={change.before} after={change.after} /> : null}</li>)}</ul></section>
}

function Diff({ before, after }: { before: unknown; after: unknown }) {
  const b = object(before), a = object(after), keys = [...new Set([...Object.keys(b), ...Object.keys(a)])]
  return <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-raised)] px-4 py-3"><div className="grid gap-2 sm:grid-cols-2">{keys.map((key) => <div key={key} className="rounded-lg border border-[var(--app-border)] p-2"><p className="text-[9px] uppercase text-[var(--app-text-faint)]">{key.replaceAll("_"," ")}</p><p className="mt-1 break-all text-[10px] text-[var(--app-text-muted)]">{show(b[key])} <span className="mx-1 text-[var(--app-text-faint)]">→</span> <span className="text-[var(--app-text)]">{show(a[key])}</span></p></div>)}</div><details className="mt-3"><summary className="cursor-pointer text-[10px] text-[var(--app-text-faint)]">Raw JSON</summary><pre className="mt-2 overflow-x-auto text-[10px] text-[var(--app-text-muted)]">{JSON.stringify({ before, after }, null, 2)}</pre></details></div>
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function show(value: unknown) { return value === undefined || value === null ? "empty" : typeof value === "object" ? JSON.stringify(value) : String(value) }
function MoneyCell({ value, currency, locale, signed }: { value: string; currency: string; locale: string; signed?: boolean }) { const n = num(value) ?? 0; return <td className={`px-3 py-2.5 text-right tabular-nums ${signed && n !== 0 ? n > 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"}`}>{fmtCurrency(locale, n, currency)}</td> }
function Empty({ text }: { text: string }) { return <section className="app-panel rounded-xl px-5 py-16 text-center text-sm text-[var(--app-text-muted)]">{text}</section> }
function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) { return <Link href={href} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${active ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "text-[var(--app-text-muted)]"}`}>{children}</Link> }
function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) { return <Link href={href} className={`rounded-md border px-2 py-1 text-[9px] capitalize ${active ? "border-[var(--app-accent)] text-[var(--app-accent)]" : "border-[var(--app-border)] text-[var(--app-text-muted)]"}`}>{children}</Link> }
function query(values: Record<string, string | undefined>) { const params = new URLSearchParams(); for (const [k,v] of Object.entries(values)) if (v) params.set(k,v); return `/activity${params.size ? `?${params}` : ""}` }
