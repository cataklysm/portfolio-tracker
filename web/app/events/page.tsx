import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { fetchPortfolioEvents } from "@/lib/portfolio-events"
import type { PositionView } from "@/lib/types"
import { fmtCurrency, num } from "@/lib/format"
import { getLocale } from "@/lib/locale"

export default async function EventsPage() {
  const [positionsResponse, locale] = await Promise.all([apiFetch("/positions", { cache: "no-store" }), getLocale()])
  const positions = positionsResponse.ok ? ((await positionsResponse.json()) as PositionView[]) : []
  const { earnings, corporateActions } = await fetchPortfolioEvents(positions)
  const upcomingEarnings = earnings.filter((item) => item.is_upcoming && item.report_date).sort((a, b) => a.report_date!.localeCompare(b.report_date!))
  const earningsHistory = earnings.filter((item) => !item.is_upcoming).sort((a, b) => (b.report_date ?? b.period_end_date ?? "").localeCompare(a.report_date ?? a.period_end_date ?? "")).slice(0, 20)
  const actions = corporateActions.sort((a, b) => b.ex_date.localeCompare(a.ex_date))

  return (
    <div className="mx-auto max-w-[1200px] space-y-3 px-4 py-5 lg:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">Events</h1>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">Earnings and corporate actions relevant to your holdings.</p>
      </header>

      <section className="app-panel overflow-hidden rounded-xl">
        <SectionHeader title="Upcoming earnings" count={upcomingEarnings.length} />
        {upcomingEarnings.length > 0 ? <div className="divide-y divide-[var(--app-border)]">{upcomingEarnings.map((item) => <EarningsRow key={`${item.instrument_id}-${item.report_date}`} item={item} locale={locale} />)}</div> : <Empty text="No upcoming earnings dates are currently available." />}
      </section>

      <div className="grid items-start gap-3 lg:grid-cols-2">
        <section className="app-panel overflow-hidden rounded-xl">
          <SectionHeader title="Recent earnings" count={earningsHistory.length} />
          {earningsHistory.length > 0 ? <div className="divide-y divide-[var(--app-border)]">{earningsHistory.map((item) => <EarningsRow key={`${item.instrument_id}-${item.fiscal_year}-${item.fiscal_quarter}`} item={item} locale={locale} />)}</div> : <Empty text="No earnings history is currently available." />}
        </section>
        <section className="app-panel overflow-hidden rounded-xl">
          <SectionHeader title="Corporate actions" count={actions.length} />
          {actions.length > 0 ? <div className="divide-y divide-[var(--app-border)]">{actions.slice(0, 30).map((item) => <ActionRow key={item.stable_action_id} item={item} locale={locale} />)}</div> : <Empty text="No corporate actions are currently available." />}
        </section>
      </div>
    </div>
  )
}

function SectionHeader({ title, count }: { title: string; count: number }) {
  return <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--app-text)]">{title}</h2><span className="text-[10px] tabular-nums text-[var(--app-text-faint)]">{count}</span></div>
}

function Empty({ text }: { text: string }) {
  return <p className="px-4 py-8 text-center text-xs text-[var(--app-text-faint)]">{text}</p>
}

function EarningsRow({ item, locale }: { item: import("@/lib/portfolio-events").PortfolioEarnings; locale: string }) {
  const surprise = num(item.surprise_pct)
  return (
    <Link href={`/positions/${item.context.positionId}`} className="grid gap-3 px-4 py-3 transition hover:bg-[var(--app-surface-hover)] sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center">
      <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--app-text)]">{item.context.name}</p><p className="mt-0.5 text-[10px] text-[var(--app-text-faint)]">{item.context.symbol} · FY{item.fiscal_year}{item.fiscal_quarter ? ` Q${item.fiscal_quarter}` : ""}</p></div>
      <span className="text-[10px] tabular-nums text-[var(--app-text-muted)]">{item.report_date ? new Date(item.report_date).toLocaleDateString(locale) : "Date unavailable"}</span>
      <span className={`text-right text-[10px] font-semibold tabular-nums ${surprise === null ? "text-[var(--app-text-faint)]" : surprise >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{surprise === null ? (item.is_upcoming ? "Upcoming" : "No surprise data") : `${surprise >= 0 ? "+" : ""}${(surprise * 100).toFixed(1)}%`}</span>
    </Link>
  )
}

function ActionRow({ item, locale }: { item: import("@/lib/portfolio-events").PortfolioCorporateAction; locale: string }) {
  const amount = num(item.dividend_amount)
  const numerator = num(item.ratio_numerator)
  const denominator = num(item.ratio_denominator)
  const value = item.type === "dividend" && amount !== null
    ? fmtCurrency(locale, amount, item.dividend_currency ?? item.context.currency)
    : numerator !== null && denominator !== null ? `${numerator}:${denominator}` : ""
  return (
    <Link href={`/positions/${item.context.positionId}`} className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-[var(--app-surface-hover)]">
      <div className="min-w-0"><p className="truncate text-xs font-semibold text-[var(--app-text)]">{item.context.name}</p><p className="mt-0.5 text-[10px] capitalize text-[var(--app-text-faint)]">{item.type.replace("_", " ")} · {new Date(item.ex_date).toLocaleDateString(locale)}</p></div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-[var(--app-text)]">{value}</span>
    </Link>
  )
}
