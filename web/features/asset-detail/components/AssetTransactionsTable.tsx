"use client"

import { Fragment, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { EditTransactionModal } from "@/components/EditTransactionModal"
import { TaxEventModal } from "@/components/TaxEventModal"
import { deleteTaxEventAction } from "@/app/reports/tax-actions"
import { fmtPrice, fmtQty } from "@/lib/format"
import { useTranslations } from "@/lib/i18n"
import type { RealizationAllocationView, RealizationView, TaxComponent, TransactionTaxEvent, TransactionView } from "@/lib/types"

const TAX_COMPONENT_LABEL: Record<TaxComponent, string> = {
  capital_income: "Capital income tax",
  church: "Church tax",
  foreign_withholding: "Foreign withholding",
  generic: "Broker tax / correction",
  solidarity: "Solidarity surcharge",
}

interface AssetTransactionsTableProperties {
  allocations: RealizationAllocationView | null
  assetType: string
  currency: string
  locale: string
  portfolioId: string
  positionId: string
  realizations?: RealizationView | null
  reportingCurrency: string
  transactions: TransactionView[]
}

/** Authoritative per-lot fee share keyed by `${sellId}|${buyId}` (theme 3). */
function lotFeeIndex(realizations: RealizationView | null | undefined): Map<string, number> {
  const index = new Map<string, number>()
  for (const sell of realizations?.sells ?? []) {
    for (const lot of sell.lots) {
      const fee = (parseFloat(lot.buy_fee_share) || 0) + (parseFloat(lot.sell_fee_share) || 0)
      index.set(`${sell.sell_transaction_id}|${lot.buy_transaction_id}`, fee)
    }
  }
  return index
}

export function AssetTransactionsTable({
  allocations,
  assetType,
  currency,
  locale,
  portfolioId,
  positionId,
  realizations,
  reportingCurrency,
  transactions,
}: AssetTransactionsTableProperties) {
  const translations = useTranslations()
  const storageKey = `portfolio-transaction-sells:${positionId}`
  const [collapsedSells, setCollapsedSells] = useState<Set<string>>(new Set())
  const [expandedTax, setExpandedTax] = useState<Set<string>>(new Set())
  const [storageReady, setStorageReady] = useState(false)

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

  function toggleTax(id: string) {
    setExpandedTax((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  if (transactions.length === 0) {
    return <p className="px-4 py-8 text-center text-[12px] font-medium text-[var(--app-text-faint)]">{translations("transactions.empty")}</p>
  }

  const effectiveAllocations = completeAllocations(transactions, allocations)
  const lotFees = lotFeeIndex(realizations)
  const allocatedBuyIds = new Set(effectiveAllocations.lot_allocations.map((row) => row.buy_transaction_id))
  const fullyConsumedBuyIds = new Set(
    transactions
      .filter((transaction) => transaction.side === "buy" && allocatedBuyIds.has(transaction.id) && transaction.performance.remaining_quantity !== null && parseFloat(transaction.performance.remaining_quantity) === 0)
      .map((transaction) => transaction.id),
  )
  const visibleTransactions = transactions.filter((transaction) => transaction.side === "sell" || !fullyConsumedBuyIds.has(transaction.id))
  const isAverageCost = effectiveAllocations.accounting_method === "average_cost"

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1040px] table-fixed text-[12px]">
        <thead>
          <tr className="border-b border-[var(--app-border)] bg-[var(--app-surface-inset)] text-left text-[10.5px] font-semibold text-[var(--app-text-faint)]">
            <th className="w-30 px-4 py-2">{translations("transactions.date")}</th>
            <th className="w-28 px-3 py-2">{translations("transactions.side")}</th>
            <th className="w-24 px-3 py-2 text-right">{translations("transactions.qty")}</th>
            <th className="w-32 px-3 py-2 text-right">{translations("transactions.price")}</th>
            <th className="w-28 px-3 py-2 text-right">{translations("transactions.fee")}</th>
            <th className="w-34 px-3 py-2 text-right" title={translations("transactions.pnlInReporting", { currency: reportingCurrency })}>{translations("transactions.realizedPnl")}</th>
            <th className="w-34 px-3 py-2 text-right" title={isAverageCost ? translations("transactions.avgCostNoUnrealized") : translations("transactions.pnlInReporting", { currency: reportingCurrency })}>{translations("transactions.unrealizedPnl")}</th>
            <th className="px-3 py-2">{translations("transactions.note")}</th>
            <th className="w-24 px-3 py-2 text-right" />
          </tr>
        </thead>
        <tbody className="divide-y divide-[var(--app-border)]">
          {visibleTransactions.map((transaction) => {
            const lotRows = effectiveAllocations.lot_allocations.filter((row) => row.sell_transaction_id === transaction.id)
            const average = effectiveAllocations.average_cost_realizations.find((row) => row.sell_transaction_id === transaction.id)
            const hasChildren = transaction.side === "sell" && (lotRows.length > 0 || average !== undefined)
            const collapsed = storageReady && collapsedSells.has(transaction.id)
            const remainingQuantity = transaction.performance.remaining_quantity === null ? null : parseFloat(transaction.performance.remaining_quantity)
            const isOpenRemainder = transaction.side === "buy"
              && allocatedBuyIds.has(transaction.id)
              && remainingQuantity !== null
              && remainingQuantity > 0
              && remainingQuantity < parseFloat(transaction.quantity)

            return (
              <Fragment key={transaction.id}>
                <tr className="text-[var(--app-text)] transition hover:bg-[var(--app-surface-hover)]">
                  <td className="relative whitespace-nowrap px-4 py-2.5 tabular-nums text-[var(--app-text-muted)]">
                    {hasChildren ? (
                      <button
                        aria-expanded={!collapsed}
                        className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded border border-[var(--app-border)] text-[var(--app-text-faint)] transition hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
                        onClick={() => toggleSell(transaction.id)}
                        title={collapsed ? "Show consumed lots" : "Hide consumed lots"}
                        type="button"
                      >
                        <ChevronIcon collapsed={collapsed} />
                      </button>
                    ) : (
                      <span className="mr-2 inline-flex h-5 w-5" />
                    )}
                    {formatDate(locale, transaction.effective_at)}
                  </td>
                  <td className="px-3 py-2.5">
                    <SideBadge isOpenRemainder={isOpenRemainder} side={transaction.side} />
                    {transaction.savings_plan ? <span className="ml-1.5 text-[10.5px] font-semibold text-[var(--app-accent)]">{translations("transactions.plan")}</span> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums" title={isOpenRemainder ? `Remaining from original buy quantity ${fmtQty(locale, parseFloat(transaction.quantity), assetType)}` : undefined}>
                    {fmtQty(locale, (isOpenRemainder ? remainingQuantity : parseFloat(transaction.quantity)) ?? 0, assetType)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">
                    {fmtPrice(locale, parseFloat(transaction.price), transaction.currency, assetType)}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-[var(--app-text-faint)]">
                    {!isOpenRemainder && parseFloat(transaction.fee) > 0 ? `${parseFloat(transaction.fee).toLocaleString(locale, { minimumFractionDigits: 2 })} ${transaction.currency}` : null}
                  </td>
                  <PnlCell currency={transaction.currency} displayCurrency={reportingCurrency} locale={locale} native={transaction.performance.realized_pnl} value={transaction.performance.realized_pnl_reporting} />
                  <PnlCell
                    currency={transaction.currency}
                    displayCurrency={reportingCurrency}
                    locale={locale}
                    native={transaction.performance.unrealized_pnl}
                    title={transaction.performance.remaining_quantity !== null && parseFloat(transaction.performance.remaining_quantity) > 0 ? `${fmtQty(locale, parseFloat(transaction.performance.remaining_quantity), assetType)} ${translations("transactions.qty").toLowerCase()}` : undefined}
                    value={transaction.performance.unrealized_pnl_reporting}
                  />
                  <td className="min-w-0 px-3 py-2.5 text-[var(--app-text-muted)]">
                    <span className="block truncate">{transaction.note}</span>
                    {isOpenRemainder ? <span className="mt-0.5 block text-[10px] text-[var(--app-text-faint)]">Open remainder of the original buy transaction</span> : null}
                    {transaction.tax_events.length > 0 ? (
                      <button
                        aria-expanded={expandedTax.has(transaction.id)}
                        className="mt-0.5 block text-left text-[10px] font-medium text-[var(--app-text-faint)] transition hover:text-[var(--app-text-muted)]"
                        onClick={() => toggleTax(transaction.id)}
                        title={translations("transactions.linkedTax")}
                        type="button"
                      >
                        <span className="mr-1 inline-block"><ChevronIcon collapsed={!expandedTax.has(transaction.id)} /></span>
                        {[...netTaxByCurrency(transaction.tax_events)].map(([eventCurrency, net], index) => (
                          <span className={index > 0 ? "ml-2" : ""} key={eventCurrency}>
                            {translations("transactions.tax")}: {net > 0 ? "-" : net < 0 ? "+" : ""}{Math.abs(net).toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} {eventCurrency}
                          </span>
                        ))}
                        <span className="ml-1 text-[var(--app-border-strong)]">- {transaction.tax_events.length}</span>
                      </button>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <TaxEventModal currency={transaction.currency} portfolioId={portfolioId} positionId={positionId} transactionId={transaction.id} />
                      <EditTransactionModal currency={currency} positionId={positionId} transaction={transaction} />
                    </div>
                  </td>
                </tr>
                {hasChildren && !collapsed ? (
                  <AllocationRows
                    allocations={effectiveAllocations}
                    assetType={assetType}
                    average={average}
                    currency={currency}
                    locale={locale}
                    lotFees={lotFees}
                    lots={lotRows}
                    reportingCurrency={reportingCurrency}
                    sell={transaction}
                    source={realizations?.source ?? null}
                    transactions={transactions}
                  />
                ) : null}
                {transaction.tax_events.length > 0 && expandedTax.has(transaction.id) ? <TaxEventRows events={transaction.tax_events} locale={locale} positionId={positionId} /> : null}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AllocationRows({
  allocations,
  assetType,
  average,
  currency,
  locale,
  lotFees,
  lots,
  reportingCurrency,
  sell,
  source,
  transactions,
}: {
  allocations: RealizationAllocationView | null
  assetType: string
  average: RealizationAllocationView["average_cost_realizations"][number] | undefined
  currency: string
  locale: string
  lotFees: Map<string, number>
  lots: RealizationAllocationView["lot_allocations"]
  reportingCurrency: string
  sell: TransactionView
  source: "persisted" | "derived" | null
  transactions: TransactionView[]
}) {
  const byId = new Map(transactions.map((transaction) => [transaction.id, transaction]))
  const displayedTotal = numberOrNull(sell.performance.realized_pnl_reporting) ?? numberOrNull(sell.performance.realized_pnl)
  const displayedCurrency = sell.performance.realized_pnl_reporting !== null ? reportingCurrency : sell.currency

  if (average) {
    return (
      <tr className="bg-[color-mix(in_srgb,var(--app-surface-raised)_76%,var(--app-surface-panel))] text-[10.5px] text-[var(--app-text-muted)]">
        <td className="px-4 py-2" colSpan={2}>
          <span className="mr-2 text-[var(--app-accent)]">Average cost pool</span>
          <span className="text-[var(--app-text-faint)]">{source === "persisted" ? `persisted${allocations?.calculation_version ? ` (calc ${allocations.calculation_version})` : ""}` : source === "derived" ? "derived from ledger" : allocations?.calculation_version ? `calculation ${allocations.calculation_version}` : "derived from ledger"}</span>
        </td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtQty(locale, parseFloat(average.quantity), assetType)}</td>
        <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(locale, parseFloat(average.average_cost_basis), sell.currency, assetType)}</td>
        <td />
        <AllocatedPnlCell currency={displayedCurrency} locale={locale} total={displayedTotal} value={displayedTotal} />
        <td />
        <td className="px-3 py-2 text-[var(--app-text-faint)]">Average-cost accounting consumes from one weighted pool, so no individual buy lot is shown.</td>
        <td />
      </tr>
    )
  }

  const allocatedPnls = allocateLotPnl(sell, lots, byId, reportingCurrency)

  return (
    <>
      {lots.map((lot, index) => {
        const buy = byId.get(lot.buy_transaction_id)
        if (!buy) return null
        const allocatedPnl = allocatedPnls[index]
        const lotFee = lotFees.get(`${lot.sell_transaction_id}|${lot.buy_transaction_id}`)
        return (
          <tr className="bg-[color-mix(in_srgb,var(--app-surface-raised)_76%,var(--app-surface-panel))] text-[10.5px] text-[var(--app-text-muted)]" key={`${lot.sell_transaction_id}-${lot.buy_transaction_id}`}>
            <td className="px-4 py-2 pl-12 tabular-nums">{formatDate(locale, buy.effective_at)}</td>
            <td className="px-3 py-2"><span className="rounded border border-[var(--app-border)] px-1.5 py-0.5 text-[9px] font-semibold uppercase text-[var(--app-text-faint)]">Consumed buy</span></td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtQty(locale, parseFloat(lot.quantity), assetType)}</td>
            <td className="px-3 py-2 text-right tabular-nums">{fmtPrice(locale, parseFloat(buy.price), buy.currency, assetType)}</td>
            <td className="px-3 py-2 text-right tabular-nums text-[var(--app-text-faint)]" title={lotFee !== undefined ? "Proportional buy + sell fee for this consumed lot" : undefined}>
              {lotFee !== undefined && lotFee > 0 ? `${lotFee.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}` : null}
            </td>
            <AllocatedPnlCell currency={allocatedPnl?.currency ?? displayedCurrency} locale={locale} total={allocatedPnl?.total ?? null} value={allocatedPnl?.value ?? null} />
            <td />
            <td className="truncate px-3 py-2 text-[var(--app-text-faint)]">{buy.note}</td>
            <td />
          </tr>
        )
      })}
    </>
  )
}

function TaxEventRows({ events, locale, positionId }: { events: TransactionTaxEvent[]; locale: string; positionId: string }) {
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
      <td className="px-5 py-2" colSpan={9}>
        <ul className="space-y-1">
          {events.map((event) => {
            const amount = parseFloat(event.amount)
            const signedTone = event.direction === "withheld" ? "text-[var(--app-negative)]" : "text-[var(--app-positive)]"
            return (
              <li className="flex items-center justify-between gap-3 rounded-md border border-[var(--app-border)] px-3 py-1.5 text-[10px]" key={event.id}>
                <div className="min-w-0">
                  <span className="font-medium text-[var(--app-text)]">{TAX_COMPONENT_LABEL[event.component]}</span>
                  <span className={`ml-2 rounded px-1.5 py-0.5 text-[8px] font-semibold uppercase ${event.direction === "withheld" ? "bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] text-[var(--app-negative)]" : "bg-[color-mix(in_srgb,var(--app-positive)_12%,transparent)] text-[var(--app-positive)]"}`}>{event.direction}</span>
                  <span className="ml-2 text-[var(--app-text-faint)]">{event.booking_date}</span>
                  {event.note ? <span className="ml-2 text-[var(--app-text-faint)]">- {event.note}</span> : null}
                </div>
                <div className="flex items-center gap-3 whitespace-nowrap">
                  <span className={`tabular-nums ${signedTone}`}>
                    {event.direction === "withheld" ? "-" : "+"}{Math.abs(amount).toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} {event.currency}
                  </span>
                  <TaxEventModal
                    currency={event.currency}
                    event={{
                      amount: event.amount,
                      booking_date: event.booking_date,
                      component: event.component,
                      currency: event.currency,
                      direction: event.direction,
                      id: event.id,
                      note: event.note,
                      position_id: positionId,
                    }}
                  />
                  <button
                    aria-label="Delete tax event"
                    className="text-[var(--app-text-faint)] transition hover:text-[var(--app-negative)] disabled:opacity-50"
                    disabled={busy === event.id}
                    onClick={() => remove(event.id)}
                    title="Delete tax event"
                    type="button"
                  >
                    x
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

function SideBadge({ isOpenRemainder, side }: { isOpenRemainder: boolean; side: TransactionView["side"] }) {
  const isBuy = side === "buy"
  return (
    <span className={`inline-flex min-w-11 items-center justify-center rounded-md border px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.08em] ${isBuy ? "border-[color-mix(in_srgb,var(--app-positive)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_10%,transparent)] text-[var(--app-positive)]" : "border-[color-mix(in_srgb,var(--app-negative)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] text-[var(--app-negative)]"}`}>
      {isOpenRemainder ? "Open buy" : side}
    </span>
  )
}

function PnlCell({
  currency,
  displayCurrency,
  locale,
  native,
  title,
  value,
}: {
  currency: string
  displayCurrency: string
  locale: string
  native: string | null
  title?: string
  value: string | null
}) {
  if (value === null) return <td className="w-32 whitespace-nowrap px-3 py-2.5 text-right tabular-nums" />
  const parsed = parseFloat(value)
  const tone = parsed > 0 ? "text-[var(--app-positive)]" : parsed < 0 ? "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"
  const nativeHint = native !== null ? `${parseFloat(native).toLocaleString(locale, { minimumFractionDigits: 2 })} ${currency}` : undefined

  return (
    <td className={`w-32 whitespace-nowrap px-3 py-2.5 text-right tabular-nums ${tone}`} title={[title, nativeHint].filter(Boolean).join(" - ") || undefined}>
      {parsed > 0 ? "+" : ""}{parsed.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} <span className="text-[var(--app-text-faint)]">{displayCurrency}</span>
    </td>
  )
}

function AllocatedPnlCell({ currency, locale, total, value }: { currency: string; locale: string; total: number | null; value: number | null }) {
  if (value === null) return <td className="w-32 px-3 py-2" />
  const tone = value > 0 ? "text-[var(--app-positive)]" : value < 0 ? "text-[var(--app-negative)]" : "text-[var(--app-text-muted)]"
  const fraction = total !== null && Math.abs(total) > 1e-12 ? value / total * 100 : null

  return (
    <td className={`w-32 whitespace-nowrap px-3 py-2 text-right tabular-nums ${tone}`} title={`Allocated fraction of sell realized P&L in ${currency}`}>
      <span className="block">{value > 0 ? "+" : ""}{value.toLocaleString(locale, { maximumFractionDigits: 2, minimumFractionDigits: 2 })} <span className="text-[var(--app-text-faint)]">{currency}</span></span>
      {fraction !== null ? <span className="mt-0.5 block text-[8px] text-[var(--app-text-faint)]">{fraction.toLocaleString(locale, { maximumFractionDigits: 1 })}% of sell P&L</span> : null}
    </td>
  )
}

function completeAllocations(transactions: TransactionView[], persisted: RealizationAllocationView | null): RealizationAllocationView {
  if (persisted && (persisted.lot_allocations.length > 0 || persisted.average_cost_realizations.length > 0)) return persisted
  const method = transactions[0]?.performance.attribution ?? null
  if (!method) return emptyAllocations()

  if (method === "average_cost") {
    return {
      accounting_method: method,
      average_cost_realizations: transactions.flatMap((transaction) => {
        if (transaction.side !== "sell" || transaction.performance.consumed_cost_basis === null) return []
        const quantity = parseFloat(transaction.quantity)
        return [{
          average_cost_basis: quantity > 0 ? String(parseFloat(transaction.performance.consumed_cost_basis) / quantity) : "0",
          quantity: transaction.quantity,
          sell_transaction_id: transaction.id,
        }]
      }),
      calculation_version: persisted?.calculation_version ?? null,
      lot_allocations: [],
      position_id: persisted?.position_id ?? "",
    }
  }

  const lots: { id: string; remaining: number }[] = []
  const derived: RealizationAllocationView["lot_allocations"] = []
  for (const transaction of transactions) {
    if (transaction.side === "buy") {
      lots.push({ id: transaction.id, remaining: parseFloat(transaction.quantity) })
      continue
    }

    let remainingToSell = parseFloat(transaction.quantity)
    while (remainingToSell > 1e-10) {
      const index = method === "fifo" ? 0 : lots.length - 1
      const lot = lots[index]
      if (!lot) break
      const consumed = Math.min(lot.remaining, remainingToSell)
      derived.push({ buy_transaction_id: lot.id, quantity: String(consumed), sell_transaction_id: transaction.id })
      lot.remaining -= consumed
      remainingToSell -= consumed
      if (lot.remaining <= 1e-10) lots.splice(index, 1)
    }
  }

  return {
    accounting_method: method,
    average_cost_realizations: [],
    calculation_version: persisted?.calculation_version ?? null,
    lot_allocations: derived,
    position_id: persisted?.position_id ?? "",
  }
}

function emptyAllocations(): RealizationAllocationView {
  return { accounting_method: null, average_cost_realizations: [], calculation_version: null, lot_allocations: [], position_id: "" }
}

function allocateLotPnl(
  sell: TransactionView,
  lots: RealizationAllocationView["lot_allocations"],
  byId: Map<string, TransactionView>,
  reportingCurrency: string,
): { currency: string; total: number; value: number }[] {
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
  return values.map((value) => ({ currency, total, value }))
}

function netTaxByCurrency(events: TransactionTaxEvent[]): Map<string, number> {
  const out = new Map<string, number>()
  for (const event of events) {
    const signed = (event.direction === "withheld" ? 1 : -1) * parseFloat(event.amount)
    out.set(event.currency, (out.get(event.currency) ?? 0) + signed)
  }
  return out
}

function numberOrNull(value: string | null): number | null {
  if (value === null) return null
  const parsed = parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}

function formatDate(locale: string, value: string): string {
  return new Date(value).toLocaleDateString(locale, { day: "2-digit", month: "2-digit", year: "numeric" })
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="h-3 w-3" fill="none" viewBox="0 0 16 16">
      <path d={collapsed ? "M6 3.5 10.5 8 6 12.5" : "M3.5 6 8 10.5 12.5 6"} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}
