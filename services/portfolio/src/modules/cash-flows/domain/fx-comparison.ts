import Decimal from 'decimal.js';
import type { CashFlowFxComparison, CashFlowRecord } from '../application/ports.js';

/** EUR-based rate lookup (units of currency per 1 EUR) on/before a date; null when unavailable. */
export type EurRateLookup = (currency: string, date: string) => string | null;

const SAME_CURRENCY: CashFlowFxComparison = {
  reference_fx_rate: null,
  reference_fx_rate_date: null,
  reference_fx_net_amount: null,
  broker_fx_difference_amount: null,
  broker_fx_difference_pct: null,
  fx_comparison_status: 'same_currency',
};

const UNAVAILABLE: CashFlowFxComparison = { ...SAME_CURRENCY, fx_comparison_status: 'unavailable' };

/**
 * Compares the broker's fixed FX against the market reference rate for one booking.
 *
 * Reference rates are EUR-based (units of currency per 1 EUR), so the reference
 * source->settlement rate is `r_settlement / r_source` (reducing to `1 / r_source`
 * when settlement is EUR). Both the broker and reference nets are applied to the
 * same `source_net_amount` to isolate the FX effect; the difference is the broker
 * net minus the reference net, in the settlement currency. The authoritative booked
 * amounts are never touched.
 */
export function computeFxComparison(cf: CashFlowRecord, rate: EurRateLookup): CashFlowFxComparison {
  // No source layer (or same-currency source) → nothing to compare.
  if (cf.source_currency === null || cf.source_currency === cf.currency) return SAME_CURRENCY;
  // A foreign booking always carries these (DB + service invariants); guard defensively.
  if (cf.broker_fx_rate === null || cf.source_net_amount === null) return UNAVAILABLE;

  const date = cf.broker_fx_rate_date ?? cf.tax_relevant_value_date;
  const rSource = rate(cf.source_currency, date);
  const rSettlement = rate(cf.currency, date);
  if (rSource === null || rSettlement === null) return UNAVAILABLE;

  const referenceRate = new Decimal(rSettlement).div(rSource); // source -> settlement
  const sourceNet = new Decimal(cf.source_net_amount);
  const referenceNet = sourceNet.times(referenceRate);
  const brokerNet = sourceNet.times(cf.broker_fx_rate);
  const difference = brokerNet.minus(referenceNet);
  const pct = referenceNet.isZero() ? null : difference.div(referenceNet).times(100);

  return {
    reference_fx_rate: referenceRate.toString(),
    reference_fx_rate_date: date,
    reference_fx_net_amount: referenceNet.toString(),
    broker_fx_difference_amount: difference.toString(),
    broker_fx_difference_pct: pct === null ? null : pct.toString(),
    fx_comparison_status: 'available',
  };
}
