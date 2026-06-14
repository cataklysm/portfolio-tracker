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
}

export interface SparklinePoint {
  time: string
  price: string
}

export interface PositionDetail extends PositionView {
  transactions: TransactionView[]
  sparkline: SparklinePoint[]
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
