"use client"
import type { TransactionView } from "@/lib/types"
import { EditTransactionModal } from "./EditTransactionModal"
import { useTranslations } from "@/lib/i18n"

function formatDate(locale: string, value: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
}

interface Props {
  transactions: TransactionView[]
  locale: string
  positionId: string
  currency: string
}

export function TransactionsTable({ transactions, locale, positionId, currency }: Props) {
  const t = useTranslations()
  if (transactions.length === 0) {
    return <p className="text-sm text-[var(--app-text-faint)]">{t("transactions.empty")}</p>
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] table-auto text-sm">
        <thead>
          <tr className="border-b border-[var(--app-border)] text-left text-xs text-[var(--app-text-faint)]">
            <th className="w-28 min-w-28 whitespace-nowrap pb-2 pr-4 font-medium">{t("transactions.date")}</th>
            <th className="w-24 min-w-24 whitespace-nowrap pb-2 pr-4 font-medium">{t("transactions.side")}</th>
            <th className="w-24 min-w-24 whitespace-nowrap pb-2 pr-4 font-medium"><span className="block text-right">{t("transactions.qty")}</span></th>
            <th className="w-32 min-w-32 whitespace-nowrap pb-2 pr-4 font-medium"><span className="block text-right">{t("transactions.price")}</span></th>
            <th className="w-28 min-w-28 whitespace-nowrap pb-2 pr-4 font-medium"><span className="block text-right">{t("transactions.fee")}</span></th>
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
              <td className="min-w-48 py-2 pr-4 text-[var(--app-text-muted)]">{tx.note}</td>
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
