/**
 * A simple, traceable discounted-cash-flow model. Intrinsic value is a model
 * output, not a retrievable fact, so this is intentionally transparent: project
 * free cash flow for a fixed horizon, discount each year to present value, add a
 * Gordon-growth terminal value, subtract net debt, and divide by diluted shares.
 * Every input is stored alongside the result so the number is reproducible.
 */
export interface DcfAssumptions {
  /** Current annual free cash flow, in the instrument's currency. */
  base_cash_flow: number;
  /** Annual FCF growth during the projection (e.g. 0.08 for 8%). */
  growth_rate: number;
  /** Projection horizon in years (1–50). */
  projection_years: number;
  /** Discount rate / WACC (e.g. 0.09). Must exceed terminal_growth. */
  discount_rate: number;
  /** Perpetual growth after the horizon (e.g. 0.025). */
  terminal_growth: number;
  /** Diluted shares outstanding. */
  shares_outstanding: number;
  /** Net debt subtracted from enterprise value to get equity value. Default 0. */
  net_debt?: number;
}

export interface DcfResult {
  intrinsic_value_per_share: number;
  enterprise_value: number;
  equity_value: number;
  present_value_of_cash_flows: number;
  present_value_of_terminal: number;
}

export class DcfError extends Error {}

/** Computes intrinsic value per share. Throws DcfError on invalid assumptions. */
export function computeDcf(a: DcfAssumptions): DcfResult {
  const years = a.projection_years;
  if (!Number.isInteger(years) || years < 1 || years > 50) {
    throw new DcfError('projection_years must be an integer between 1 and 50');
  }
  if (a.discount_rate <= a.terminal_growth) {
    throw new DcfError('discount_rate must be greater than terminal_growth');
  }
  if (a.shares_outstanding <= 0) {
    throw new DcfError('shares_outstanding must be greater than 0');
  }
  for (const [key, v] of Object.entries(a)) {
    if (v !== undefined && !Number.isFinite(v)) throw new DcfError(`${key} must be a finite number`);
  }

  let presentValueOfCashFlows = 0;
  let projectedCashFlow = a.base_cash_flow;
  for (let year = 1; year <= years; year += 1) {
    projectedCashFlow *= 1 + a.growth_rate;
    presentValueOfCashFlows += projectedCashFlow / (1 + a.discount_rate) ** year;
  }

  // Gordon-growth terminal value on the final projected year, then discounted.
  const terminalValue =
    (projectedCashFlow * (1 + a.terminal_growth)) / (a.discount_rate - a.terminal_growth);
  const presentValueOfTerminal = terminalValue / (1 + a.discount_rate) ** years;

  const enterpriseValue = presentValueOfCashFlows + presentValueOfTerminal;
  const equityValue = enterpriseValue - (a.net_debt ?? 0);
  const intrinsicValuePerShare = equityValue / a.shares_outstanding;

  return {
    intrinsic_value_per_share: intrinsicValuePerShare,
    enterprise_value: enterpriseValue,
    equity_value: equityValue,
    present_value_of_cash_flows: presentValueOfCashFlows,
    present_value_of_terminal: presentValueOfTerminal,
  };
}
