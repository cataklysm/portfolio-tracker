"use client"
import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import type { RealizationAllocationView, TaxComponent, TransactionTaxEvent, TransactionView } from "@/lib/types"
import { EditTransactionModal } from "./EditTransactionModal"
import { TaxEventModal } from "./TaxEventModal"
import { deleteTaxEventAction } from "@/app/reports/tax-actions"
import { useTranslations } from "@/lib/i18n"
import { fmtPrice, fmtQty } from "@/lib/format"

const TAX_COMPONENT_LABEL: Record<TaxComponent, string> = {
  capital_income: "Capital income tax",
  solidarity: "Solidarity surcharge",
  church: "Church tax",
  foreign_withholding: "Foreign withholding",
  generic: "Broker tax / correction",
}

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
function PnlCell({ value, native, currency, displayCurrency, locale, title }: { value: string | null; native: string | null; currency: string; displayCurrency: string; locale: string; title?: string }) {
  if (value === null) return <td className="w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums" />
  const n = parseFloat(value)
  const tone = n > 0 ? "text-[var(--app-positive)]" : n < 0 ? "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"
  const nativeHint = native !== null ? `${parseFloat(native).toLocaleString(locale, { minimumFractionDigits: 2 })} ${currency}` : undefined
  return (
    <td className={`w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums ${tone}`} title={[title, nativeHint].filter(Boolean).join(" · ") || undefined}>
      {n > 0 ? "+" : ""}{n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[var(--app-text-faint)]">{displayCurrency}</span>
    </td>
  )
}

interface Props {
  transactions: TransactionView[]
  locale: string
  positionId: string
  currency: string
  reportingCurrency: string
  assetType: string
  portfolioId: string
  allocations: RealizationAllocationView | null
}

export function TransactionsTable({ transactions, locale, positionId, portfolioId, currency, reportingCurrency, assetType, allocations }: Props) {
  const t = useTranslations()
  const storageKey = `portfolio-transaction-sells:${positionId}`
  const [collapsedSells, setCollapsedSells] = useState<Set<string>>(new Set())
  const [expandedTax, setExpandedTax] = useState<Set<string>>(new Set())
  const [storageReady, setStorageReady] = useState(false)

  function toggleTax(id: string) {
    setExpandedTax((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(storageKey) ?? "[]") as unknown
      if (Array.isArray(stored)) setCollapsedSells(new Set(stored.filter((id): id is string => typeof id === "string")))
    } catch {
      setCollapsedSells(new Set())
    }
    setStorageReady(true)
  }, [storageKey])

  function toggleSell(id: string) {
    setCollapsedSells((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try {
        localStorage.setItem(storageKey, JSON.stringify([...next]))
      } catch {}
      return next
    })
  }

  if (transactions.length === 0) {
    return <p className="text-sm text-[var(--app-text-faint)]">{t("transactions.empty")}</p>
  }

  const isAverageCost = transactions.some((tx) => tx.performance.attribution === "average_cost")
  const effectiveAllocations = completeAllocations(transactions, allocations)
  const allocatedBuyIds = new Set(effectiveAllocations.lot_allocations.map((row) => row.buy_transaction_id))
  const fullyConsumedBuyIds = new Set(
    transactions
      .filter((tx) => tx.side === "buy" && allocatedBuyIds.has(tx.id) && tx.performance.remaining_quantity !== null && parseFloat(tx.performance.remaining_quantity) === 0)
      .map((tx) => tx.id),
  )
  const visibleTransactions = transactions.filter((tx) => tx.side === "sell" || !fullyConsumedBuyIds.has(tx.id))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1000px] table-auto text-sm">
        <thead>
          <tr className="border-b border-[var(--app-border)] text-left text-xs text-[var(--app-text-faint)]">
            <th className="w-28 min-w-28 whitespace-nowrap pb-2 pl-5 pr-4 font-medium">{t("transactions.date")}</th>
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
          {visibleTransactions.map((tx) => {
            const lotRows = effectiveAllocations.lot_allocations.filter((row) => row.sell_transaction_id === tx.id)
            const average = effectiveAllocations.average_cost_realizations.find((row) => row.sell_transaction_id === tx.id)
            const hasChildren = tx.side === "sell" && (lotRows.length > 0 || !!average)
            const collapsed = storageReady && collapsedSells.has(tx.id)
            const remainingQuantity = tx.performance.remaining_quantity === null ? null : parseFloat(tx.performance.remaining_quantity)
            const isOpenRemainder = tx.side === "buy"
              && allocatedBuyIds.has(tx.id)
              && remainingQuantity !== null
              && remainingQuantity > 0
              && remainingQuantity < parseFloat(tx.quantity)
            return <Fragment key={tx.id}>
            <tr className="text-[var(--app-text)] transition hover:bg-[var(--app-surface-hover)]">
              <td className="relative w-28 min-w-28 whitespace-nowrap py-2 pl-5 pr-4 tabular-nums text-[var(--app-text-muted)]">
                {hasChildren ? <button type="button" onClick={() => toggleSell(tx.id)} className="absolute left-0 top-1/2 inline-flex h-5 w-4 -translate-y-1/2 items-center justify-center rounded text-[11px] text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]" title={collapsed ? "Show consumed buys" : "Hide consumed buys"} aria-expanded={!collapsed}>{collapsed ? ">" : "v"}</button> : null}
                {formatDate(locale, tx.effective_at)}
              </td>
              <td className="w-24 min-w-24 whitespace-nowrap py-2 pr-4">
                <span className={`inline-flex min-w-11 items-center justify-center rounded-md border px-2 py-0.5 text-[9px] font-semibold tracking-[0.08em] ${tx.side === "buy" ? "border-[color-mix(in_srgb,var(--app-positive)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_10%,transparent)] text-[var(--app-positive)]" : "border-[color-mix(in_srgb,var(--app-negative)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] text-[var(--app-negative)]"}`}>
                  {isOpenRemainder ? "OPEN BUY" : tx.side.toUpperCase()}
                </span>
                {tx.savings_plan ? <span className="ml-1.5 text-[11px] text-[var(--app-accent)]">{t("transactions.plan")}</span> : null}
              </td>
              <td
                className="w-24 min-w-24 whitespace-nowrap py-2 pr-4 text-right tabular-nums"
                title={isOpenRemainder ? `Remaining from original buy quantity ${fmtQty(locale, parseFloat(tx.quantity), assetType)}` : undefined}
              >
                {fmtQty(locale, (isOpenRemainder ? remainingQuantity : parseFloat(tx.quantity)) ?? 0, assetType)}
              </td>
              <td className="w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums">
                {fmtPrice(locale, parseFloat(tx.price), tx.currency, assetType)}
              </td>
              <td className="w-28 min-w-28 whitespace-nowrap py-2 pr-4 text-right tabular-nums text-[var(--app-text-faint)]">
                {!isOpenRemainder && parseFloat(tx.fee) > 0 ? <>{parseFloat(tx.fee).toLocaleString(locale, { minimumFractionDigits: 2 })} <span>{tx.currency}</span></> : null}
              </td>
              <PnlCell value={tx.performance.realized_pnl_reporting} native={tx.performance.realized_pnl} currency={tx.currency} displayCurrency={reportingCurrency} locale={locale} />
              <PnlCell
                value={tx.performance.unrealized_pnl_reporting}
                native={tx.performance.unrealized_pnl}
                currency={tx.currency}
                displayCurrency={reportingCurrency}
                locale={locale}
                title={tx.performance.remaining_quantity !== null && parseFloat(tx.performance.remaining_quantity) > 0 ? `${fmtQty(locale, parseFloat(tx.performance.remaining_quantity), assetType)} ${t("transactions.qty").toLowerCase()}` : undefined}
              />
              <td className="min-w-48 py-2 pr-4 text-[var(--app-text-muted)]">
                {tx.note}
                {isOpenRemainder ? <span className="mt-0.5 block text-[10px] text-[var(--app-text-faint)]">Open remainder of the original buy transaction</span> : null}
                {tx.tax_events.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => toggleTax(tx.id)}
                    aria-expanded={expandedTax.has(tx.id)}
                    title={t("transactions.linkedTax")}
                    className="mt-0.5 block text-left text-[10px] text-[var(--app-text-faint)] transition hover:text-[var(--app-text-muted)]"
                  >
                    <span className="mr-1 inline-block text-[8px]">{expandedTax.has(tx.id) ? "v" : ">"}</span>
                    {[...netTaxByCurrency(tx.tax_events)].map(([ccy, net], i) => (
                      <span key={ccy} className={i > 0 ? "ml-2" : ""}>
                        {t("transactions.tax")}: {net > 0 ? "−" : net < 0 ? "+" : ""}{Math.abs(net).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {ccy}
                      </span>
                    ))}
                    <span className="ml-1 text-[var(--app-border-strong)]">· {tx.tax_events.length}</span>
                  </button>
                ) : null}
              </td>
              <td className="w-px whitespace-nowrap py-2 text-right">
                <div className="flex items-center justify-end gap-1">
                  <TaxEventModal currency={tx.currency} portfolioId={portfolioId} positionId={positionId} transactionId={tx.id} />
                  <EditTransactionModal positionId={positionId} currency={currency} transaction={tx} />
                </div>
              </td>
            </tr>
            {hasChildren && !collapsed ? <AllocationRows sell={tx} transactions={transactions} lots={lotRows} average={average} allocations={effectiveAllocations} locale={locale} reportingCurrency={reportingCurrency} assetType={assetType} /> : null}
            {tx.tax_events.length > 0 && expandedTax.has(tx.id) ? <TaxEventRows events={tx.tax_events} positionId={positionId} locale={locale} /> : null}
            </Fragment>
          })}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Expanded sub-row listing the individual broker-tax events linked to a
 * transaction, each editable (reusing TaxEventModal) and deletable inline — so a
 * correction or reversal can be made from the ledger without leaving for the tax
 * centre. A withheld amount shows as a cost (−), a refund as a credit (+).
 */
function TaxEventRows({ events, positionId, locale }: { events: TransactionTaxEvent[]; positionId: string; locale: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)

  async function remove(id: string) {
    setBusy(id)
    try {
      await deleteTaxEventAction(id, positionId, null)
      router.refresh()
    } finally {
      setBusy(null)
    }
  }

  return (
    <tr className="bg-[var(--app-surface-raised)]">
      <td colSpan={9} className="px-5 py-2">
        <ul className="space-y-1">
          {events.map((event) => {
            const amount = parseFloat(event.amount)
            const signedTone = event.direction === "withheld" ? "text-[var(--app-negative)]" : "text-[var(--app-positive)]"
            return (
              <li key={event.id} className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-border)] px-3 py-1.5 text-[10px]">
                <div className="min-w-0">
                  <span className="font-medium text-[var(--app-text)]">{TAX_COMPONENT_LABEL[event.component]}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${event.direction === "withheld" ? "bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] text-[var(--app-negative)]" : "bg-[color-mix(in_srgb,var(--app-positive)_12%,transparent)] text-[var(--app-positive)]"}`}>{event.direction}</span>
                  <span className="ml-2 text-[var(--app-text-faint)]">{event.booking_date}</span>
                  {event.note ? <span className="ml-2 text-[var(--app-text-faint)]">· {event.note}</span> : null}
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span className={`tabular-nums ${signedTone}`}>
                    {event.direction === "withheld" ? "−" : "+"}{Math.abs(amount).toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {event.currency}
                  </span>
                  <TaxEventModal
                    currency={event.currency}
                    event={{
                      id: event.id,
                      position_id: positionId,
                      component: event.component,
                      direction: event.direction,
                      amount: event.amount,
                      currency: event.currency,
                      booking_date: event.booking_date,
                      note: event.note,
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => remove(event.id)}
                    disabled={busy === event.id}
                    title="Delete tax event"
                    className="text-[var(--app-text-faint)] transition hover:text-[var(--app-negative)] disabled:opacity-50"
                  >
                    ✕
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      </td>
    </tr>
  )
}

/**
 * Older/imported positions may not have persisted allocation rows yet. Their
 * position detail still contains the ordered ledger and accounting method, so
 * derive the display hierarchy on read until a later write persists it.
 */
function completeAllocations(transactions: TransactionView[], persisted: RealizationAllocationView | null): RealizationAllocationView {
  if (persisted && (persisted.lot_allocations.length > 0 || persisted.average_cost_realizations.length > 0)) return persisted
  const method = transactions[0]?.performance.attribution ?? null
  if (!method) return emptyAllocations()
  if (method === "average_cost") {
    return {
      position_id: persisted?.position_id ?? "",
      accounting_method: method,
      calculation_version: persisted?.calculation_version ?? null,
      lot_allocations: [],
      average_cost_realizations: transactions.flatMap((tx) => {
        if (tx.side !== "sell" || tx.performance.consumed_cost_basis === null) return []
        const quantity = parseFloat(tx.quantity)
        return [{
          sell_transaction_id: tx.id,
          quantity: tx.quantity,
          average_cost_basis: quantity > 0 ? String(parseFloat(tx.performance.consumed_cost_basis) / quantity) : "0",
        }]
      }),
    }
  }

  const lots: { id: string; remaining: number }[] = []
  const derived: RealizationAllocationView["lot_allocations"] = []
  for (const tx of transactions) {
    if (tx.side === "buy") {
      lots.push({ id: tx.id, remaining: parseFloat(tx.quantity) })
      continue
    }
    let remainingToSell = parseFloat(tx.quantity)
    while (remainingToSell > 1e-10) {
      const index = method === "fifo" ? 0 : lots.length - 1
      const lot = lots[index]
      if (!lot) break
      const consumed = Math.min(lot.remaining, remainingToSell)
      derived.push({ sell_transaction_id: tx.id, buy_transaction_id: lot.id, quantity: String(consumed) })
      lot.remaining -= consumed
      remainingToSell -= consumed
      if (lot.remaining <= 1e-10) lots.splice(index, 1)
    }
  }
  return {
    position_id: persisted?.position_id ?? "",
    accounting_method: method,
    calculation_version: persisted?.calculation_version ?? null,
    lot_allocations: derived,
    average_cost_realizations: [],
  }
}

function emptyAllocations(): RealizationAllocationView {
  return { position_id: "", accounting_method: null, calculation_version: null, lot_allocations: [], average_cost_realizations: [] }
}

function AllocationRows({ sell, transactions, lots, average, allocations, locale, reportingCurrency, assetType }: {
  sell: TransactionView
  transactions: TransactionView[]
  lots: RealizationAllocationView["lot_allocations"]
  average: RealizationAllocationView["average_cost_realizations"][number] | undefined
  allocations: RealizationAllocationView | null
  locale: string
  reportingCurrency: string
  assetType: string
}) {
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]))
  const displayedTotal = numberOrNull(sell.performance.realized_pnl_reporting) ?? numberOrNull(sell.performance.realized_pnl)
  const displayedCurrency = sell.performance.realized_pnl_reporting !== null ? reportingCurrency : sell.currency
  if (average) {
    return <tr className="bg-[var(--app-surface-raised)] text-[10px] text-[var(--app-text-muted)]">
      <td className="py-2 pl-8 pr-4" colSpan={2}><span className="mr-2 text-[var(--app-border-strong)]">↳</span>Average-cost pool</td>
      <td className="py-2 pr-4 text-right tabular-nums">{fmtQty(locale, parseFloat(average.quantity), assetType)}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(locale, parseFloat(average.average_cost_basis), sell.currency, assetType)}</td>
      <td />
      <AllocatedPnlCell value={displayedTotal} total={displayedTotal} currency={displayedCurrency} locale={locale} />
      <td />
      <td className="py-2 pr-4 text-[9px] text-[var(--app-text-faint)]">{allocations?.accounting_method?.replace("_", " ")}{allocations?.calculation_version ? ` · calculation version ${allocations.calculation_version}` : " · derived from ledger"}</td>
      <td />
    </tr>
  }
  const allocatedPnls = allocateLotPnl(sell, lots, byId, reportingCurrency)
  return <>{lots.map((lot, index) => {
    const buy = byId.get(lot.buy_transaction_id)
    if (!buy) return null
    const allocatedPnl = allocatedPnls[index]
    return <tr key={`${lot.sell_transaction_id}-${lot.buy_transaction_id}`} className="bg-[var(--app-surface-raised)] text-[10px] text-[var(--app-text-muted)]">
      <td className="py-2 pl-8 pr-4 tabular-nums"><span className="mr-2 text-[var(--app-border-strong)]">↳</span>{formatDate(locale, buy.effective_at)}</td>
      <td className="py-2 pr-4"><span className="rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[8px] font-semibold uppercase text-[var(--app-text-faint)]">consumed buy</span></td>
      <td className="py-2 pr-4 text-right tabular-nums">{fmtQty(locale, parseFloat(lot.quantity), assetType)}</td>
      <td className="py-2 pr-4 text-right tabular-nums">{fmtPrice(locale, parseFloat(buy.price), buy.currency, assetType)}</td>
      <td className="py-2 pr-4 text-right tabular-nums text-[var(--app-text-faint)]" title="The original buy fee is not allocated proportionally to consumed quantities." />
      <AllocatedPnlCell value={allocatedPnl?.value ?? null} total={allocatedPnl?.total ?? null} currency={allocatedPnl?.currency ?? displayedCurrency} locale={locale} />
      <td className="w-32 min-w-32 py-2 pr-4" />
      <td className="min-w-48 py-2 pr-4 text-[var(--app-text-faint)]">{buy.note}</td>
      <td className="w-px py-2" />
    </tr>
  })}</>
}

function allocateLotPnl(
  sell: TransactionView,
  lots: RealizationAllocationView["lot_allocations"],
  byId: Map<string, TransactionView>,
  reportingCurrency: string,
): { value: number; total: number; currency: string }[] {
  const sellQuantity = parseFloat(sell.quantity)
  const nativeTotal = numberOrNull(sell.performance.realized_pnl)
  const reportingTotal = numberOrNull(sell.performance.realized_pnl_reporting)
  const useReporting = reportingTotal !== null && nativeTotal !== null && Math.abs(nativeTotal) > 1e-12
  const ratio = useReporting ? reportingTotal / nativeTotal : 1
  const currency = useReporting ? reportingCurrency : sell.currency
  const values = lots.map((lot) => {
    const buy = byId.get(lot.buy_transaction_id)
    if (!buy) return 0
    const quantity = parseFloat(lot.quantity)
    const buyQuantity = parseFloat(buy.quantity)
    const buyUnitCost = parseFloat(buy.price) + (buyQuantity > 0 ? parseFloat(buy.fee) / buyQuantity : 0)
    const allocatedSellFee = sellQuantity > 0 ? parseFloat(sell.fee) * quantity / sellQuantity : 0
    return (quantity * parseFloat(sell.price) - allocatedSellFee - quantity * buyUnitCost) * ratio
  })
  const total = useReporting ? reportingTotal : nativeTotal ?? values.reduce((sum, value) => sum + value, 0)
  if (values.length > 0) values[values.length - 1] += total - values.reduce((sum, value) => sum + value, 0)
  return values.map((value) => ({ value, total, currency }))
}

function AllocatedPnlCell({ value, total, currency, locale }: { value: number | null; total: number | null; currency: string; locale: string }) {
  if (value === null) return <td className="w-32 min-w-32 py-2 pr-4" />
  const tone = value > 0 ? "text-[var(--app-positive)]" : value < 0 ? "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"
  const fraction = total !== null && Math.abs(total) > 1e-12 ? value / total * 100 : null
  return <td className={`w-32 min-w-32 whitespace-nowrap py-2 pr-4 text-right tabular-nums ${tone}`} title={`Allocated fraction of sell realized P&L in ${currency}`}>
    <span className="block">{value > 0 ? "+" : ""}{value.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} <span className="text-[var(--app-text-faint)]">{currency}</span></span>
    {fraction !== null ? <span className="mt-0.5 block text-[8px] text-[var(--app-text-faint)]">{fraction.toLocaleString(locale, { maximumFractionDigits: 1 })}% of sell P&amp;L</span> : null}
  </td>
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
