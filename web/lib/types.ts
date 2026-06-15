// Contracts as served by the gateway → owning services.

export interface MeData {
  id: string
  email: string
  display_name: string | null
  role: "user" | "admin"
  preferences: {
    reporting_currency: string
    realization_accounting_method: "fifo" | "lifo" | "average_cost"
    combined_headline_metric: string
    avatar_color: string
    locale: string | null
    timezone: string | null
  }
  tax_residence: { country_code: string; valid_from: string } | null
}

export interface Portfolio {
  id: string
  name: string
  sort_order: number
  archived: boolean
  preferred_headline_metric: string
  created_at: string
}

// ---- Positions (portfolio service) ------------------------------------------

export interface PerformanceData {
  open_quantity: string
  listing_currency: string
  reporting_currency: string
  current_price: string | null
  daily_change_pct: string | null
  daily_change_amount_reporting: string | null
  open_cost_basis_reporting: string | null
  current_value_reporting: string | null
  unrealized_pnl_reporting: string | null
  realized_pnl_reporting: string | null
  total_fees_reporting: string | null
  simple_return_pct: string | null
  total_return_pct: string | null
  realized_return_pct: string | null
}

export interface ListingSummary {
  instrument_id: string
  symbol: string
  name: string
  asset_type: "equity" | "crypto" | "fund"
  currency: string
}

export interface PositionView {
  id: string
  portfolio_id: string
  listing_id: string
  state: "open" | "closed" | "invalid"
  listing: ListingSummary | null
  quote_as_of: string | null
  freshness_status: string | null
  performance: PerformanceData
}

export interface TransactionPerformance {
  consumed_cost_basis: string | null
  realized_pnl: string | null
  realized_pnl_reporting: string | null
  remaining_quantity: string | null
  unrealized_pnl: string | null
  unrealized_pnl_reporting: string | null
  attribution: "fifo" | "lifo" | "average_cost"
}

export interface TransactionTaxEvent {
  id: string
  transaction_id: string | null
  component: TaxComponent
  direction: TaxDirection
  amount: string
  currency: string
  booking_date: string
  note: string | null
}

export interface TransactionView {
  id: string
  side: "buy" | "sell"
  effective_at: string
  quantity: string
  price: string
  fee: string
  currency: string
  tax_relevant_value_date: string
  savings_plan: boolean
  note: string | null
  performance: TransactionPerformance
  tax_events: TransactionTaxEvent[]
}

export type BookingSource = "manual" | "import" | "broker_api" | "provider" | "corporate_action"

export interface RealizationAllocationView {
  position_id: string
  accounting_method: "fifo" | "lifo" | "average_cost" | null
  calculation_version: string | null
  lot_allocations: {
    sell_transaction_id: string
    buy_transaction_id: string
    quantity: string
  }[]
  average_cost_realizations: {
    sell_transaction_id: string
    average_cost_basis: string
    quantity: string
  }[]
}

export interface SparklinePoint {
  time: string
  price: string
}

export type PerformancePeriod = "1W" | "1M" | "YTD" | "1Y" | "ALL"

export interface PerformancePoint {
  date: string
  value: string
  invested_capital: string
  net_contributed: string
  realized_pnl: string
  unrealized_pnl: string
  dividends: string
  total_pnl: string
  complete: boolean
}

export interface PerformanceReturns {
  money_weighted: string | null
  time_weighted: string | null
}

export interface PerformanceReport {
  period: PerformancePeriod
  reporting_currency: string
  from: string
  to: string
  points: PerformancePoint[]
  returns: PerformanceReturns
}

export interface PositionDetail extends PositionView {
  transactions: TransactionView[]
  sparkline: SparklinePoint[]
}

// ---- Reporting (portfolio service) -----------------------------------------

export interface PortfolioReportSummary {
  snapshot_at: string
  reporting_currency: string
  preferred_headline_metric: string | null
  completeness: "complete" | "partial"
  current_value: string
  invested_capital: string
  daily_change_amount: string
  daily_change_pct: string | null
  realized_pnl: string
  unrealized_pnl: string
  dividends: string
  fees: string
  total_pnl: string
  simple_return_pct: string | null
  total_return_pct: string | null
  counts: { open: number; closed: number; invalid: number; stale: number; unavailable: number }
}

export interface ReportHoldingListing {
  listing_id: string
  currency: string
  quantity: string
  price: string | null
  value_reporting: string
}

export interface ReportHolding {
  instrument_id: string
  symbol: string
  name: string
  asset_type: string
  portfolios: { id: string; name: string }[]
  listings: ReportHoldingListing[]
  quantity: string
  market_value: string
  open_cost_basis: string
  realized_pnl: string
  unrealized_pnl: string
  dividends: string
  daily_change_amount: string
  weight_pct: string | null
}

export interface AllocationSlice {
  key: string
  label: string
  value: string
  weight_pct: string
}

export interface AllocationReport {
  reporting_currency: string
  total_value: string
  by_instrument: AllocationSlice[]
  by_asset_type: AllocationSlice[]
  by_portfolio: AllocationSlice[]
  by_currency: AllocationSlice[]
  intelligence: {
    largest_concentration: { instrument_id: string; symbol: string; weight_pct: string; exceeds_threshold: boolean } | null
    top_mover: { instrument_id: string; symbol: string; daily_change_amount: string; daily_change_pct: string | null } | null
    concentration_threshold_pct: string
  }
}

// ---- Tax (after-tax reporting + recorded broker tax) ------------------------

export type TaxComponent = "capital_income" | "solidarity" | "church" | "foreign_withholding" | "generic"
export type TaxDirection = "withheld" | "refunded"

export interface TaxEvent {
  id: string
  component: TaxComponent
  direction: TaxDirection
  amount: string
  currency: string
  booking_date: string
  source: string
  note: string | null
  transaction_id: string | null
  cash_flow_id: string | null
  position_id: string | null
  portfolio_id: string | null
  created_at: string
  updated_at: string
}

export type CashFlowType = "dividend" | "deposit" | "withdrawal" | "cash_in_lieu"

export interface CashFlow {
  id: string
  portfolio_id: string
  position_id: string | null
  type: CashFlowType
  gross_amount: string
  withholding_tax: string
  fee: string
  net_amount: string
  currency: string
  payment_date: string
  tax_relevant_value_date: string
  note: string | null
  created_at: string
  updated_at: string
}

export interface BookingChange {
  id: string
  entity_type: "transaction" | "cash_flow" | "tax_event"
  entity_id: string
  action: "created" | "updated" | "deleted"
  source: BookingSource
  reason: string | null
  before: unknown | null
  after: unknown | null
  portfolio_id: string | null
  position_id: string | null
  changed_at: string
}

export interface TaxReport {
  reporting_currency: string
  status: "unavailable" | "actual_partial" | "actual_complete"
  gross_realized_pnl: string
  actual_tax_withheld: string
  actual_tax_refunded: string
  net_actual_tax: string
  realized_pnl_after_actual_tax: string
  by_component: { component: TaxComponent; withheld: string; refunded: string; net: string }[]
  event_count: number
  unlinked_count: number
}

export interface TaxResidency {
  id: string
  country_code: string
  valid_from: string
  valid_until: string | null
  is_primary: boolean
  confirmed_at: string
}

export interface TaxResidencyView {
  current: TaxResidency | null
  history: TaxResidency[]
}

// ---- Country-aware tax settings (schemas, rules, settings, estimate) --------

export type TaxSettingsFieldType = "checkbox" | "select" | "date" | "number" | "money" | "currency" | "array"

export interface TaxSettingsSelectOption {
  value: string
  label: string
}

export interface TaxSettingsCondition {
  field: string
  equals: string | number | boolean
}

export interface TaxSettingsField {
  key: string
  label: string
  type: TaxSettingsFieldType
  description?: string
  helpText?: string
  required?: boolean
  default?: unknown
  order: number
  visibleWhen?: TaxSettingsCondition[]
  options?: TaxSettingsSelectOption[]
  min?: number
  max?: number
  step?: number
  currencyField?: string
  currency?: string
  itemFields?: TaxSettingsField[]
}

export interface TaxSettingsSchema {
  schemaKey: string
  version: number
  fields: TaxSettingsField[]
}

export interface TaxRule {
  id: string
  country_code: string
  rule_key: string
  rule_version: number
  asset_classes: string[]
  valid_from: string
  valid_to: string | null
  user_settings_schema: TaxSettingsSchema
  portfolio_settings_schema: TaxSettingsSchema
  parameters: Record<string, unknown>
  calculation_engine_key: string
  supported: boolean
}

export interface UserTaxSettings {
  country_code: string
  settings: Record<string, unknown>
  updated_at: string
}

export interface PortfolioTaxSettings {
  portfolio_id: string
  tax_rule_key: string | null
  tax_settings: Record<string, unknown>
}

export type TaxWithholdingStatus = "withheld" | "estimated_not_withheld" | "loss" | "fully_offset"

export interface SecuritiesPerSale {
  sellTransactionId: string
  date: string
  assetClass: string
  economicGainLoss: string
  taxRelevantGainLoss: string
  usedLossPotAmount: string
  addedLossPotAmount: string
  usedExemptionAmount: string
  calculatedTax: string
  withheldTax: string
  expectedTaxCorrection: string
  remainingTaxableGain: string
  taxWithholdingStatus: TaxWithholdingStatus
}

export interface SecuritiesYearSummary {
  year: number
  realizedGains: string
  realizedLosses: string
  taxableGain: string
  usedExemption: string
  calculatedTax: string
  withheldTax: string
}

export interface SecuritiesTaxResult {
  taxCurrency: string
  appliedTaxRuleKey: string
  appliedTaxRuleVersion: number
  perSale: SecuritiesPerSale[]
  byYear: SecuritiesYearSummary[]
  stockLossPot: string
  generalCapitalLossPot: string
  totalCalculatedTax: string
  totalWithheldTax: string
  expectedTaxCorrection: string
  bookedTaxCorrection: string
  outstandingTaxCorrection: string
}

export interface CryptoYearSummary {
  year: number
  taxableGain: string
  realizedLosses: string
  netTaxRelevant: string
  taxFreeGains: string
  annualFreeLimit: string
  belowAnnualFreeLimit: boolean
}

export interface CryptoTaxResult {
  taxCurrency: string
  appliedTaxRuleKey: string
  appliedTaxRuleVersion: number
  byYear: CryptoYearSummary[]
  note: string
}

export interface TaxEstimate {
  tax_currency: string
  fx_complete: boolean
  securities: { portfolio_id: string; portfolio_name: string; rule_key: string; result: SecuritiesTaxResult }[]
  crypto: { portfolio_id: string; portfolio_name: string; rule_key: string; result: CryptoTaxResult }[]
  unsupported: { portfolio_id: string; portfolio_name: string; reason: string }[]
}

// ---- Instruments (instruments service) --------------------------------------

export interface ExchangeView {
  id: string
  mic: string
  name: string
  timezone: string
}

export interface InstrumentListing {
  id: string
  instrument_id: string
  symbol: string
  currency: string
  exchange_id: string | null
  exchange_mic: string | null
  active: boolean
}

export interface InstrumentWithListings {
  id: string
  name: string
  asset_type: "equity" | "crypto" | "fund"
  isin: string | null
  primary_listing_id: string | null
  listings: InstrumentListing[]
}

export interface ListingDetail {
  id: string
  instrument_id: string
  symbol: string
  currency: string
  exchange_id: string | null
  exchange_mic: string | null
  active: boolean
  provider_identifiers: { provider: string; provider_identifier: string }[]
}

// ---- Watchlist --------------------------------------------------------------

export interface WatchlistItem {
  id: string
  listing_id: string
  note: string | null
  created_at: string
}

// ---- Insights (insights service) --------------------------------------------

export interface FairValueEstimate {
  id: string
  instrument_id: string
  user_id: string | null
  method: "dcf" | "analyst"
  value: string
  currency: string
  assumptions: Record<string, number> | null
  effective_date: string
  source: string | null
  created_at: string
  /** Present only on the POST response: the DCF computation breakdown. */
  breakdown?: {
    intrinsic_value_per_share: number
    enterprise_value: number
    equity_value: number
    present_value_of_cash_flows: number
    present_value_of_terminal: number
  }
}

export interface PriceTarget {
  id: string
  instrument_id: string
  listing_id: string | null
  user_id: string | null
  horizon: "short" | "medium" | "long"
  source: "own" | "analyst" | "technical"
  zone_low: string | null
  zone_high: string | null
  currency: string
  effective_date: string
  note: string | null
  created_at: string
  updated_at: string
}

/** Personal access token metadata (the secret is never included here). */
export interface ApiToken {
  id: string
  name: string
  scopes: string[]
  created_at: string
  last_used_at: string | null
  expires_at: string | null
}

/** The create response — includes the plaintext secret exactly once. */
export interface ApiTokenCreated extends ApiToken {
  token: string
}

export type AlertRuleKind = "price_threshold" | "daily_move" | "earnings_lead" | "cost_basis_move" | "target_zone"

/** A user-defined alert rule. */
export interface AlertRule {
  id: string
  user_id: string
  kind: AlertRuleKind
  scope: "instrument" | "all_holdings"
  instrument_id: string | null
  listing_id: string | null
  params: Record<string, unknown>
  label: string | null
  enabled: boolean
  created_at: string
  updated_at: string
}

/** A user-visible notification (alert). */
export interface NotificationItem {
  id: string
  type: "daily_move" | "earnings_upcoming" | "target_zone" | "price_threshold" | "cost_basis_move"
  severity: "info" | "warning" | "critical"
  title: string
  body: string | null
  instrument_id: string | null
  listing_id: string | null
  data: unknown
  read_at: string | null
  created_at: string
}

export interface NotificationInbox {
  unread_count: number
  notifications: NotificationItem[]
}

/** A reported or upcoming earnings period for an instrument. */
export interface EarningsRow {
  instrument_id: string
  fiscal_year: number
  fiscal_quarter: number | null
  period_end_date: string | null
  report_date: string | null
  eps_estimate: string | null
  eps_actual: string | null
  revenue_estimate: string | null
  revenue_actual: string | null
  surprise_pct: string | null
  provider: string
  is_upcoming: boolean
}

/** A corporate action (dividend or split) — an objective market fact. */
export interface CorporateAction {
  stable_action_id: string
  version: number
  instrument_id: string
  type: string
  ex_date: string
  ratio_numerator: string | null
  ratio_denominator: string | null
  dividend_amount: string | null
  dividend_currency: string | null
  provider: string
}

/** A news headline for an instrument. */
export interface NewsItem {
  id: string
  instrument_id: string | null
  published_at: string
  provider: string
  headline: string
  url: string | null
  sentiment: string | null
}

/** A fundamentals snapshot for an instrument (NUMERICs stay strings). */
export interface Fundamentals {
  instrument_id: string
  effective_date: string
  provider: string
  currency: string | null
  pe_ratio: string | null
  pb_ratio: string | null
  ps_ratio: string | null
  dividend_yield: string | null
  eps: string | null
  market_cap: string | null
  revenue: string | null
  revenue_growth: string | null
  earnings_growth: string | null
  shares_outstanding: string | null
  net_debt: string | null
  extra: Record<string, unknown> | null
  as_of: string
}

/** Watchlist item enriched with its listing and latest quote (as served by the gateway). */
export interface WatchlistItemView {
  id: string
  listing_id: string
  note: string | null
  created_at: string
  listing: {
    instrument_id: string
    symbol: string
    name: string
    asset_type: "equity" | "crypto" | "fund"
    currency: string
  } | null
  current_price: string | null
  daily_change_pct: string | null
  quote_as_of: string | null
  freshness_status: string | null
}
