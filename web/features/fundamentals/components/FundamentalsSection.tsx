import type { Fundamentals } from "@/lib/types"
import { getTranslations } from "@/lib/i18n"
import { fmtCompact, fmtCurrency, num } from "@/lib/format"

interface Props {
  data: Fundamentals | null
  currency: string
  locale: string
  density?: "cards" | "compact"
  /** Why the section is empty, when the service explained it (theme 15). */
  emptyReason?: string | null
}

/** Signed percentage from a decimal ratio (0.166 -> "+16.60%"). */
function pctSigned(value: number): string {
  const p = value * 100
  return `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`
}

/** Plain percentage from a decimal ratio (0.0198 -> "1.98%"), no sign. */
function pctPlain(value: number): string {
  return `${(value * 100).toFixed(2)}%`
}

/**
 * Read-only fundamentals snapshot for a position's instrument. Data is fetched
 * and refreshed in the background by the fundamentals service; this just renders
 * whatever is stored, showing only the metrics the provider actually supplied.
 */
export function FundamentalsSection({ data, currency, locale, density = "cards", emptyReason }: Props) {
  const t = getTranslations()
  const emptyText = emptyReason ?? t("fundamentals.empty")
  if (!data) return <p className="text-sm text-[var(--app-text-faint)]">{emptyText}</p>

  const ccy = data.currency ?? currency
  const metrics: { label: string; value: string }[] = []
  const push = (raw: string | null, label: string, fmt: (n: number) => string) => {
    const n = num(raw)
    if (n !== null) metrics.push({ label, value: fmt(n) })
  }

  push(data.pe_ratio, t("fundamentals.peRatio"), (n) => n.toFixed(2))
  push(data.pb_ratio, t("fundamentals.pbRatio"), (n) => n.toFixed(2))
  push(data.ps_ratio, t("fundamentals.psRatio"), (n) => n.toFixed(2))
  push(data.dividend_yield, t("fundamentals.dividendYield"), pctPlain)
  push(data.eps, t("fundamentals.eps"), (n) => fmtCurrency(locale, n, ccy))
  push(data.market_cap, t("fundamentals.marketCap"), (n) => fmtCompact(locale, n, ccy))
  push(data.revenue, t("fundamentals.revenue"), (n) => fmtCompact(locale, n, ccy))
  push(data.revenue_growth, t("fundamentals.revenueGrowth"), pctSigned)
  push(data.earnings_growth, t("fundamentals.earningsGrowth"), pctSigned)
  push(data.shares_outstanding, t("fundamentals.sharesOutstanding"), (n) => fmtCompact(locale, n))
  push(data.net_debt, t("fundamentals.netDebt"), (n) => fmtCompact(locale, n, ccy))

  if (metrics.length === 0) return <p className="text-sm text-[var(--app-text-faint)]">{emptyText}</p>

  if (density === "compact") {
    return (
      <div className="space-y-3">
        <dl className="divide-y divide-[var(--app-border)] rounded-md border border-[var(--app-border)] bg-[var(--app-surface-panel)]">
          {metrics.slice(0, 6).map((m) => (
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-3 px-3 py-2" key={m.label}>
              <dt className="truncate text-[10.5px] font-semibold text-[var(--app-text-faint)]">{m.label}</dt>
              <dd className="text-right text-[12px] font-semibold tabular-nums text-[var(--app-text)]">{m.value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-[10.5px] leading-4 text-[var(--app-text-faint)]">
          {t("fundamentals.asOf", { date: data.effective_date, provider: data.provider })}
          {data.quality ? ` - ${data.quality} coverage` : ""}
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {metrics.map((m) => (
          <div
            key={m.label}
            className="app-muted-panel rounded-lg px-3 py-2.5"
          >
            <p className="mb-0.5 text-[11px] text-[var(--app-text-faint)]">{m.label}</p>
            <p className="font-semibold tabular-nums text-[var(--app-text)]">{m.value}</p>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-[var(--app-text-faint)]">
        {t("fundamentals.asOf", { date: data.effective_date, provider: data.provider })}
        {data.quality ? ` - ${data.quality} coverage` : ""}
      </p>
    </div>
  )
}
