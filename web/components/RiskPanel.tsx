import { fmtPct } from "@/lib/format"

/** GET /reporting/risk response (kept local to avoid coupling to lib/types churn). */
export interface RiskReport {
  period: string
  reporting_currency: string
  volatility_pct: string | null
  downside_volatility_pct: string | null
  annualized_return_pct: string | null
  sharpe: string | null
  sortino: string | null
  max_drawdown_pct: string | null
  best_period_pct: string | null
  worst_period_pct: string | null
  sample_count: number
  closed_positions: { count: number; wins: number; losses: number; win_rate_pct: string | null }
}

export function RiskPanel({ report }: { report: RiskReport | null }) {
  if (!report || report.sample_count < 2) {
    return (
      <section className="app-panel rounded-xl p-5">
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Risk</h2>
        <p className="mt-2 text-xs text-[var(--app-text-muted)]">Not enough history yet to compute risk metrics.</p>
      </section>
    )
  }

  const wr = report.closed_positions
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3">
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Risk &amp; quality</h2>
        <span className="text-[9px] uppercase tracking-wide text-[var(--app-text-faint)]">annualized · {report.period}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-[var(--app-border)] sm:grid-cols-3 lg:grid-cols-4">
        <Cell label="Volatility" value={pct(report.volatility_pct)} />
        <Cell label="Max drawdown" value={pct(report.max_drawdown_pct)} tone="negative" />
        <Cell label="Sharpe" value={report.sharpe ?? "—"} />
        <Cell label="Sortino" value={report.sortino ?? "—"} />
        <Cell label="Best period" value={pct(report.best_period_pct)} tone="positive" />
        <Cell label="Worst period" value={pct(report.worst_period_pct)} tone="negative" />
        <Cell label="Downside vol." value={pct(report.downside_volatility_pct)} />
        <Cell
          label="Win rate"
          value={wr.win_rate_pct === null ? "—" : `${wr.win_rate_pct}%`}
          sub={`${wr.wins}W / ${wr.losses}L of ${wr.count} closed`}
        />
      </div>
    </section>
  )
}

function Cell({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" }) {
  const color =
    tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="bg-[var(--app-surface)] px-4 py-3">
      <p className="text-[9px] uppercase tracking-wide text-[var(--app-text-faint)]">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">{sub}</p>}
    </div>
  )
}

function pct(value: string | null): string {
  if (value === null) return "—"
  return fmtPct(Number(value))
}
