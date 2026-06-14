import type Decimal from 'decimal.js';
import { D, dec } from './money.js';

export type AccountingMethod = 'fifo' | 'lifo' | 'average_cost';

/** A single authoritative trade record in ledger order. */
export interface LedgerTransaction {
  /**
   * Originating transaction ID. Optional on the minimal ledger contract, but
   * always present on stored transactions; used to attribute per-transaction
   * realized/unrealized P&L back to the row it came from.
   */
  id?: string;
  side: 'buy' | 'sell';
  quantity: string;
  price: string;
  fee: string;
  /**
   * Trade currency and tax-relevant value date. Optional on the minimal ledger
   * contract, but always present on stored transactions; used to convert
   * realized amounts and fees at the historical FX rate of their value date.
   */
  currency?: string;
  tax_relevant_value_date?: string;
}

/** An amount tagged with the currency and value date at which it was realized. */
export interface DatedAmount {
  amount: Decimal;
  currency: string;
  valueDate: string;
}

/**
 * One buy lot consumed by one sell under FIFO/LIFO — the durable, persistable
 * unit of realized-gain attribution. Quantity is the amount of the buy lot the
 * sell consumed; cost is derivable from the buy transaction. Not produced under
 * average cost (basis is pooled, so there is no buy-lot identity).
 */
export interface LotConsumption {
  sellTransactionId: string;
  buyTransactionId: string;
  quantity: Decimal;
}

/**
 * Per-transaction attribution of the realization replay, in the trade currency.
 * A sell carries its realized P&L and the cost basis/quantity it consumed; a buy
 * carries the still-open remainder of its lot. Under FIFO/LIFO a buy lot's
 * identity is meaningful, so `remaining*` is authoritative; under average cost
 * the basis is pooled, so buy remainders are left null (only sell realized P&L
 * is attributable). Fields that do not apply to a given row are null.
 */
export interface TransactionRealization {
  transactionId: string;
  side: 'buy' | 'sell';
  /** Sell: realized P&L (proceeds − fee − consumed cost). Null for buys. */
  realizedPnl: Decimal | null;
  /** Sell: cost basis consumed by this sell. Null for buys. */
  consumedCostBasis: Decimal | null;
  /** Sell: quantity sold by this transaction. Null for buys. */
  consumedQuantity: Decimal | null;
  /** Buy (FIFO/LIFO): remaining open quantity of this lot. Null for sells / average cost. */
  remainingQuantity: Decimal | null;
  /** Buy (FIFO/LIFO): cost basis of the remaining open quantity (incl. proportional fee). Null otherwise. */
  remainingCostBasis: Decimal | null;
  /** Trade currency + value date, for converting the realized amount at its historical rate. */
  currency: string;
  valueDate: string;
  /** The accounting method this attribution was produced under. */
  method: AccountingMethod;
}

export interface RealizationResult {
  /** True when a sell consumed more quantity than was available at that point. */
  invalid: boolean;
  /** Remaining open quantity (held shares). */
  openQuantity: Decimal;
  /** Cost basis of the remaining open quantity, in the trade currency. */
  openCostBasis: Decimal;
  /** Realized profit/loss from all sells, in the trade currency. */
  realizedPnl: Decimal;
  /**
   * Cost basis of the shares that were sold (sum of consumed-lot cost across all
   * sells, fee-inclusive), in the trade currency. The denominator for a realized
   * return percentage. Zero when nothing has been sold.
   */
  realizedCostBasis: Decimal;
  /** Gross purchase consideration of every buy, excluding fees. */
  totalContributedCapital: Decimal;
  /** Gross sell proceeds, excluding fees. */
  grossSellProceeds: Decimal;
  /** All buy and sell fees combined. */
  totalFees: Decimal;
  /** Realized P&L per sell, tagged with the sell's currency + value date. */
  realizedByDate: DatedAmount[];
  /** Fee per transaction (buy and sell), tagged with currency + value date. */
  feesByDate: DatedAmount[];
  /** Per-transaction attribution (one entry per transaction), in trade currency. */
  byTransaction: TransactionRealization[];
  /** Buy-lot consumptions per sell (FIFO/LIFO only; empty for average cost). */
  lotConsumptions: LotConsumption[];
}

interface OpenLot {
  transactionId: string;
  quantity: Decimal;
  /** Per-share cost including a proportional share of the buy fee. */
  unitCost: Decimal;
}

/**
 * Replays the ordered position ledger under the selected accounting method and
 * derives realized P&L, remaining open quantity, and open cost basis. The
 * authoritative transactions are never mutated; this is a reproducible,
 * derived calculation. A sell that exceeds available quantity marks the result
 * invalid and stops further derivation, mirroring the invalid-position rule.
 */
export function computeRealization(
  transactions: LedgerTransaction[],
  method: AccountingMethod,
): RealizationResult {
  if (method === 'average_cost') return averageCost(transactions);
  return fifoLifo(transactions, method);
}

function fifoLifo(transactions: LedgerTransaction[], method: 'fifo' | 'lifo'): RealizationResult {
  const lots: OpenLot[] = [];
  // Every buy lot in ledger order, kept by reference even after it leaves the
  // active queue, so the final remaining quantity (possibly zero) is readable.
  const allLots: { tx: LedgerTransaction; lot: OpenLot }[] = [];
  const sells: { tx: LedgerTransaction; realized: Decimal; consumedCost: Decimal; consumedQty: Decimal }[] = [];
  let realizedPnl = new D(0);
  let realizedCostBasis = new D(0);
  let totalContributedCapital = new D(0);
  let grossSellProceeds = new D(0);
  let totalFees = new D(0);
  const realizedByDate: DatedAmount[] = [];
  const feesByDate: DatedAmount[] = [];
  const lotConsumptions: LotConsumption[] = [];

  for (const tx of transactions) {
    const qty = dec(tx.quantity);
    const price = dec(tx.price);
    const fee = dec(tx.fee);
    totalFees = totalFees.plus(fee);
    if (fee.gt(0)) feesByDate.push(datedAmount(fee, tx));

    if (tx.side === 'buy') {
      totalContributedCapital = totalContributedCapital.plus(qty.times(price));
      const unitCost = qty.gt(0) ? qty.times(price).plus(fee).div(qty) : new D(0);
      const lot: OpenLot = { transactionId: tx.id ?? '', quantity: qty, unitCost };
      lots.push(lot);
      allLots.push({ tx, lot });
      continue;
    }

    // sell
    grossSellProceeds = grossSellProceeds.plus(qty.times(price));
    let remainingToSell = qty;
    let consumedCost = new D(0);
    while (remainingToSell.gt(0)) {
      const lot = method === 'fifo' ? lots[0] : lots[lots.length - 1];
      if (!lot) {
        // Oversell: more sold than held at this point in history.
        return invalidResult(totalContributedCapital, grossSellProceeds, totalFees);
      }
      const take = D.min(lot.quantity, remainingToSell);
      consumedCost = consumedCost.plus(take.times(lot.unitCost));
      lotConsumptions.push({ sellTransactionId: tx.id ?? '', buyTransactionId: lot.transactionId, quantity: take });
      lot.quantity = lot.quantity.minus(take);
      remainingToSell = remainingToSell.minus(take);
      if (lot.quantity.lte(0)) {
        if (method === 'fifo') lots.shift();
        else lots.pop();
      }
    }
    // Realized P&L = proceeds - sell fee - cost of consumed lots.
    const sellRealized = qty.times(price).minus(fee).minus(consumedCost);
    realizedPnl = realizedPnl.plus(sellRealized);
    realizedCostBasis = realizedCostBasis.plus(consumedCost);
    realizedByDate.push(datedAmount(sellRealized, tx));
    sells.push({ tx, realized: sellRealized, consumedCost, consumedQty: qty });
  }

  const openQuantity = lots.reduce((s, l) => s.plus(l.quantity), new D(0));
  const openCostBasis = lots.reduce((s, l) => s.plus(l.quantity.times(l.unitCost)), new D(0));

  const byTransaction: TransactionRealization[] = [
    ...allLots.map(({ tx, lot }) => buyAttribution(tx, lot.quantity, lot.quantity.times(lot.unitCost), method)),
    ...sells.map((s) => sellAttribution(s.tx, s.realized, s.consumedCost, s.consumedQty, method)),
  ];

  return {
    invalid: false,
    openQuantity,
    openCostBasis,
    realizedPnl,
    realizedCostBasis,
    totalContributedCapital,
    grossSellProceeds,
    totalFees,
    realizedByDate,
    feesByDate,
    byTransaction,
    lotConsumptions,
  };
}

function averageCost(transactions: LedgerTransaction[]): RealizationResult {
  let openQuantity = new D(0);
  let openCostBasis = new D(0); // running cost of held shares (incl. buy fees)
  let realizedPnl = new D(0);
  let realizedCostBasis = new D(0);
  let totalContributedCapital = new D(0);
  let grossSellProceeds = new D(0);
  let totalFees = new D(0);
  const realizedByDate: DatedAmount[] = [];
  const feesByDate: DatedAmount[] = [];
  const byTransaction: TransactionRealization[] = [];

  for (const tx of transactions) {
    const qty = dec(tx.quantity);
    const price = dec(tx.price);
    const fee = dec(tx.fee);
    totalFees = totalFees.plus(fee);
    if (fee.gt(0)) feesByDate.push(datedAmount(fee, tx));

    if (tx.side === 'buy') {
      totalContributedCapital = totalContributedCapital.plus(qty.times(price));
      openCostBasis = openCostBasis.plus(qty.times(price)).plus(fee);
      openQuantity = openQuantity.plus(qty);
      // Pooled cost basis: a per-buy open remainder is not authoritative.
      byTransaction.push(buyAttribution(tx, null, null, 'average_cost'));
      continue;
    }

    grossSellProceeds = grossSellProceeds.plus(qty.times(price));
    if (qty.gt(openQuantity)) {
      return invalidResult(totalContributedCapital, grossSellProceeds, totalFees);
    }
    const avgUnitCost = openQuantity.gt(0) ? openCostBasis.div(openQuantity) : new D(0);
    const consumedCost = qty.times(avgUnitCost);
    const sellRealized = qty.times(price).minus(fee).minus(consumedCost);
    realizedPnl = realizedPnl.plus(sellRealized);
    realizedCostBasis = realizedCostBasis.plus(consumedCost);
    realizedByDate.push(datedAmount(sellRealized, tx));
    byTransaction.push(sellAttribution(tx, sellRealized, consumedCost, qty, 'average_cost'));
    openQuantity = openQuantity.minus(qty);
    openCostBasis = openCostBasis.minus(consumedCost);
  }

  return {
    invalid: false,
    openQuantity,
    openCostBasis,
    realizedPnl,
    realizedCostBasis,
    totalContributedCapital,
    grossSellProceeds,
    totalFees,
    realizedByDate,
    feesByDate,
    byTransaction,
    lotConsumptions: [],
  };
}

/** Tags an amount with the transaction's trade currency and value date. */
function datedAmount(amount: Decimal, tx: LedgerTransaction): DatedAmount {
  return { amount, currency: tx.currency ?? '', valueDate: tx.tax_relevant_value_date ?? '' };
}

/** Per-sell attribution record (realized side populated, open side null). */
function sellAttribution(
  tx: LedgerTransaction,
  realized: Decimal,
  consumedCost: Decimal,
  consumedQty: Decimal,
  method: AccountingMethod,
): TransactionRealization {
  return {
    transactionId: tx.id ?? '',
    side: 'sell',
    realizedPnl: realized,
    consumedCostBasis: consumedCost,
    consumedQuantity: consumedQty,
    remainingQuantity: null,
    remainingCostBasis: null,
    currency: tx.currency ?? '',
    valueDate: tx.tax_relevant_value_date ?? '',
    method,
  };
}

/** Per-buy attribution record (open side populated for FIFO/LIFO, null for average cost). */
function buyAttribution(
  tx: LedgerTransaction,
  remainingQty: Decimal | null,
  remainingCost: Decimal | null,
  method: AccountingMethod,
): TransactionRealization {
  return {
    transactionId: tx.id ?? '',
    side: 'buy',
    realizedPnl: null,
    consumedCostBasis: null,
    consumedQuantity: null,
    remainingQuantity: remainingQty,
    remainingCostBasis: remainingCost,
    currency: tx.currency ?? '',
    valueDate: tx.tax_relevant_value_date ?? '',
    method,
  };
}

function invalidResult(
  totalContributedCapital: Decimal,
  grossSellProceeds: Decimal,
  totalFees: Decimal,
): RealizationResult {
  return {
    invalid: true,
    openQuantity: new D(0),
    openCostBasis: new D(0),
    realizedPnl: new D(0),
    realizedCostBasis: new D(0),
    totalContributedCapital,
    grossSellProceeds,
    totalFees,
    realizedByDate: [],
    feesByDate: [],
    byTransaction: [],
    lotConsumptions: [],
  };
}
