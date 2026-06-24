import { D, dec, type Money } from './money.js';
import type { AccountingMethod, LedgerTransaction, RealizationResult } from './realization.js';

/**
 * UI-ready realization rows derived authoritatively from the realization engine,
 * so a sell is explainable without the frontend reconstructing it from the raw
 * ledger. FIFO/LIFO sells carry their consumed buy lots; average-cost sells carry
 * the pooled cost basis instead of synthetic buy lots. All amounts are decimal
 * strings in the position's trade currency.
 */
export interface RealizationLotRow {
  buy_transaction_id: string;
  acquisition_date: string;
  buy_price: string | null;
  consumed_quantity: string;
  /** Consumed cost basis incl. the lot's proportional buy fee. */
  cost_basis: string;
  /** Portion of the buy fee embedded in `cost_basis`. */
  buy_fee_share: string;
  /** Portion of the sell fee attributed to this consumed quantity. */
  sell_fee_share: string;
  realized_pnl: string;
}

export interface RealizationSellRow {
  sell_transaction_id: string;
  disposal_date: string;
  currency: string;
  quantity: string;
  price: string;
  proceeds: string;
  sell_fee: string;
  consumed_cost_basis: string;
  realized_pnl: string;
  /** Average-cost only: pooled cost basis per share consumed; null for FIFO/LIFO. */
  average_cost_basis: string | null;
  /** FIFO/LIFO only: the buy lots this sell consumed; empty for average cost. */
  lots: RealizationLotRow[];
}

export interface RealizationView {
  position_id: string;
  accounting_method: AccountingMethod | null;
  calculation_version: string | null;
  /** Whether these rows match the persisted allocations or were only re-derived. */
  source: 'persisted' | 'derived';
  sells: RealizationSellRow[];
}

const s = (value: { toString(): string }): string => value.toString();

/**
 * Builds the enriched per-sell realization view from the engine result + the raw
 * ledger. Per-lot cost basis is recovered from the engine's realized P&L
 * (`cost = proceeds − sellFeeShare − realizedGainLoss`), so it stays consistent
 * with split-adjusted unit costs without re-deriving them here.
 */
export function buildRealizationView(input: {
  positionId: string;
  transactions: LedgerTransaction[];
  result: RealizationResult;
  method: AccountingMethod;
  calculationVersion: string | null;
}): RealizationView {
  const { positionId, transactions, result, method, calculationVersion } = input;
  const txById = new Map(transactions.filter((t) => t.id).map((t) => [t.id as string, t]));
  const sells =
    method === 'average_cost'
      ? buildAverageCostSells(transactions, result)
      : buildLotSells(transactions, result, txById);

  return {
    position_id: positionId,
    accounting_method: method,
    calculation_version: calculationVersion,
    source: calculationVersion === null ? 'derived' : 'persisted',
    sells,
  };
}

function buildLotSells(
  transactions: LedgerTransaction[],
  result: RealizationResult,
  txById: Map<string, LedgerTransaction>,
): RealizationSellRow[] {
  const bySell = new Map<string, RealizationLotRow[]>();
  for (const lc of result.lotConsumptions) {
    const sellTx = txById.get(lc.sellTransactionId);
    const buyTx = txById.get(lc.buyTransactionId);
    if (!sellTx) continue;
    const sellQty = dec(sellTx.quantity);
    const sellFee = dec(sellTx.fee);
    const consumed = lc.quantity;
    const sellFeeShare = sellQty.gt(0) ? sellFee.times(consumed).div(sellQty) : new D(0);
    const proceedsShare = consumed.times(dec(sellTx.price));
    // cost = proceeds − sellFeeShare − realized (the engine's consumed cost for this lot)
    const costBasis = proceedsShare.minus(sellFeeShare).minus(lc.realizedGainLoss);
    const buyFeeShare = buyFeePortion(buyTx, costBasis);

    const row: RealizationLotRow = {
      buy_transaction_id: lc.buyTransactionId,
      acquisition_date: lc.acquisitionDate,
      buy_price: buyTx ? s(dec(buyTx.price)) : null,
      consumed_quantity: s(consumed),
      cost_basis: s(costBasis),
      buy_fee_share: s(buyFeeShare),
      sell_fee_share: s(sellFeeShare),
      realized_pnl: s(lc.realizedGainLoss),
    };
    const list = bySell.get(lc.sellTransactionId) ?? [];
    list.push(row);
    bySell.set(lc.sellTransactionId, list);
  }

  const rows: RealizationSellRow[] = [];
  for (const [sellId, lots] of bySell) {
    const sellTx = txById.get(sellId);
    if (!sellTx) continue;
    const consumedCost = lots.reduce((sum, l) => sum.plus(dec(l.cost_basis)), new D(0));
    const realized = lots.reduce((sum, l) => sum.plus(dec(l.realized_pnl)), new D(0));
    rows.push({
      sell_transaction_id: sellId,
      disposal_date: sellTx.tax_relevant_value_date ?? '',
      currency: sellTx.currency ?? '',
      quantity: s(dec(sellTx.quantity)),
      price: s(dec(sellTx.price)),
      proceeds: s(dec(sellTx.quantity).times(dec(sellTx.price))),
      sell_fee: s(dec(sellTx.fee)),
      consumed_cost_basis: s(consumedCost),
      realized_pnl: s(realized),
      average_cost_basis: null,
      lots,
    });
  }
  return rows;
}

function buildAverageCostSells(transactions: LedgerTransaction[], result: RealizationResult): RealizationSellRow[] {
  const rows: RealizationSellRow[] = [];
  for (const attribution of result.byTransaction) {
    if (attribution.side !== 'sell' || attribution.consumedQuantity === null) continue;
    const tx = transactions.find((t) => t.id === attribution.transactionId);
    if (!tx) continue;
    const consumedQty = attribution.consumedQuantity;
    const consumedCost = attribution.consumedCostBasis ?? new D(0);
    const perShare = consumedQty.gt(0) ? consumedCost.div(consumedQty) : new D(0);
    rows.push({
      sell_transaction_id: attribution.transactionId,
      disposal_date: tx.tax_relevant_value_date ?? '',
      currency: tx.currency ?? '',
      quantity: s(dec(tx.quantity)),
      price: s(dec(tx.price)),
      proceeds: s(dec(tx.quantity).times(dec(tx.price))),
      sell_fee: s(dec(tx.fee)),
      consumed_cost_basis: s(consumedCost),
      realized_pnl: s(attribution.realizedPnl ?? new D(0)),
      average_cost_basis: s(perShare),
      lots: [],
    });
  }
  return rows;
}

/** The buy fee embedded in a consumed cost basis (cost × feeFraction of the buy). */
function buyFeePortion(buyTx: LedgerTransaction | undefined, costBasis: Money): Money {
  if (!buyTx) return new D(0);
  const gross = dec(buyTx.quantity).times(dec(buyTx.price));
  const fee = dec(buyTx.fee);
  const total = gross.plus(fee);
  const fraction = total.gt(0) ? fee.div(total) : new D(0);
  return costBasis.times(fraction);
}
