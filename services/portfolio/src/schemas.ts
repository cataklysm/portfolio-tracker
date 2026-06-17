import { Type } from '@sinclair/typebox';

// Nullable shorthands
const Ns = Type.Union([Type.String(), Type.Null()]);
const Nn = Type.Union([Type.Number(), Type.Null()]);
const Ni = Type.Union([Type.Integer(), Type.Null()]);

// --- Shared enums/unions ---

export const AccountingMethodSchema = Type.Union([
  Type.Literal('fifo'),
  Type.Literal('lifo'),
  Type.Literal('average_cost'),
]);

export const AssetTypeSchema = Type.Union([
  Type.Literal('equity'),
  Type.Literal('crypto'),
  Type.Literal('fund'),
  Type.Literal('index'),
]);

export const PositionStateSchema = Type.Union([
  Type.Literal('open'),
  Type.Literal('closed'),
  Type.Literal('invalid'),
]);

export const CashFlowKindSchema = Type.Union([
  Type.Literal('dividend'),
  Type.Literal('deposit'),
  Type.Literal('withdrawal'),
  Type.Literal('cash_in_lieu'),
]);

export const TaxComponentSchema = Type.Union([
  Type.Literal('capital_income'),
  Type.Literal('solidarity'),
  Type.Literal('church'),
  Type.Literal('foreign_withholding'),
  Type.Literal('generic'),
]);

export const TaxDirectionSchema = Type.Union([
  Type.Literal('withheld'),
  Type.Literal('refunded'),
]);

export const PerformancePeriodSchema = Type.Union([
  Type.Literal('1W'),
  Type.Literal('1M'),
  Type.Literal('YTD'),
  Type.Literal('1Y'),
  Type.Literal('ALL'),
]);

export const PulseStatusSchema = Type.Union([
  Type.Literal('strong'),
  Type.Literal('balanced'),
  Type.Literal('fragile'),
  Type.Literal('at_risk'),
  Type.Literal('insufficient_data'),
]);

// --- Portfolio ---

export const PortfolioRowSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  sort_order: Type.Integer(),
  archived: Type.Boolean(),
  preferred_headline_metric: Type.String(),
  preferred_benchmark: Ns,
  created_at: Type.String(),
});

export const OkResponse = Type.Object({ ok: Type.Literal(true) });
export const CreatePortfolioResponse = Type.Object({ id: Type.String() });

// --- Positions / Performance ---

export const PerformanceMetricsSchema = Type.Object({
  open_quantity: Type.String(),
  listing_currency: Type.String(),
  reporting_currency: Type.String(),
  current_price: Ns,
  daily_change_pct: Ns,
  daily_change_amount_reporting: Ns,
  open_cost_basis_reporting: Ns,
  current_value_reporting: Ns,
  unrealized_pnl_reporting: Ns,
  realized_pnl_reporting: Ns,
  total_fees_reporting: Ns,
  simple_return_pct: Ns,
  total_return_pct: Ns,
  realized_return_pct: Ns,
});

export const TransactionPerformanceMetricsSchema = Type.Object({
  consumed_cost_basis: Ns,
  realized_pnl: Ns,
  realized_pnl_reporting: Ns,
  remaining_quantity: Ns,
  unrealized_pnl: Ns,
  unrealized_pnl_reporting: Ns,
  attribution: AccountingMethodSchema,
});

const ListingSubSchema = Type.Object({
  instrument_id: Type.String(),
  symbol: Type.String(),
  name: Type.String(),
  asset_type: AssetTypeSchema,
  currency: Type.String(),
});

export const PositionViewSchema = Type.Object({
  id: Type.String(),
  portfolio_id: Type.String(),
  listing_id: Type.String(),
  state: PositionStateSchema,
  listing: Type.Union([ListingSubSchema, Type.Null()]),
  quote_as_of: Ns,
  freshness_status: Ns,
  performance: PerformanceMetricsSchema,
});

export const TransactionTaxEventSchema = Type.Object({
  id: Type.String(),
  transaction_id: Ns,
  component: TaxComponentSchema,
  direction: TaxDirectionSchema,
  amount: Type.String(),
  currency: Type.String(),
  booking_date: Type.String(),
  note: Ns,
});

export const TransactionDetailSchema = Type.Object({
  id: Type.String(),
  side: Type.Union([Type.Literal('buy'), Type.Literal('sell')]),
  effective_at: Type.String(),
  quantity: Type.String(),
  price: Type.String(),
  fee: Type.String(),
  currency: Type.String(),
  tax_relevant_value_date: Type.String(),
  savings_plan: Type.Boolean(),
  note: Ns,
  performance: TransactionPerformanceMetricsSchema,
  tax_events: Type.Array(TransactionTaxEventSchema),
});

export const PositionDetailSchema = Type.Object({
  id: Type.String(),
  portfolio_id: Type.String(),
  listing_id: Type.String(),
  state: PositionStateSchema,
  listing: Type.Union([ListingSubSchema, Type.Null()]),
  quote_as_of: Ns,
  freshness_status: Ns,
  performance: PerformanceMetricsSchema,
  transactions: Type.Array(TransactionDetailSchema),
  sparkline: Type.Array(Type.Object({ time: Type.String(), price: Type.String() })),
});

export const RealizationAllocationViewSchema = Type.Object({
  position_id: Type.String(),
  accounting_method: Ns,
  calculation_version: Ns,
  lot_allocations: Type.Array(Type.Object({
    sell_transaction_id: Type.String(),
    buy_transaction_id: Type.String(),
    quantity: Type.String(),
  })),
  average_cost_realizations: Type.Array(Type.Object({
    sell_transaction_id: Type.String(),
    average_cost_basis: Type.String(),
    quantity: Type.String(),
  })),
});

export const SerializedTransferSchema = Type.Object({
  id: Type.String(),
  position_id: Type.String(),
  source_portfolio_id: Type.String(),
  destination_portfolio_id: Type.String(),
  effective_at: Type.String(),
  kind: Type.Union([Type.Literal('whole'), Type.Literal('partial')]),
  destination_position_id: Ns,
  transferred_quantity: Ns,
  created_at: Type.String(),
});

export const TransferPositionResultSchema = Type.Object({
  transfer_id: Type.String(),
  position_id: Type.String(),
  merged: Type.Boolean(),
});

export const LotTransferResultSchema = Type.Object({
  transfer_id: Type.String(),
  source_position_id: Type.String(),
  destination_position_id: Type.String(),
  created: Type.Boolean(),
});

export const CreatePositionResultSchema = Type.Object({
  position_id: Type.String(),
  transaction_id: Type.String(),
});

export const TransactionResultSchema = Type.Object({
  transaction_id: Type.String(),
});

export const OpenPositionCostBasisSchema = Type.Object({
  listing_id: Type.String(),
  avg_cost: Type.String(),
});

// --- Cash flows ---

export const CashFlowRecordSchema = Type.Object({
  id: Type.String(),
  portfolio_id: Type.String(),
  position_id: Ns,
  type: CashFlowKindSchema,
  gross_amount: Type.String(),
  withholding_tax: Type.String(),
  fee: Type.String(),
  net_amount: Type.String(),
  currency: Type.String(),
  payment_date: Type.String(),
  tax_relevant_value_date: Type.String(),
  note: Ns,
  created_at: Type.String(),
  updated_at: Type.String(),
});

// --- Tax events ---

export const TaxEventRecordSchema = Type.Object({
  id: Type.String(),
  component: TaxComponentSchema,
  direction: TaxDirectionSchema,
  amount: Type.String(),
  currency: Type.String(),
  booking_date: Type.String(),
  source: Type.String(),
  note: Ns,
  created_at: Type.String(),
  updated_at: Type.String(),
  transaction_id: Ns,
  cash_flow_id: Ns,
  position_id: Ns,
  portfolio_id: Ns,
});

// --- Reporting: summary ---

export const PortfolioSummarySchema = Type.Object({
  snapshot_at: Type.String(),
  reporting_currency: Type.String(),
  preferred_headline_metric: Ns,
  completeness: Type.Union([Type.Literal('complete'), Type.Literal('partial')]),
  current_value: Type.String(),
  invested_capital: Type.String(),
  daily_change_amount: Type.String(),
  daily_change_pct: Ns,
  realized_pnl: Type.String(),
  unrealized_pnl: Type.String(),
  dividends: Type.String(),
  fees: Type.String(),
  total_pnl: Type.String(),
  simple_return_pct: Ns,
  total_return_pct: Ns,
  counts: Type.Object({
    open: Type.Integer(),
    closed: Type.Integer(),
    invalid: Type.Integer(),
    stale: Type.Integer(),
    unavailable: Type.Integer(),
  }),
});

// --- Reporting: holdings ---

export const HoldingListingSchema = Type.Object({
  listing_id: Type.String(),
  currency: Type.String(),
  quantity: Type.String(),
  price: Ns,
  value_reporting: Type.String(),
});

export const HoldingGroupSchema = Type.Object({
  instrument_id: Type.String(),
  symbol: Type.String(),
  name: Type.String(),
  asset_type: Type.String(),
  portfolios: Type.Array(Type.Object({ id: Type.String(), name: Type.String() })),
  listings: Type.Array(HoldingListingSchema),
  quantity: Type.String(),
  market_value: Type.String(),
  open_cost_basis: Type.String(),
  realized_pnl: Type.String(),
  unrealized_pnl: Type.String(),
  dividends: Type.String(),
  daily_change_amount: Type.String(),
  weight_pct: Ns,
});

// --- Reporting: allocation ---

export const AllocationSliceSchema = Type.Object({
  key: Type.String(),
  label: Type.String(),
  value: Type.String(),
  weight_pct: Type.String(),
});

export const AllocationReportSchema = Type.Object({
  reporting_currency: Type.String(),
  total_value: Type.String(),
  by_instrument: Type.Array(AllocationSliceSchema),
  by_asset_type: Type.Array(AllocationSliceSchema),
  by_portfolio: Type.Array(AllocationSliceSchema),
  by_currency: Type.Array(AllocationSliceSchema),
  intelligence: Type.Object({
    largest_concentration: Type.Union([
      Type.Object({
        instrument_id: Type.String(),
        symbol: Type.String(),
        weight_pct: Type.String(),
        exceeds_threshold: Type.Boolean(),
      }),
      Type.Null(),
    ]),
    top_mover: Type.Union([
      Type.Object({
        instrument_id: Type.String(),
        symbol: Type.String(),
        daily_change_amount: Type.String(),
        daily_change_pct: Ns,
      }),
      Type.Null(),
    ]),
    concentration_threshold_pct: Type.String(),
  }),
});

// --- Reporting: tax ---

export const TaxComponentBreakdownSchema = Type.Object({
  component: TaxComponentSchema,
  withheld: Type.String(),
  refunded: Type.String(),
  net: Type.String(),
});

export const TaxReportSchema = Type.Object({
  reporting_currency: Type.String(),
  status: Type.Union([
    Type.Literal('unavailable'),
    Type.Literal('actual_partial'),
    Type.Literal('actual_complete'),
  ]),
  gross_realized_pnl: Type.String(),
  actual_tax_withheld: Type.String(),
  actual_tax_refunded: Type.String(),
  net_actual_tax: Type.String(),
  realized_pnl_after_actual_tax: Type.String(),
  by_component: Type.Array(TaxComponentBreakdownSchema),
  event_count: Type.Integer(),
  unlinked_count: Type.Integer(),
});

// --- Reporting: snapshot ---

export const ReportingSnapshotSchema = Type.Object({
  snapshot_at: Type.String(),
  reporting_currency: Type.String(),
  summary: PortfolioSummarySchema,
  holdings: Type.Array(HoldingGroupSchema),
  allocation: AllocationReportSchema,
  tax: TaxReportSchema,
});

// --- Reporting: performance series ---

export const PerformancePointSchema = Type.Object({
  date: Type.String(),
  value: Type.String(),
  invested_capital: Type.String(),
  net_contributed: Type.String(),
  realized_pnl: Type.String(),
  unrealized_pnl: Type.String(),
  dividends: Type.String(),
  total_pnl: Type.String(),
  complete: Type.Boolean(),
});

export const ReturnsResultSchema = Type.Object({
  money_weighted: Ns,
  time_weighted: Ns,
});

export const PerformanceReportSchema = Type.Object({
  period: PerformancePeriodSchema,
  reporting_currency: Type.String(),
  from: Type.String(),
  to: Type.String(),
  points: Type.Array(PerformancePointSchema),
  returns: ReturnsResultSchema,
});

// --- Reporting: risk ---

export const RiskReportSchema = Type.Object({
  period: PerformancePeriodSchema,
  reporting_currency: Type.String(),
  closed_positions: Type.Object({
    count: Type.Integer(),
    wins: Type.Integer(),
    losses: Type.Integer(),
    win_rate_pct: Ns,
  }),
  volatility_pct: Ns,
  downside_volatility_pct: Ns,
  annualized_return_pct: Ns,
  sharpe: Ns,
  sortino: Ns,
  max_drawdown_pct: Ns,
  best_period_pct: Ns,
  worst_period_pct: Ns,
  sample_count: Type.Integer(),
});

// --- Reporting: intelligence (portfolio pulse) ---

export const IntelligenceReportSchema = Type.Object({
  period: PerformancePeriodSchema,
  reporting_currency: Type.String(),
  version: Type.Integer(),
  score: Nn,
  status: PulseStatusSchema,
  confidence: Type.Number(),
  primary_driver: Ns,
  components: Type.Object({
    structure: Type.Object({
      available: Type.Boolean(),
      score: Nn,
      weight: Type.Number(),
      top1_pct: Nn,
      top3_pct: Nn,
      hhi: Nn,
    }),
    risk: Type.Object({
      available: Type.Boolean(),
      score: Nn,
      weight: Type.Number(),
    }),
    data_quality: Type.Object({
      available: Type.Boolean(),
      score: Type.Number(),
      weight: Type.Number(),
      priced_value_pct: Type.Number(),
      fresh_value_pct: Type.Number(),
      ledger_valid: Type.Boolean(),
    }),
  }),
});

// --- Reporting: benchmark ---

export const BenchmarkPointSchema = Type.Object({
  date: Type.String(),
  portfolio: Ns,
  benchmark: Ns,
});

export const BenchmarkReportSchema = Type.Object({
  period: PerformancePeriodSchema,
  reporting_currency: Type.String(),
  from: Type.String(),
  to: Type.String(),
  benchmark_listing_id: Type.String(),
  portfolio_return_pct: Ns,
  benchmark_return_pct: Ns,
  excess_return_pct: Ns,
  beta: Ns,
  correlation: Ns,
  tracking_error_pct: Ns,
  series: Type.Array(BenchmarkPointSchema),
});

// --- Activity ---

export const ActivityItemSchema = Type.Object({
  id: Type.String(),
  kind: Type.Union([
    Type.Literal('trade'),
    Type.Literal('cash_flow'),
    Type.Literal('tax_event'),
    Type.Literal('corporate_action'),
    Type.Literal('transfer'),
  ]),
  occurred_at: Type.String(),
  portfolio_id: Ns,
  position_id: Ns,
  subtype: Type.String(),
  currency: Ns,
  amount: Ns,
  quantity: Ns,
  price: Ns,
  fee: Ns,
  direction: Ns,
  note: Ns,
});

export const ActivityPageSchema = Type.Object({
  items: Type.Array(ActivityItemSchema),
  next_cursor: Ns,
});

// --- Audit / change log ---

export const BookingChangeSchema = Type.Object({
  id: Type.String(),
  entity_type: Type.Union([
    Type.Literal('transaction'),
    Type.Literal('cash_flow'),
    Type.Literal('tax_event'),
  ]),
  entity_id: Type.String(),
  action: Type.Union([
    Type.Literal('created'),
    Type.Literal('updated'),
    Type.Literal('deleted'),
  ]),
  source: Type.String(),
  reason: Ns,
  before: Type.Unknown(),
  after: Type.Unknown(),
  portfolio_id: Ns,
  position_id: Ns,
  changed_at: Type.String(),
});

// --- Watchlist ---

export const WatchlistItemViewSchema = Type.Object({
  id: Type.String(),
  listing_id: Type.String(),
  note: Ns,
  created_at: Type.String(),
  listing: Type.Union([
    Type.Object({
      instrument_id: Type.String(),
      symbol: Type.String(),
      name: Type.String(),
      asset_type: AssetTypeSchema,
      currency: Type.String(),
    }),
    Type.Null(),
  ]),
  current_price: Ns,
  daily_change_pct: Ns,
  quote_as_of: Ns,
  freshness_status: Ns,
});

// --- Corporate actions ---

export const CorporateActionApplicationRecordSchema = Type.Object({
  id: Type.String(),
  position_id: Type.String(),
  corporate_action_id: Type.String(),
  corporate_action_version: Type.Integer(),
  signed_action_snapshot: Type.Unknown(),
  token_signature_hash: Type.String(),
  ratio_numerator: Ns,
  ratio_denominator: Ns,
  effective_at: Type.String(),
  fractional_handling: Type.Union([
    Type.Literal('keep_fractional'),
    Type.Literal('cash_settlement'),
  ]),
  applied_at: Type.String(),
  reversed_at: Ns,
  reversal_reason: Ns,
});

export const ApplyCorporateActionResultSchema = Type.Object({
  application_id: Type.String(),
  position_id: Type.String(),
});

export const ReverseCorporateActionResultSchema = Type.Object({
  position_id: Type.String(),
});

// --- Tax rules ---

export const TaxRuleSchema = Type.Object({
  id: Type.String(),
  country_code: Type.String(),
  rule_key: Type.String(),
  rule_version: Type.Integer(),
  asset_classes: Type.Array(Type.String()),
  valid_from: Type.String(),
  valid_to: Ns,
  user_settings_schema: Type.Unknown(),
  portfolio_settings_schema: Type.Unknown(),
  parameters: Type.Record(Type.String(), Type.Unknown()),
  calculation_engine_key: Type.String(),
  supported: Type.Boolean(),
});

// --- Tax settings ---

export const UserTaxSettingsSchema = Type.Object({
  country_code: Type.String(),
  settings: Type.Record(Type.String(), Type.Unknown()),
  updated_at: Type.String(),
});

export const PortfolioTaxSettingsSchema = Type.Object({
  portfolio_id: Type.String(),
  tax_rule_key: Ns,
  tax_settings: Type.Record(Type.String(), Type.Unknown()),
});

// --- Tax estimate ---

const PerSaleTaxResultSchema = Type.Object({
  sellTransactionId: Type.String(),
  date: Type.String(),
  assetClass: Type.String(),
  economicGainLoss: Type.String(),
  taxRelevantGainLoss: Type.String(),
  appliedTaxRuleKey: Type.String(),
  appliedTaxRuleVersion: Type.Integer(),
  usedLossPotAmount: Type.String(),
  addedLossPotAmount: Type.String(),
  usedExemptionAmount: Type.String(),
  calculatedTax: Type.String(),
  withheldTax: Type.String(),
  expectedTaxCorrection: Type.String(),
  remainingTaxableGain: Type.String(),
  taxWithholdingStatus: Type.Union([
    Type.Literal('withheld'),
    Type.Literal('estimated_not_withheld'),
    Type.Literal('loss'),
    Type.Literal('fully_offset'),
  ]),
});

const YearTaxSummarySchema = Type.Object({
  year: Type.Integer(),
  realizedGains: Type.String(),
  realizedLosses: Type.String(),
  taxableGain: Type.String(),
  usedExemption: Type.String(),
  calculatedTax: Type.String(),
  withheldTax: Type.String(),
});

const GermanSecuritiesResultSchema = Type.Object({
  taxCurrency: Type.String(),
  appliedTaxRuleKey: Type.String(),
  appliedTaxRuleVersion: Type.Integer(),
  perSale: Type.Array(PerSaleTaxResultSchema),
  byYear: Type.Array(YearTaxSummarySchema),
  stockLossPot: Type.String(),
  generalCapitalLossPot: Type.String(),
  totalCalculatedTax: Type.String(),
  totalWithheldTax: Type.String(),
  expectedTaxCorrection: Type.String(),
  bookedTaxCorrection: Type.String(),
  outstandingTaxCorrection: Type.String(),
});

const PerDisposalResultSchema = Type.Object({
  sellTransactionId: Type.String(),
  acquisitionDate: Type.String(),
  disposalDate: Type.String(),
  holdingPeriodDays: Type.Integer(),
  longTerm: Type.Boolean(),
  gainLoss: Type.String(),
  taxRelevant: Type.Boolean(),
  appliedTaxRuleKey: Type.String(),
  appliedTaxRuleVersion: Type.Integer(),
});

const CryptoYearSummarySchema = Type.Object({
  year: Type.Integer(),
  taxableGain: Type.String(),
  realizedLosses: Type.String(),
  netTaxRelevant: Type.String(),
  taxFreeGains: Type.String(),
  annualFreeLimit: Type.String(),
  belowAnnualFreeLimit: Type.Boolean(),
});

const GermanCryptoResultSchema = Type.Object({
  taxCurrency: Type.String(),
  appliedTaxRuleKey: Type.String(),
  appliedTaxRuleVersion: Type.Integer(),
  perDisposal: Type.Array(PerDisposalResultSchema),
  byYear: Type.Array(CryptoYearSummarySchema),
  note: Type.String(),
});

export const TaxEstimateSchema = Type.Object({
  tax_currency: Type.String(),
  fx_complete: Type.Boolean(),
  securities: Type.Array(Type.Object({
    portfolio_id: Type.String(),
    portfolio_name: Type.String(),
    rule_key: Type.String(),
    result: GermanSecuritiesResultSchema,
  })),
  crypto: Type.Array(Type.Object({
    portfolio_id: Type.String(),
    portfolio_name: Type.String(),
    rule_key: Type.String(),
    result: GermanCryptoResultSchema,
  })),
  unsupported: Type.Array(Type.Object({
    portfolio_id: Type.String(),
    portfolio_name: Type.String(),
    reason: Type.String(),
  })),
});
