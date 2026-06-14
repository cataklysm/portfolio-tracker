import type { PositionView } from '../../positions/application/build-position-view.js';

type Perf = PositionView['performance'];

/** A fully-null PerformanceMetrics, overridable per field. For tests only. */
export const perf = (o: Partial<Perf> = {}): Perf => ({
  open_quantity: '0',
  listing_currency: 'EUR',
  reporting_currency: 'EUR',
  current_price: null,
  daily_change_pct: null,
  daily_change_amount_reporting: null,
  open_cost_basis_reporting: null,
  current_value_reporting: null,
  unrealized_pnl_reporting: null,
  realized_pnl_reporting: null,
  total_fees_reporting: null,
  simple_return_pct: null,
  total_return_pct: null,
  realized_return_pct: null,
  ...o,
});

/** A PositionView with sensible defaults, overridable. For tests only. */
export const view = (o: Partial<PositionView> & { performance: Perf }): PositionView => ({
  id: 'p',
  portfolio_id: 'A',
  listing_id: 'L',
  state: 'open',
  listing: { instrument_id: 'X', symbol: 'X', name: 'X', asset_type: 'equity', currency: 'EUR' },
  quote_as_of: null,
  freshness_status: 'fresh',
  ...o,
});

export const listing = (instrument_id: string, symbol: string, currency = 'EUR') => ({
  instrument_id,
  symbol,
  name: symbol,
  asset_type: 'equity' as const,
  currency,
});
