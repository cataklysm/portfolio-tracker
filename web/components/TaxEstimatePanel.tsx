import { fmtCurrency, num } from "@/lib/format"
import type { CryptoTaxResult, SecuritiesTaxResult, TaxEstimate } from "@/lib/types"

const UNSUPPORTED_LABEL: Record<string, string> = {
  fund_tax_deferred: "Fund/ETF tax handling is not yet supported (deferred).",
  unknown_tax_rule: "The configured tax rule is unavailable.",
}

/**
 * The tax ESTIMATE dashboard: per-portfolio German securities and crypto blocks,
 * kept entirely separate from the recorded broker tax above. Every figure is an
 * estimate, never tax advice, and crypto gains are never mixed with withheld CGT.
 */
export function TaxEstimatePanel({ estimate, locale }: { estimate: TaxEstimate; locale: string }) {
  const { securities, crypto, unsupported } = estimate
  if (securities.length === 0 && crypto.length === 0 && unsupported.length === 0) return null
  const ccy = estimate.tax_currency

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--app-border)] px-4 py-3">
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Tax estimate</h2>
        <span className="text-[9px] font-semibold text-[var(--app-text-faint)]">Estimate — not tax advice</span>
      </div>

      {!estimate.fx_complete && (
        <p className="border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-warning)_8%,transparent)] px-4 py-2 text-[10px] text-[var(--app-warning)]">
          Some realized amounts lacked a historical exchange rate; totals may be understated.
        </p>
      )}

      {securities.map((block) => (
        <SecuritiesBlock key={block.portfolio_id} name={block.portfolio_name} result={block.result} locale={locale} ccy={ccy} />
      ))}
      {crypto.map((block) => (
        <CryptoBlock key={block.portfolio_id} name={block.portfolio_name} result={block.result} locale={locale} ccy={ccy} />
      ))}

      {unsupported.length > 0 && (
        <div className="border-t border-[var(--app-border)] px-4 py-3">
          <p className="mb-1 text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Not estimated</p>
          <ul className="space-y-0.5 text-[11px] text-[var(--app-text-muted)]">
            {unsupported.map((u) => (
              <li key={`${u.portfolio_id}:${u.reason}`}>
                <span className="text-[var(--app-text)]">{u.portfolio_name}</span> — {UNSUPPORTED_LABEL[u.reason] ?? u.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

function SecuritiesBlock({ name, result, locale, ccy }: { name: string; result: SecuritiesTaxResult; locale: string; ccy: string }) {
  const outstanding = num(result.outstandingTaxCorrection) ?? 0
  return (
    <div className="border-t border-[var(--app-border)]">
      <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-muted)]">
        {name} · securities
      </p>
      <div className="grid sm:grid-cols-3 lg:grid-cols-5">
        <Metric label="Stock loss pot" value={money(result.stockLossPot, locale, ccy)} />
        <Metric label="Calculated tax" value={money(result.totalCalculatedTax, locale, ccy)} />
        <Metric label="Withheld (est.)" value={money(result.totalWithheldTax, locale, ccy)} />
        <Metric label="Expected correction" value={money(result.expectedTaxCorrection, locale, ccy)} />
        <Metric
          label="Outstanding correction"
          value={money(result.outstandingTaxCorrection, locale, ccy)}
          tone={outstanding > 0 ? "positive" : undefined}
          sub={`Booked ${money(result.bookedTaxCorrection, locale, ccy)}`}
        />
      </div>
      {result.byYear.length > 0 && <YearTable rows={result.byYear} locale={locale} ccy={ccy} kind="securities" />}
    </div>
  )
}

function CryptoBlock({ name, result, locale, ccy }: { name: string; result: CryptoTaxResult; locale: string; ccy: string }) {
  return (
    <div className="border-t border-[var(--app-border)]">
      <p className="px-4 pt-3 text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-muted)]">
        {name} · crypto (private disposal)
      </p>
      {result.byYear.length === 0 ? (
        <p className="px-4 py-3 text-[11px] text-[var(--app-text-faint)]">No taxable disposals.</p>
      ) : (
        <YearTable rows={result.byYear} locale={locale} ccy={ccy} kind="crypto" />
      )}
      <p className="border-t border-[var(--app-border)] px-4 py-2 text-[10px] leading-4 text-[var(--app-text-faint)]">{result.note}</p>
    </div>
  )
}

type YearRow =
  | (SecuritiesTaxResult["byYear"][number] & { kind?: never })
  | CryptoTaxResult["byYear"][number]

function YearTable({ rows, locale, ccy, kind }: { rows: YearRow[]; locale: string; ccy: string; kind: "securities" | "crypto" }) {
  return (
    <div className="px-4 py-3">
      <table className="w-full text-[11px]">
        <thead>
          <tr className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">
            <th className="py-1 text-left font-semibold">Year</th>
            {kind === "securities" ? (
              <>
                <th className="py-1 text-right font-semibold">Taxable</th>
                <th className="py-1 text-right font-semibold">Exemption</th>
                <th className="py-1 text-right font-semibold">Calculated</th>
                <th className="py-1 text-right font-semibold">Withheld</th>
              </>
            ) : (
              <>
                <th className="py-1 text-right font-semibold">Taxable gain</th>
                <th className="py-1 text-right font-semibold">Losses</th>
                <th className="py-1 text-right font-semibold">Tax-free</th>
                <th className="py-1 text-right font-semibold">Net</th>
              </>
            )}
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--app-border)]">
          {rows.map((row) =>
            "taxFreeGains" in row ? (
              <tr key={row.year}>
                <td className="py-1.5 text-[var(--app-text)]">
                  {row.year}
                  {row.belowAnnualFreeLimit ? (
                    <span className="ml-1.5 text-[9px] text-[var(--app-text-faint)]" title="Net gain is below the annual exemption limit">
                      ≤ limit
                    </span>
                  ) : null}
                </td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text)]">{money(row.taxableGain, locale, ccy)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text-muted)]">{money(row.realizedLosses, locale, ccy)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text-muted)]">{money(row.taxFreeGains, locale, ccy)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text)]">{money(row.netTaxRelevant, locale, ccy)}</td>
              </tr>
            ) : (
              <tr key={row.year}>
                <td className="py-1.5 text-[var(--app-text)]">{row.year}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text)]">{money(row.taxableGain, locale, ccy)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text-muted)]">{money(row.usedExemption, locale, ccy)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text)]">{money(row.calculatedTax, locale, ccy)}</td>
                <td className="py-1.5 text-right tabular-nums text-[var(--app-text-muted)]">{money(row.withheldTax, locale, ccy)}</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
    </div>
  )
}

function Metric({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "positive" | "negative" }) {
  const color = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="border-b border-[var(--app-border)] px-4 py-3 last:border-b-0 sm:border-r">
      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</p>
      <p className={`mt-1 text-sm font-semibold tabular-nums ${color}`}>{value}</p>
      {sub ? <p className="mt-0.5 text-[9px] text-[var(--app-text-muted)]">{sub}</p> : null}
    </div>
  )
}

function money(value: string, locale: string, currency: string): string {
  return fmtCurrency(locale, num(value) ?? 0, currency)
}
