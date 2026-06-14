import type Decimal from 'decimal.js';
import { D, dec } from './money.js';

export type AccountingMethod = 'fifo' | 'lifo' | 'average_cost';

/** A single authoritative trade record in ledger order. */
export interface LedgerTransaction {
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
}

interface OpenLot {
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
  let realizedPnl = new D(0);
  let realizedCostBasis = new D(0);
  let totalContributedCapital = new D(0);
  let grossSellProceeds = new D(0);
  let totalFees = new D(0);
  const realizedByDate: DatedAmount[] = [];
  const feesByDate: DatedAmount[] = [];

  for (const tx of transactions) {
    const qty = dec(tx.quantity);
    const price = dec(tx.price);
    const fee = dec(tx.fee);
    totalFees = totalFees.plus(fee);
    if (fee.gt(0)) feesByDate.push(datedAmount(fee, tx));

    if (tx.side === 'buy') {
      totalContributedCapital = totalContributedCapital.plus(qty.times(price));
      const unitCost = qty.gt(0) ? qty.times(price).plus(fee).div(qty) : new D(0);
      lots.push({ quantity: qty, unitCost });
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
  }

  const openQuantity = lots.reduce((s, l) => s.plus(l.quantity), new D(0));
  const openCostBasis = lots.reduce((s, l) => s.plus(l.quantity.times(l.unitCost)), new D(0));

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
  };
}

/** Tags an amount with the transaction's trade currency and value date. */
function datedAmount(amount: Decimal, tx: LedgerTransaction): DatedAmount {
  return { amount, currency: tx.currency ?? '', valueDate: tx.tax_relevant_value_date ?? '' };
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
  };
}
