"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { deleteCashFlowAction } from "@/app/activity/actions"
import { fmtCurrency, num } from "@/lib/format"
import type { ActivityPage, BookingChange, CashFlow, Portfolio, PositionView } from "@/lib/types"
import { ActivityFeed } from "./ActivityFeed"
import { CashFlowModal } from "./CashFlowModal"
import { TaxEventModal } from "./TaxEventModal"

interface Props {
  tab: "feed" | "cash" | "changes"
  summary: ActivityPage
  feed: ActivityPage
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
  const portfolioNames = new Map(props.portfolios.map((portfolio) => [portfolio.id, portfolio.name]))
  const positionNames = new Map(props.positions.map((position) => [position.id, position.listing?.name ?? position.listing?.symbol ?? position.id]))
  const positionAssetTypes = new Map(props.positions.map((position) => [position.id, position.listing?.asset_type ?? "equity"]))

  return (
    <div className="space-y-4">
      <ActivitySummary page={props.summary} locale={props.locale} />
      <section className="app-panel overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--app-border)] px-4 py-3">
          <div className="flex items-center gap-5">
            <Tab href={query({ tab: "feed", portfolio: props.selectedPortfolio })} active={props.tab === "feed"}>Feed</Tab>
            <Tab href={query({ tab: "cash", portfolio: props.selectedPortfolio })} active={props.tab === "cash"}>Cash flows</Tab>
            <Tab href={query({ tab: "changes", portfolio: props.selectedPortfolio })} active={props.tab === "changes"}>Change history</Tab>
          </div>
          {props.tab === "cash"
            ? <CashFlowModal portfolios={props.portfolios} positions={props.positions} />
            : <span className="text-[10px] text-[var(--app-text-faint)]">{props.tab === "changes" ? "Latest 200 changes · not paginated" : "Trades, cash flows & tax events"}</span>}
        </div>
        <div className="border-b border-[var(--app-border)] bg-[var(--app-surface-raised)] px-4 py-2.5">
          <Filters {...props} />
        </div>
        {props.tab === "feed"
          ? <ActivityFeed embedded initial={props.feed} type={props.selectedType} portfolioId={props.selectedPortfolio} portfolioNames={portfolioNames} positionNames={positionNames} positionAssetTypes={positionAssetTypes} locale={props.locale} />
          : props.tab === "cash"
            ? <CashFlowTable flows={props.cashFlows} portfolios={props.portfolios} positions={props.positions} locale={props.locale} portfolioNames={portfolioNames} positionNames={positionNames} />
            : <ChangeList changes={props.changes} locale={props.locale} portfolioNames={portfolioNames} positionNames={positionNames} />}
      </section>
    </div>
  )
}

function ActivitySummary({ page, locale }: { page: ActivityPage; locale: string }) {
  const counts = page.items.reduce<Record<string, number>>((acc, item) => {
    acc[item.kind] = (acc[item.kind] ?? 0) + 1
    return acc
  }, {})
  const latest = page.items[0]?.occurred_at
  return (
    <section className="app-panel grid overflow-hidden rounded-xl sm:grid-cols-2 xl:grid-cols-4">
      <SummaryMetric label="Recent entries" value={String(page.items.length)} detail={page.next_cursor ? "More entries available" : "Current result window"} />
      <SummaryMetric label="Trades" value={String(counts.trade ?? 0)} detail="Buys and sells" tone="accent" />
      <SummaryMetric label="Cash & tax" value={String((counts.cash_flow ?? 0) + (counts.tax_event ?? 0))} detail={`${counts.cash_flow ?? 0} cash · ${counts.tax_event ?? 0} tax`} tone="positive" />
      <SummaryMetric label="Latest activity" value={latest ? new Date(latest).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" }) : "None"} detail={latest ? new Date(latest).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" }) : "No entries recorded"} />
    </section>
  )
}

function SummaryMetric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone?: "accent" | "positive" }) {
  const color = tone === "accent" ? "text-[var(--app-accent)]" : tone === "positive" ? "text-[var(--app-positive)]" : "text-[var(--app-text)]"
  return <div className="border-b border-[var(--app-border)] px-4 py-4 last:border-b-0 xl:border-b-0 xl:border-l xl:first:border-l-0"><p className="text-[10px] text-[var(--app-text-muted)]">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p><p className="mt-1 text-[9px] text-[var(--app-text-faint)]">{detail}</p></div>
}

const TYPE_VALUES: Record<Props["tab"], string[]> = {
  feed: ["trade", "cash_flow", "tax_event"],
  cash: ["dividend", "deposit", "withdrawal", "cash_in_lieu"],
  changes: ["transaction", "cash_flow", "tax_event"],
}

function Filters(props: Props) {
  const withPortfolio = (portfolio?: string) => props.tab === "changes"
    ? query({ tab: "changes", entity: props.selectedEntity, portfolio })
    : query({ tab: props.tab, type: props.selectedType, portfolio })

  return <div className="flex flex-wrap gap-1">
    <Pill href={withPortfolio(undefined)} active={!props.selectedPortfolio}>All portfolios</Pill>
    {props.portfolios.map((portfolio) => <Pill key={portfolio.id} href={withPortfolio(portfolio.id)} active={props.selectedPortfolio === portfolio.id}>{portfolio.name}</Pill>)}
    <span className="mx-1 border-l border-[var(--app-border)]" />
    {TYPE_VALUES[props.tab].map((value) => {
      const active = props.tab === "changes" ? props.selectedEntity === value : props.selectedType === value
      const href = props.tab === "changes"
        ? query({ tab: "changes", portfolio: props.selectedPortfolio, entity: active ? undefined : value })
        : query({ tab: props.tab, portfolio: props.selectedPortfolio, type: active ? undefined : value })
      return <Pill key={value} href={href} active={active}>{value.replaceAll("_", " ")}</Pill>
    })}
  </div>
}

function CashFlowTable({ flows, portfolios, positions, locale, portfolioNames, positionNames }: { flows: CashFlow[]; portfolios: Portfolio[]; positions: PositionView[]; locale: string; portfolioNames: Map<string, string>; positionNames: Map<string, string> }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  async function remove(flow: CashFlow) {
    if (!confirm("Delete this cash flow?")) return
    setBusy(flow.id)
    await deleteCashFlowAction(flow.portfolio_id, flow.id)
    setBusy(null)
    router.refresh()
  }
  if (!flows.length) return <Empty text="No cash flows match the selected filters." />
  return <div className="overflow-x-auto"><table className="w-full min-w-[1120px] text-[11px]"><thead><tr className="border-b border-[var(--app-border)] text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{["Date", "Type", "Portfolio", "Asset", "Gross", "Withholding", "Fee", "Net", "Note", ""].map((heading) => <th key={heading} className={`px-3 py-2 font-semibold ${["Gross", "Withholding", "Fee", "Net"].includes(heading) ? "text-right" : "text-left"}`}>{heading}</th>)}</tr></thead><tbody className="divide-y divide-[var(--app-border)]">{flows.map((flow) => <tr key={flow.id} className="hover:bg-[var(--app-surface-hover)]"><td className="px-3 py-2.5 tabular-nums text-[var(--app-text-muted)]">{flow.payment_date}</td><td className="px-3 py-2.5 capitalize text-[var(--app-text)]">{flow.type.replaceAll("_", " ")}</td><td className="px-3 py-2.5 text-[var(--app-text-muted)]">{portfolioNames.get(flow.portfolio_id)}</td><td className="px-3 py-2.5 text-[var(--app-text-muted)]">{flow.position_id ? positionNames.get(flow.position_id) : ""}</td><MoneyCell value={flow.gross_amount} currency={flow.currency} locale={locale} signed /><MoneyCell value={flow.withholding_tax} currency={flow.currency} locale={locale} /><MoneyCell value={flow.fee} currency={flow.currency} locale={locale} /><MoneyCell value={flow.net_amount} currency={flow.currency} locale={locale} signed /><td className="max-w-56 truncate px-3 py-2.5 text-[var(--app-text-muted)]">{flow.note}</td><td className="px-3 py-2.5"><div className="flex gap-1"><CashFlowModal portfolios={portfolios} positions={positions} flow={flow} /><TaxEventModal currency={flow.currency} portfolioId={flow.portfolio_id} positionId={flow.position_id} cashFlowId={flow.id} /><button disabled={busy === flow.id} onClick={() => remove(flow)} className="rounded-md px-2 py-1 text-[10px] text-[var(--app-negative)] disabled:opacity-50">Delete</button></div></td></tr>)}</tbody></table></div>
}

function ChangeList({ changes, locale, portfolioNames, positionNames }: { changes: BookingChange[]; locale: string; portfolioNames: Map<string, string>; positionNames: Map<string, string> }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!changes.length) return <Empty text="No changes match the selected filters." />
  return <ul className="divide-y divide-[var(--app-border)]">{changes.map((change) => <li key={change.id}><button onClick={() => setOpen(open === change.id ? null : change.id)} className="grid w-full grid-cols-[110px_110px_1fr_auto] items-center gap-3 px-4 py-3 text-left text-[11px] hover:bg-[var(--app-surface-hover)]"><span className={`font-semibold uppercase ${change.action === "deleted" ? "text-[var(--app-negative)]" : change.action === "created" ? "text-[var(--app-positive)]" : "text-[var(--app-warning)]"}`}>{change.action}</span><span className="text-[var(--app-text-muted)]">{change.entity_type.replaceAll("_", " ")}</span><span className="truncate text-[var(--app-text)]">{change.position_id ? positionNames.get(change.position_id) : change.portfolio_id ? portfolioNames.get(change.portfolio_id) : "Unscoped"} <span className="ml-2 text-[var(--app-text-faint)]">· {change.source}{change.reason ? ` · ${change.reason}` : ""}</span></span><span className="tabular-nums text-[var(--app-text-faint)]">{new Date(change.changed_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</span></button>{open === change.id ? <Diff before={change.before} after={change.after} /> : null}</li>)}</ul>
}

function Diff({ before, after }: { before: unknown; after: unknown }) {
  const beforeObject = object(before)
  const afterObject = object(after)
  const keys = [...new Set([...Object.keys(beforeObject), ...Object.keys(afterObject)])]
  return <div className="border-t border-[var(--app-border)] bg-[var(--app-surface-raised)] px-4 py-3"><div className="grid gap-2 sm:grid-cols-2">{keys.map((key) => <div key={key} className="rounded-lg border border-[var(--app-border)] p-2"><p className="text-[9px] uppercase text-[var(--app-text-faint)]">{key.replaceAll("_", " ")}</p><p className="mt-1 break-all text-[10px] text-[var(--app-text-muted)]">{show(beforeObject[key])} <span className="mx-1 text-[var(--app-text-faint)]">→</span> <span className="text-[var(--app-text)]">{show(afterObject[key])}</span></p></div>)}</div><details className="mt-3"><summary className="cursor-pointer text-[10px] text-[var(--app-text-faint)]">Raw JSON</summary><pre className="mt-2 overflow-x-auto text-[10px] text-[var(--app-text-muted)]">{JSON.stringify({ before, after }, null, 2)}</pre></details></div>
}

function object(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {} }
function show(value: unknown) { return value === undefined || value === null ? "empty" : typeof value === "object" ? JSON.stringify(value) : String(value) }
function MoneyCell({ value, currency, locale, signed }: { value: string; currency: string; locale: string; signed?: boolean }) { const amount = num(value) ?? 0; return <td className={`px-3 py-2.5 text-right tabular-nums ${signed && amount !== 0 ? amount > 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"}`}>{fmtCurrency(locale, amount, currency)}</td> }
function Empty({ text }: { text: string }) { return <div className="px-5 py-16 text-center text-sm text-[var(--app-text-muted)]">{text}</div> }
function Tab({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) { return <Link href={href} className={`relative py-1 text-xs font-medium transition ${active ? "text-[var(--app-text)]" : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"}`}>{children}{active ? <span className="absolute inset-x-0 -bottom-3.5 h-0.5 bg-[var(--app-accent)]" /> : null}</Link> }
function Pill({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) { return <Link href={href} className={`rounded-md border px-2 py-1 text-[9px] capitalize ${active ? "border-[var(--app-accent)] text-[var(--app-accent)]" : "border-[var(--app-border)] text-[var(--app-text-muted)]"}`}>{children}</Link> }
function query(values: Record<string, string | undefined>) { const params = new URLSearchParams(); for (const [key, value] of Object.entries(values)) if (value) params.set(key, value); return `/activity${params.size ? `?${params}` : ""}` }
