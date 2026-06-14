"use client"
import type { TransactionTaxEvent, TransactionView } from "@/lib/types"
import { EditTransactionModal } from "./EditTransactionModal"
import { useTranslations } from "@/lib/i18n"

function formatDate(locale: string, value: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
}

/** Net recorded broker tax for a transaction, by currency (withheld − refunded). */
function netTaxByCurrency(events: TransactionTaxEvent[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const e of events) {
    const signed = (e.direction === "withheld" ? 1 : -1) * parseFloat(e.amount)
    out.set(e.currency, (out.get(e.currency) ?? 0) + signed)
  }
  return out
}

/** Reporting-currency P&L cell: signed, color-coded; null renders empty. */
function PnlCell({ value, native, currency, locale, title }: { value: string | null; native: string | null; currency: string; locale: string; title?: string }) {
  if (value === null) return <td className="w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums" />
  const n = parseFloat(value)
  const tone = n > 0 ? "text-[var(--app-positive)]" : n < 0 ? "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"
  const nativeHint = native !== null ? `${parseFloat(native).toLocaleString(locale, { minimumFractionDigits: 2 })} ${currency}` : undefined
  return (
    <td className={`w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums ${tone}`} title={[title, nativeHint].filter(Boolean).join(" · ") || undefined}>
      {n > 0 ? "+" : ""}{n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
    </td>
  )
}

interface Props {
  transactions: TransactionView[]
  locale: string
  positionId: string
  currency: string
  reportingCurrency: string
}

export function TransactionsTable({ transactions, locale, positionId, currency, reportingCurrency }: Props) {
  const t = useTranslations()
  if (transactions.length === 0) {
    return <p className="text-sm text-[var(--app-text-faint)]">{t("transactions.empty")}</p>
  }

  const isAverageCost = transactions.some((tx) => tx.performance.attribution === "average_cost")

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] table-auto text-sm">
        <thead>
          <tr className="border-b border-[var(--app-border)] text-left text-xs text-[var(--app-text-faint)]">
            <th className="w-28 min-w-28 whitespace-nowrap pb-2 pr-4 font-medium">{t("transactions.date")}</th>
            <th className="w-24 min-w-24 whitespace-nowrap pb-2 pr-4 font-medium">{t("transactions.side")}</th>
            <th className="w-24 min-w-24 whitespace-nowrap pb-2 pr-4 font-medium"><span className="block text-right">{t("transactions.qty")}</span></th>
            <th className="w-32 min-w-32 whitespace-nowrap pb-2 pr-4 font-medium"><span className="block text-right">{t("transactions.price")}</span></th>
            <th className="w-28 min-w-28 whitespace-nowrap pb-2 pr-4 font-medium"><span className="block text-right">{t("transactions.fee")}</span></th>
            <th className="w-32 min-w-32 whitespace-nowrap pb-2 pr-4 font-medium" title={t("transactions.pnlInReporting", { currency: reportingCurrency })}><span className="block text-right">{t("transactions.realizedPnl")}</span></th>
            <th className="w-32 min-w-32 whitespace-nowrap pb-2 pr-4 font-medium" title={isAverageCost ? t("transactions.avgCostNoUnrealized") : t("transactions.pnlInReporting", { currency: reportingCurrency })}><span className="block text-right">{t("transactions.unrealizedPnl")}</span></th>
            <th className="min-w-48 pb-2 pr-4 font-medium">{t("transactions.note")}</th>
            <th className="w-px whitespace-nowrap pb-2 text-right font-medium"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--app-border)]">
          {transactions.map((tx) => (
            <tr key={tx.id} className="text-[var(--app-text)] transition hover:bg-[var(--app-surface-hover)]">
              <td className="w-28 min-w-28 whitespace-nowrap py-2 pr-4 tabular-nums text-[var(--app-text-muted)]">{formatDate(locale, tx.effective_at)}</td>
              <td className="w-24 min-w-24 whitespace-nowrap py-2 pr-4">
                <span className={`inline-flex min-w-11 items-center justify-center rounded-md border px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] ${tx.side === "buy" ? "border-[color-mix(in_srgb,var(--app-positive)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_10%,transparent)] text-[var(--app-positive)]" : "border-[color-mix(in_srgb,var(--app-negative)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] text-[var(--app-negative)]"}`}>
                  {tx.side.toUpperCase()}
                </span>
                {tx.savings_plan ? <span className="ml-1.5 text-[11px] text-[var(--app-accent)]">{t("transactions.plan")}</span> : null}
              </td>
              <td className="w-24 min-w-24 whitespace-nowrap py-2 pr-4 text-right tabular-nums">{parseFloat(tx.quantity).toLocaleString(locale)}</td>
              <td className="w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                {parseFloat(tx.price).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}{" "}
                <span className="text-[var(--app-text-faint)]">{tx.currency}</span>
              </td>
              <td className="w-28 min-w-28 whitespace-nowrap py-2 pr-4 text-right tabular-nums text-[var(--app-text-faint)]">
                {parseFloat(tx.fee) > 0 ? <>{parseFloat(tx.fee).toLocaleString(locale, { minimumFractionDigits: 2 })} <span>{tx.currency}</span></> : null}
              </td>
              <PnlCell value={tx.performance.realized_pnl_reporting} native={tx.performance.realized_pnl} currency={tx.currency} locale={locale} />
              <PnlCell
                value={tx.performance.unrealized_pnl_reporting}
                native={tx.performance.unrealized_pnl}
                currency={tx.currency}
                locale={locale}
                title={tx.performance.remaining_quantity !== null && parseFloat(tx.performance.remaining_quantity) > 0 ? `${parseFloat(tx.performance.remaining_quantity).toLocaleString(locale)} ${t("transactions.qty").toLowerCase()}` : undefined}
              />
              <td className="min-w-48 py-2 pr-4 text-[var(--app-text-muted)]">
                {tx.note}
                {tx.tax_events.length > 0 ? (
                  <span className="mt-0.5 block text-[10px] text-[var(--app-text-faint)]" title={t("transactions.linkedTax")}>
                    {[...netTaxByCurrency(tx.tax_events)].map(([ccy, net], i) => (
                      <span key={ccy} className={i > 0 ? "ml-2" : ""}>
                        {t("transactions.tax")}: {net > 0 ? "−" : net < 0 ? "+" : ""}{Math.abs(net).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {ccy}
                      </span>
                    ))}
                  </span>
                ) : null}
              </td>
              <td className="w-px whitespace-nowrap py-2 text-right">
                <EditTransactionModal positionId={positionId} currency={currency} transaction={tx} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
