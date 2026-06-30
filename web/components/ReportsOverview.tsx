"use client"

import { useState } from "react"
import { fmtCurrency, fmtPct, num } from "@/lib/format"
import type { AllocationReport, AllocationSlice, PortfolioReportSummary, ReportHolding } from "@/lib/types"

type Breakdown = "asset" | "portfolio" | "currency" | "instrument"

const COLORS = ["#6487ff", "#a278ff", "#e6b43d", "#35b88f", "#ef6b6b", "#4bb3d3", "#b184d7"]

interface Props {
  summary: PortfolioReportSummary
  holdings: ReportHolding[]
  allocation: AllocationReport
  locale: string
}

export function ReportsOverview({ summary, holdings, allocation, locale }: Props) {
  const currency = summary.reporting_currency
  const totalPnl = num(summary.total_pnl) ?? 0
  const daily = num(summary.daily_change_amount) ?? 0

  return (
    <div className="space-y-4">
      <section className="app-panel grid overflow-hidden rounded-xl sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Current value" value={money(summary.current_value, locale, currency)} sub={`${summary.counts.open} open holdings`} />
        <Metric label="Total P&L" value={signedMoney(summary.total_pnl, locale, currency)} sub={summary.total_return_pct ? `${fmtPct(num(summary.total_return_pct) ?? 0)} total return` : "Return unavailable"} tone={tone(totalPnl)} />
        <Metric label="Today" value={signedMoney(summary.daily_change_amount, locale, currency)} sub={summary.daily_change_pct ? fmtPct(num(summary.daily_change_pct) ?? 0) : "Daily percentage unavailable"} tone={tone(daily)} />
        <Metric label="Income received" value={money(summary.income_net, locale, currency)} sub={`${money(summary.income_gross, locale, currency)} gross income`} />
      </section>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-4">
          <SummaryDetails summary={summary} locale={locale} />
          <HoldingsReport holdings={holdings} locale={locale} currency={currency} />
        </div>
        <aside className="space-y-4">
          <AllocationBreakdown report={allocation} locale={locale} />
          <Intelligence report={allocation} summary={summary} locale={locale} />
        </aside>
      </div>
    </div>
  )
}

function Metric({ label, value, sub, tone: metricTone }: { label: string; value: string; sub: string; tone?: "positive" | "negative" }) {
  const color = metricTone === "positive" ? "text-[var(--app-positive)]" : metricTone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return <div className="border-b border-[var(--app-border)] px-4 py-4 last:border-b-0 xl:border-b-0 xl:border-l xl:first:border-l-0"><p className="text-[10px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${color}`}>{value}</p><p className="mt-1 text-[10px] text-[var(--app-text-muted)]">{sub}</p></div>
}

function SummaryDetails({ summary, locale }: { summary: PortfolioReportSummary; locale: string }) {
  const currency = summary.reporting_currency
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <ReportHeader title="Performance and income" detail={`${summary.completeness} snapshot · ${new Date(summary.snapshot_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}`} />
      <div className="grid sm:grid-cols-2 lg:grid-cols-3">
        <Detail label="Invested capital" value={money(summary.invested_capital, locale, currency)} />
        <Detail label="Unrealized P&L" value={signedMoney(summary.unrealized_pnl, locale, currency)} valueTone={tone(num(summary.unrealized_pnl) ?? 0)} />
        <Detail label="Realized P&L" value={signedMoney(summary.realized_pnl, locale, currency)} valueTone={tone(num(summary.realized_pnl) ?? 0)} />
        <Detail label="Dividends" value={money(summary.dividends_net, locale, currency)} />
        <Detail label="Cash in lieu" value={money(summary.cash_in_lieu_net, locale, currency)} />
        <Detail label="Interest" value={money(summary.interest_net, locale, currency)} />
        <Detail label="Income tax" value={money(summary.income_tax, locale, currency)} />
        <Detail label="Fees" value={money(summary.fees, locale, currency)} />
        <Detail label="Open-position return" value={summary.simple_return_pct ? fmtPct(num(summary.simple_return_pct) ?? 0) : "—"} valueTone={summary.simple_return_pct ? tone(num(summary.simple_return_pct) ?? 0) : undefined} />
      </div>
    </section>
  )
}

function Detail({ label, value, valueTone }: { label: string; value: string; valueTone?: "positive" | "negative" }) {
  const color = valueTone === "positive" ? "text-[var(--app-positive)]" : valueTone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return <div className="border-b border-r border-[var(--app-border)] px-4 py-3"><p className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</p><p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{value}</p></div>
}

function HoldingsReport({ holdings, locale, currency }: { holdings: ReportHolding[]; locale: string; currency: string }) {
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <ReportHeader title="Consolidated holdings" detail={`${holdings.length} instruments across selected portfolios`} />
      <div className="overflow-x-auto">
        <table className="min-w-[900px] w-full text-[11px]">
          <thead><tr className="border-b border-[var(--app-border)] text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]"><th className="px-4 py-2 text-left font-semibold">Instrument</th><th className="px-3 py-2 text-left font-semibold">Portfolios</th><th className="px-3 py-2 text-right font-semibold">Value</th><th className="px-3 py-2 text-right font-semibold">Weight</th><th className="px-3 py-2 text-right font-semibold">Unrealized</th><th className="px-3 py-2 text-right font-semibold">Realized</th><th className="px-4 py-2 text-right font-semibold">Dividends</th></tr></thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {holdings.map((holding) => <HoldingRow key={holding.instrument_id} holding={holding} locale={locale} currency={currency} />)}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function HoldingRow({ holding, locale, currency }: { holding: ReportHolding; locale: string; currency: string }) {
  const unrealized = num(holding.unrealized_pnl) ?? 0
  return (
    <tr className="transition hover:bg-[var(--app-surface-hover)]">
      <td className="px-4 py-3"><p className="font-semibold text-[var(--app-text)]">{holding.name}</p><p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">{holding.symbol} · {holding.asset_type}</p></td>
      <td className="px-3 py-3"><div className="flex flex-wrap gap-1">{holding.portfolios.map((portfolio) => <span key={portfolio.id} className="rounded border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-1.5 py-0.5 text-[9px] text-[var(--app-text-muted)]">{portfolio.name}</span>)}</div></td>
      <td className="px-3 py-3 text-right font-semibold tabular-nums text-[var(--app-text)]">{money(holding.market_value, locale, currency)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-[var(--app-text-muted)]">{holding.weight_pct ? `${holding.weight_pct}%` : "—"}</td>
      <td className={`px-3 py-3 text-right font-medium tabular-nums ${unrealized >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{signedMoney(holding.unrealized_pnl, locale, currency)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-[var(--app-text-muted)]">{signedMoney(holding.realized_pnl, locale, currency)}</td>
      <td className="px-4 py-3 text-right tabular-nums text-[var(--app-text-muted)]">{money(holding.dividends, locale, currency)}</td>
    </tr>
  )
}

function AllocationBreakdown({ report, locale }: { report: AllocationReport; locale: string }) {
  const [breakdown, setBreakdown] = useState<Breakdown>("asset")
  const rows = breakdown === "asset" ? report.by_asset_type : breakdown === "portfolio" ? report.by_portfolio : breakdown === "currency" ? report.by_currency : report.by_instrument
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <ReportHeader title="Allocation" detail={money(report.total_value, locale, report.reporting_currency)} />
      <div className="flex gap-1 border-b border-[var(--app-border)] p-2">
        {(["asset", "portfolio", "currency", "instrument"] as const).map((item) => <button key={item} onClick={() => setBreakdown(item)} className={`rounded-md px-2 py-1 text-[9px] font-semibold capitalize ${breakdown === item ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "text-[var(--app-text-faint)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}`}>{item}</button>)}
      </div>
      <AllocationRows rows={rows} locale={locale} currency={report.reporting_currency} />
    </section>
  )
}

function AllocationRows({ rows, locale, currency }: { rows: AllocationSlice[]; locale: string; currency: string }) {
  return <div className="space-y-3 p-4">{rows.slice(0, 10).map((row, index) => <div key={row.key}><div className="mb-1 flex items-center justify-between gap-3 text-[10px]"><span className="truncate font-medium text-[var(--app-text-muted)]">{row.label}</span><span className="shrink-0 tabular-nums text-[var(--app-text)]">{row.weight_pct}% · {money(row.value, locale, currency)}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-[var(--app-border)]"><div className="h-full rounded-full" style={{ width: `${Math.min(100, num(row.weight_pct) ?? 0)}%`, background: COLORS[index % COLORS.length] }} /></div></div>)}</div>
}

function Intelligence({ report, summary, locale }: { report: AllocationReport; summary: PortfolioReportSummary; locale: string }) {
  const concentration = report.intelligence.largest_concentration
  const mover = report.intelligence.top_mover
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <ReportHeader title="Reporting intelligence" detail={summary.completeness === "complete" ? "Complete data" : "Partial data"} />
      <div className="divide-y divide-[var(--app-border)]">
        <Insight label="Largest holding" value={concentration ? `${concentration.symbol} · ${concentration.weight_pct}%` : "Unavailable"} warning={concentration?.exceeds_threshold} />
        <Insight label="Concentration threshold" value={`${report.intelligence.concentration_threshold_pct}%`} />
        <Insight label="Top mover today" value={mover ? `${mover.symbol} · ${signedMoney(mover.daily_change_amount, locale, report.reporting_currency)}` : "Unavailable"} />
        <Insight label="Data quality" value={`${summary.counts.stale} stale · ${summary.counts.unavailable} unavailable · ${summary.counts.invalid} invalid`} warning={summary.completeness === "partial"} />
      </div>
    </section>
  )
}

function Insight({ label, value, warning }: { label: string; value: string; warning?: boolean }) {
  return <div className="flex items-start justify-between gap-4 px-4 py-3"><span className="text-[10px] text-[var(--app-text-muted)]">{label}</span><span className={`text-right text-[10px] font-semibold tabular-nums ${warning ? "text-[var(--app-warning)]" : "text-[var(--app-text)]"}`}>{value}</span></div>
}

function ReportHeader({ title, detail }: { title: string; detail: string }) {
  return <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--app-text)]">{title}</h2><span className="text-[9px] text-[var(--app-text-faint)]">{detail}</span></div>
}

function money(value: string, locale: string, currency: string): string {
  return fmtCurrency(locale, num(value) ?? 0, currency)
}

function signedMoney(value: string, locale: string, currency: string): string {
  const amount = num(value) ?? 0
  return `${amount >= 0 ? "+" : ""}${fmtCurrency(locale, amount, currency)}`
}

function tone(value: number): "positive" | "negative" {
  return value >= 0 ? "positive" : "negative"
}
