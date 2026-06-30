import Decimal from 'decimal.js';
import type { TaxComponent, TaxDirection, TaxSource } from '../../tax-events/application/ports.js';

/**
 * Whether a tax event is tax on realized price gains, as opposed to income tax on
 * dividends/interest/cash-in-lieu. Income tax — auto-created with `income_booking`
 * or otherwise linked to an income cash flow — is excluded from the realized-P&L
 * after-tax report: it reduces income (already netted in the cash flow), not
 * capital gains, so it must not subtract from realized P&L.
 */
export function isRealizedGainTaxEvent(event: { source: TaxSource; cash_flow_id: string | null }): boolean {
  return event.source !== 'income_booking' && event.cash_flow_id === null;
}

/** A tax event already converted to the reporting currency for aggregation. */
export interface ConvertedTaxEvent {
  component: TaxComponent;
  direction: TaxDirection;
  /** Magnitude in the reporting currency; null when no FX rate was available. */
  amount: Decimal | null;
  /** Whether the event is attributed to a specific booking (transaction/cash flow/position). */
  linked: boolean;
}

export interface TaxComponentBreakdown {
  component: TaxComponent;
  withheld: string;
  refunded: string;
  net: string;
}

export interface TaxReport {
  reporting_currency: string;
  /**
   * `unavailable`: no tax recorded — after-tax equals gross (a zero balance means
   * "nothing recorded", never "no liability"). `actual_partial`: tax recorded but
   * at least one event lacked an FX rate, so the totals may understate actual tax.
   * `actual_complete`: every recorded event was converted.
   */
  status: 'unavailable' | 'actual_partial' | 'actual_complete';
  gross_realized_pnl: string;
  actual_tax_withheld: string;
  actual_tax_refunded: string;
  net_actual_tax: string;
  realized_pnl_after_actual_tax: string;
  by_component: TaxComponentBreakdown[];
  event_count: number;
  /** Events not attributed to a specific booking (e.g. year-end broker corrections). */
  unlinked_count: number;
}

const ORDER: TaxComponent[] = ['capital_income', 'solidarity', 'church', 'foreign_withholding', 'generic'];

/**
 * Reconciles gross realized P&L with recorded broker tax events into an after-tax
 * view, without ever changing the meaning of the gross figure. Withheld increases
 * tax; refunded decreases it. The tracker records only what the broker booked, so
 * a zero net means no tax was recorded — not that none is owed.
 */
export function computeTaxReport(
  grossRealized: Decimal,
  events: ConvertedTaxEvent[],
  reportingCurrency: string,
): TaxReport {
  let withheld = new Decimal(0);
  let refunded = new Decimal(0);
  let conversionComplete = true;
  let unlinked = 0;
  const components = new Map<TaxComponent, { withheld: Decimal; refunded: Decimal }>();

  for (const event of events) {
    if (!event.linked) unlinked += 1;
    if (event.amount === null) {
      conversionComplete = false;
      continue;
    }
    const bucket = components.get(event.component) ?? { withheld: new Decimal(0), refunded: new Decimal(0) };
    if (event.direction === 'withheld') {
      withheld = withheld.plus(event.amount);
      bucket.withheld = bucket.withheld.plus(event.amount);
    } else {
      refunded = refunded.plus(event.amount);
      bucket.refunded = bucket.refunded.plus(event.amount);
    }
    components.set(event.component, bucket);
  }

  const net = withheld.minus(refunded);
  const status: TaxReport['status'] =
    events.length === 0 ? 'unavailable' : conversionComplete ? 'actual_complete' : 'actual_partial';

  const byComponent: TaxComponentBreakdown[] = ORDER.filter((c) => components.has(c)).map((component) => {
    const b = components.get(component)!;
    return {
      component,
      withheld: b.withheld.toFixed(2),
      refunded: b.refunded.toFixed(2),
      net: b.withheld.minus(b.refunded).toFixed(2),
    };
  });

  return {
    reporting_currency: reportingCurrency,
    status,
    gross_realized_pnl: grossRealized.toFixed(2),
    actual_tax_withheld: withheld.toFixed(2),
    actual_tax_refunded: refunded.toFixed(2),
    net_actual_tax: net.toFixed(2),
    realized_pnl_after_actual_tax: grossRealized.minus(net).toFixed(2),
    by_component: byComponent,
    event_count: events.length,
    unlinked_count: unlinked,
  };
}
