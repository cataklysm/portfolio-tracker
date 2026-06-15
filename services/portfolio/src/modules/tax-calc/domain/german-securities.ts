import Decimal from 'decimal.js';

/**
 * German securities (equity) tax estimate engine. Pure and I/O-free: it takes
 * realized sells already expressed in the tax currency, the portfolio's tax
 * settings, and any prior state, and returns a per-sale tax result plus derived
 * tax state (loss pots, per-year summary, expected/outstanding corrections).
 *
 * It is an ESTIMATE, never tax advice, and it never mutates the recorded-tax
 * ledger: "withheld" here means *would be withheld* by a broker with automatic
 * withholding enabled. Actual cash withheld/refunded lives in portfolio.tax_events
 * and is reconciled in via `bookedTaxCorrection`.
 *
 * German rules modelled (v1, equity only — funds/ETFs deferred):
 *  - Stock losses feed the stock loss pot (GROSS loss, not the tax saving) and can
 *    only offset stock gains.
 *  - Within a calendar year a loss first nets against gains already realized that
 *    year (reducing the estimate, and — where the gain was withheld — producing an
 *    expected tax correction); only the unabsorbed remainder carries forward in the
 *    pot. Across years the pot carries; it never refunds a prior year's tax.
 *  - The exemption order is applied per portfolio by its effective date; the
 *    consumed amount is derived here per calendar year, never configured.
 */

export interface GermanSecuritiesParams {
  /** Capital gains (Abgeltung) tax rate, e.g. 0.25. */
  capitalGainsTaxRate: Decimal;
  /** Solidarity surcharge as a fraction OF the capital gains tax, e.g. 0.055. */
  solidaritySurchargeRate: Decimal;
  /** Church tax as a fraction OF the capital gains tax (e.g. 0.09), or null if disabled. */
  churchTaxRate: Decimal | null;
}

/** One configured exemption-order amount, effective over a date range. */
export interface ExemptionOrderEntry {
  validFrom: string;
  validTo: string | null;
  amount: Decimal;
}

/** A realized sell, already converted to the tax currency. */
export interface RealizedSecuritySale {
  sellTransactionId: string;
  /** Tax-relevant value date (YYYY-MM-DD): orders the replay, picks year + exemption. */
  date: string;
  assetClass: string;
  /** Economic P&L in the tax currency (signed; loss negative). */
  economicGainLoss: Decimal;
  /** Tax-relevant P&L in the tax currency (signed). For equity v1 it equals economic. */
  taxRelevantGainLoss: Decimal;
}

export interface GermanSecuritiesInput {
  taxCurrency: string;
  ruleKey: string;
  ruleVersion: number;
  params: GermanSecuritiesParams;
  automaticTaxWithholding: boolean;
  exemptionOrderHistory: ExemptionOrderEntry[];
  /** Realized sells in the tax currency; processed in date order (stable). */
  sales: RealizedSecuritySale[];
  /** Opening carry-forward stock loss pot (e.g. from a prior period). Default 0. */
  openingStockLossPot?: Decimal;
  /** Opening general capital loss pot (unused by equity v1; passed through). Default 0. */
  openingGeneralCapitalLossPot?: Decimal;
  /** Tax already booked as refunded/corrected by the broker (tax ledger). Default 0. */
  bookedTaxCorrection?: Decimal;
}

export type TaxWithholdingStatus = 'withheld' | 'estimated_not_withheld' | 'loss' | 'fully_offset';

/** Per-sale structured tax result (spec §"Transaction-Level Tax Result"). */
export interface PerSaleTaxResult {
  sellTransactionId: string;
  date: string;
  assetClass: string;
  economicGainLoss: string;
  taxRelevantGainLoss: string;
  appliedTaxRuleKey: string;
  appliedTaxRuleVersion: number;
  usedLossPotAmount: string;
  addedLossPotAmount: string;
  usedExemptionAmount: string;
  calculatedTax: string;
  withheldTax: string;
  /** Same-year expected refund this loss triggers against previously withheld gains. */
  expectedTaxCorrection: string;
  remainingTaxableGain: string;
  taxWithholdingStatus: TaxWithholdingStatus;
}

export interface YearTaxSummary {
  year: number;
  realizedGains: string;
  realizedLosses: string;
  /** Net taxable base after loss offset + exemption. */
  taxableGain: string;
  usedExemption: string;
  calculatedTax: string;
  withheldTax: string;
}

export interface GermanSecuritiesResult {
  taxCurrency: string;
  appliedTaxRuleKey: string;
  appliedTaxRuleVersion: number;
  perSale: PerSaleTaxResult[];
  byYear: YearTaxSummary[];
  stockLossPot: string;
  generalCapitalLossPot: string;
  totalCalculatedTax: string;
  totalWithheldTax: string;
  expectedTaxCorrection: string;
  bookedTaxCorrection: string;
  /** What the broker still owes back: max(0, expected − booked). */
  outstandingTaxCorrection: string;
}

const ZERO = new Decimal(0);

interface YearState {
  gains: Decimal;
  losses: Decimal;
  taxable: Decimal;
  exemption: Decimal;
  calc: Decimal;
  withheld: Decimal;
  /** Taxed base realized this year still available to be reversed by a later loss. */
  taxedBase: Decimal;
  /** Subset of taxedBase that was actually withheld (drives the correction). */
  withheldBase: Decimal;
}

export function computeGermanSecuritiesTax(input: GermanSecuritiesInput): GermanSecuritiesResult {
  const { params, automaticTaxWithholding: autoWithhold } = input;
  let pot = input.openingStockLossPot ?? ZERO;
  let expectedCorrection = ZERO;
  let totalCalc = ZERO;
  let totalWithheld = ZERO;

  const exemptionConsumed = new Map<number, Decimal>();
  const years = new Map<number, YearState>();
  const perSale: PerSaleTaxResult[] = [];

  // Stable chronological replay. Array.prototype.sort is stable, so equal dates
  // keep their incoming ledger order.
  const sorted = [...input.sales].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  for (const sale of sorted) {
    const year = Number(sale.date.slice(0, 4));
    const y = yearState(years, year);
    const g = sale.taxRelevantGainLoss;

    if (g.lte(0)) {
      const loss = g.negated();
      y.losses = y.losses.plus(loss);

      // Net against same-year taxed gains first; only the remainder carries forward.
      const offsetEstimate = Decimal.min(loss, y.taxedBase);
      const offsetWithheld = Decimal.min(loss, y.withheldBase);
      const estimateReversed = taxOn(offsetEstimate, params).total;
      const withheldReversed = taxOn(offsetWithheld, params).total;

      y.taxedBase = y.taxedBase.minus(offsetEstimate);
      y.withheldBase = y.withheldBase.minus(offsetWithheld);
      y.taxable = y.taxable.minus(offsetEstimate);
      y.calc = y.calc.minus(estimateReversed);
      y.withheld = y.withheld.minus(withheldReversed);
      totalCalc = totalCalc.minus(estimateReversed);
      totalWithheld = totalWithheld.minus(withheldReversed);
      expectedCorrection = expectedCorrection.plus(withheldReversed);

      const addedToPot = loss.minus(offsetEstimate);
      pot = pot.plus(addedToPot);

      perSale.push({
        ...identity(sale, input),
        usedLossPotAmount: money(ZERO),
        addedLossPotAmount: money(addedToPot),
        usedExemptionAmount: money(ZERO),
        calculatedTax: money(ZERO),
        withheldTax: money(ZERO),
        expectedTaxCorrection: money(withheldReversed),
        remainingTaxableGain: money(ZERO),
        taxWithholdingStatus: 'loss',
      });
      continue;
    }

    // Gain: offset the stock loss pot, then apply the effective exemption order.
    const usedPot = Decimal.min(g, pot);
    pot = pot.minus(usedPot);
    const afterLoss = g.minus(usedPot);

    const cap = effectiveExemption(input.exemptionOrderHistory, sale.date);
    const consumed = exemptionConsumed.get(year) ?? ZERO;
    const available = Decimal.max(ZERO, cap.minus(consumed));
    const usedExemption = Decimal.min(afterLoss, available);
    exemptionConsumed.set(year, consumed.plus(usedExemption));

    const remaining = afterLoss.minus(usedExemption);
    const tax = taxOn(remaining, params);
    const withheld = autoWithhold ? tax.total : ZERO;

    y.gains = y.gains.plus(g);
    y.taxable = y.taxable.plus(remaining);
    y.exemption = y.exemption.plus(usedExemption);
    y.calc = y.calc.plus(tax.total);
    y.withheld = y.withheld.plus(withheld);
    y.taxedBase = y.taxedBase.plus(remaining);
    if (autoWithhold) y.withheldBase = y.withheldBase.plus(remaining);
    totalCalc = totalCalc.plus(tax.total);
    totalWithheld = totalWithheld.plus(withheld);

    const status: TaxWithholdingStatus = remaining.lte(0)
      ? 'fully_offset'
      : autoWithhold
        ? 'withheld'
        : 'estimated_not_withheld';

    perSale.push({
      ...identity(sale, input),
      usedLossPotAmount: money(usedPot),
      addedLossPotAmount: money(ZERO),
      usedExemptionAmount: money(usedExemption),
      calculatedTax: money(tax.total),
      withheldTax: money(withheld),
      expectedTaxCorrection: money(ZERO),
      remainingTaxableGain: money(remaining),
      taxWithholdingStatus: status,
    });
  }

  const booked = input.bookedTaxCorrection ?? ZERO;
  const outstanding = Decimal.max(ZERO, expectedCorrection.minus(booked));

  const byYear: YearTaxSummary[] = [...years.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, s]) => ({
      year,
      realizedGains: money(s.gains),
      realizedLosses: money(s.losses),
      taxableGain: money(Decimal.max(ZERO, s.taxable)),
      usedExemption: money(s.exemption),
      calculatedTax: money(Decimal.max(ZERO, s.calc)),
      withheldTax: money(Decimal.max(ZERO, s.withheld)),
    }));

  return {
    taxCurrency: input.taxCurrency,
    appliedTaxRuleKey: input.ruleKey,
    appliedTaxRuleVersion: input.ruleVersion,
    perSale,
    byYear,
    stockLossPot: money(pot),
    generalCapitalLossPot: money(input.openingGeneralCapitalLossPot ?? ZERO),
    totalCalculatedTax: money(Decimal.max(ZERO, totalCalc)),
    totalWithheldTax: money(Decimal.max(ZERO, totalWithheld)),
    expectedTaxCorrection: money(expectedCorrection),
    bookedTaxCorrection: money(booked),
    outstandingTaxCorrection: money(outstanding),
  };
}

interface TaxBreakdown {
  cgt: Decimal;
  solidarity: Decimal;
  church: Decimal;
  total: Decimal;
}

/** Capital gains tax + solidarity surcharge + church tax on a (non-negative) base. */
function taxOn(base: Decimal, params: GermanSecuritiesParams): TaxBreakdown {
  if (base.lte(0)) return { cgt: ZERO, solidarity: ZERO, church: ZERO, total: ZERO };
  const cgt = base.times(params.capitalGainsTaxRate);
  const solidarity = cgt.times(params.solidaritySurchargeRate);
  const church = params.churchTaxRate ? cgt.times(params.churchTaxRate) : ZERO;
  return { cgt, solidarity, church, total: cgt.plus(solidarity).plus(church) };
}

/** The configured exemption amount in force on `date` (latest matching range), else 0. */
function effectiveExemption(history: ExemptionOrderEntry[], date: string): Decimal {
  let best: ExemptionOrderEntry | null = null;
  for (const entry of history) {
    if (entry.validFrom > date) continue;
    if (entry.validTo !== null && entry.validTo < date) continue;
    if (!best || entry.validFrom > best.validFrom) best = entry;
  }
  return best ? best.amount : ZERO;
}

function yearState(years: Map<number, YearState>, year: number): YearState {
  let s = years.get(year);
  if (!s) {
    s = {
      gains: ZERO,
      losses: ZERO,
      taxable: ZERO,
      exemption: ZERO,
      calc: ZERO,
      withheld: ZERO,
      taxedBase: ZERO,
      withheldBase: ZERO,
    };
    years.set(year, s);
  }
  return s;
}

function identity(sale: RealizedSecuritySale, input: GermanSecuritiesInput) {
  return {
    sellTransactionId: sale.sellTransactionId,
    date: sale.date,
    assetClass: sale.assetClass,
    economicGainLoss: money(sale.economicGainLoss),
    taxRelevantGainLoss: money(sale.taxRelevantGainLoss),
    appliedTaxRuleKey: input.ruleKey,
    appliedTaxRuleVersion: input.ruleVersion,
  };
}

function money(value: Decimal): string {
  return value.toFixed(2);
}
