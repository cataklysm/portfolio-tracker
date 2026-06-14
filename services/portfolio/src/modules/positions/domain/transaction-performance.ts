import type Decimal from 'decimal.js';
import type { AccountingMethod, TransactionRealization } from './realization.js';

/**
 * Derived P&L attribution for a single transaction row. Trade-currency values
 * carry no `_reporting` suffix; the reporting-currency counterparts are
 * converted (realized at the sell's value-date rate, unrealized at the latest
 * rate, matching the position-level convention). Fields that do not apply to a
 * row are null so the frontend renders an empty cell.
 */
export interface TransactionPerformanceMetrics {
  /** Sell: cost basis consumed by this sell, trade currency. */
  consumed_cost_basis: string | null;
  /** Sell: realized P&L, trade currency. */
  realized_pnl: string | null;
  /** Sell: realized P&L in the reporting currency (value-date FX). */
  realized_pnl_reporting: string | null;
  /** Buy (FIFO/LIFO): still-open quantity of this lot. */
  remaining_quantity: string | null;
  /** Buy (FIFO/LIFO): unrealized P&L on the open remainder, trade currency. */
  unrealized_pnl: string | null;
  /** Buy (FIFO/LIFO): unrealized P&L on the open remainder, reporting currency (latest FX). */
  unrealized_pnl_reporting: string | null;
  /** The accounting method this attribution was produced under. */
  attribution: AccountingMethod;
}

export interface TransactionPerformanceInput {
  byTransaction: TransactionRealization[];
  /** Latest listing price (trade currency); null when no quote is available. */
  latestPrice: Decimal | null;
  /** Converts a trade-currency amount at the latest rate; null if no rate. */
  convertToReporting: (amount: Decimal) => Decimal | null;
  /**
   * Converts a trade-currency amount at the FX rate of a specific value date.
   * When provided, realized P&L converts per its value date (falling back to the
   * latest rate); when omitted, realized P&L uses the latest rate.
   */
  convertAt?: (amount: Decimal, fromCurrency: string, valueDate: string) => Decimal | null;
}

const money = (value: Decimal | null): string | null => (value === null ? null : value.toFixed(2));

/**
 * Maps each transaction's realization attribution to display metrics, keyed by
 * transaction ID. Realized values (sells) convert at the value-date rate to stay
 * consistent with the position's realized P&L; unrealized values (open FIFO/LIFO
 * buy lots) mark to market at the latest rate, consistent with position-level
 * unrealized P&L. Under average cost, buy remainders are null by construction.
 */
export function computeTransactionPerformance(
  input: TransactionPerformanceInput,
): Map<string, TransactionPerformanceMetrics> {
  const { latestPrice, convertToReporting, convertAt } = input;
  const out = new Map<string, TransactionPerformanceMetrics>();

  for (const record of input.byTransaction) {
    if (record.side === 'sell' && record.realizedPnl !== null) {
      const dated =
        convertAt && record.currency && record.valueDate
          ? convertAt(record.realizedPnl, record.currency, record.valueDate)
          : null;
      const realizedReporting = dated ?? convertToReporting(record.realizedPnl);
      out.set(record.transactionId, {
        consumed_cost_basis: money(record.consumedCostBasis),
        realized_pnl: money(record.realizedPnl),
        realized_pnl_reporting: money(realizedReporting),
        remaining_quantity: null,
        unrealized_pnl: null,
        unrealized_pnl_reporting: null,
        attribution: record.method,
      });
      continue;
    }

    // Buy. Open-lot unrealized P&L only exists for FIFO/LIFO (remainingQuantity
    // is non-null there) when a latest price is available and the lot is not
    // fully consumed. Average cost leaves the open side null by construction.
    let unrealized: Decimal | null = null;
    let unrealizedReporting: Decimal | null = null;
    if (
      record.remainingQuantity !== null &&
      record.remainingCostBasis !== null &&
      record.remainingQuantity.gt(0) &&
      latestPrice !== null
    ) {
      const currentValue = record.remainingQuantity.times(latestPrice);
      unrealized = currentValue.minus(record.remainingCostBasis);
      unrealizedReporting = convertToReporting(unrealized);
    }

    out.set(record.transactionId, {
      consumed_cost_basis: null,
      realized_pnl: null,
      realized_pnl_reporting: null,
      remaining_quantity: record.remainingQuantity !== null ? record.remainingQuantity.toFixed(8) : null,
      unrealized_pnl: money(unrealized),
      unrealized_pnl_reporting: money(unrealizedReporting),
      attribution: record.method,
    });
  }

  return out;
}
