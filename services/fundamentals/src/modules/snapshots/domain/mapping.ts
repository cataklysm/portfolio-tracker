import type { FundamentalsRow, FundamentalsSnapshot, StoredFundamentals } from '../application/ports.js';

/** A stored snapshot shaped for API responses; NUMERICs stay strings. */
export interface FundamentalsView {
  instrument_id: string;
  effective_date: string;
  provider: string;
  currency: string | null;
  pe_ratio: string | null;
  pb_ratio: string | null;
  ps_ratio: string | null;
  dividend_yield: string | null;
  eps: string | null;
  market_cap: string | null;
  revenue: string | null;
  revenue_growth: string | null;
  earnings_growth: string | null;
  shares_outstanding: string | null;
  net_debt: string | null;
  /** Full provider payload (extra ratios/financials) for transparency. */
  extra: Record<string, unknown> | null;
  as_of: string;
}

function numToStr(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : String(value);
}

/** UTC YYYY-MM-DD for an epoch-ms timestamp, defaulting to now. */
function effectiveDate(asOfMs: number | null): string {
  const date = asOfMs ? new Date(asOfMs) : new Date();
  return date.toISOString().slice(0, 10);
}

/** Maps a fetched snapshot to a decimal-safe row for `fundamentals.fundamentals`. */
export function toRow(instrumentId: string, provider: string, snapshot: FundamentalsSnapshot): FundamentalsRow {
  return {
    instrumentId,
    effectiveDate: effectiveDate(snapshot.asOfMs),
    provider,
    peRatio: numToStr(snapshot.peRatio),
    pbRatio: numToStr(snapshot.pbRatio),
    psRatio: numToStr(snapshot.psRatio),
    dividendYield: numToStr(snapshot.dividendYield),
    eps: numToStr(snapshot.eps),
    marketCap: numToStr(snapshot.marketCap),
    revenue: numToStr(snapshot.revenue),
    revenueGrowth: numToStr(snapshot.revenueGrowth),
    earningsGrowth: numToStr(snapshot.earningsGrowth),
    sharesOutstanding: numToStr(snapshot.sharesOutstanding),
    netDebt: numToStr(snapshot.netDebt),
    rawPayload: { currency: snapshot.currency, ...snapshot.raw },
  };
}

/** Maps a stored snapshot to its API view, lifting currency out of the payload. */
export function toView(stored: StoredFundamentals): FundamentalsView {
  const payload = (stored.raw_payload ?? null) as Record<string, unknown> | null;
  const currency = typeof payload?.['currency'] === 'string' ? (payload['currency'] as string) : null;
  return {
    instrument_id: stored.instrument_id,
    effective_date: stored.effective_date,
    provider: stored.provider,
    currency,
    pe_ratio: stored.pe_ratio,
    pb_ratio: stored.pb_ratio,
    ps_ratio: stored.ps_ratio,
    dividend_yield: stored.dividend_yield,
    eps: stored.eps,
    market_cap: stored.market_cap,
    revenue: stored.revenue,
    revenue_growth: stored.revenue_growth,
    earnings_growth: stored.earnings_growth,
    shares_outstanding: stored.shares_outstanding,
    net_debt: stored.net_debt,
    extra: payload,
    as_of: stored.created_at,
  };
}
