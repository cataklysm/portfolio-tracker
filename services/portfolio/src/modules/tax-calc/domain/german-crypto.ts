import Decimal from 'decimal.js';

/**
 * German crypto private-disposal (§23 EStG) estimate engine. Pure and I/O-free.
 * Crypto is NOT German capital-gains-tax income: this engine only reports the
 * tax-RELEVANT gain/loss to be declared, never a withheld tax. It deliberately
 * does NOT compute capital gains tax, does NOT touch any securities loss pot, does
 * NOT apply the saver's allowance/exemption order, and never records withholding
 * (spec §"German Crypto Tax Handling").
 *
 * The only rule modelled is the one-year speculation period: a disposal held
 * longer than the holding period is tax-free; otherwise the gain/loss is
 * tax-relevant for the disposal year. Final taxation depends on the user's
 * personal income tax rate, which v1 does not estimate.
 *
 * Input is one entry per FIFO lot consumption (FIFO is the required method for
 * §23), already converted to the tax currency by the caller; this engine classifies
 * each by holding period and aggregates per calendar year.
 */

export interface GermanCryptoParams {
  /** Speculation period; disposals held longer are tax-free. Germany: 12. */
  holdingPeriodMonths: number;
  /**
   * Annual §23 Freigrenze (e.g. 1000 EUR from 2024) — informational only. It is a
   * threshold across ALL of a person's private disposals, which the tracker cannot
   * fully see, so it never decides taxability here; it only flags a likely-tax-free
   * year. (Mirrors the rule that we never track globally-consumed allowances.)
   */
  annualFreeLimit: Decimal;
}

/** One consumed buy→sell lot, already in the tax currency (FIFO pairing). */
export interface CryptoDisposalLot {
  sellTransactionId: string;
  /** Acquisition date of the consumed buy lot (YYYY-MM-DD). */
  acquisitionDate: string;
  /** Disposal (tax-relevant value) date of the sell (YYYY-MM-DD). */
  disposalDate: string;
  /** Realized gain/loss for this consumed lot in the tax currency (signed). */
  gainLoss: Decimal;
}

export interface GermanCryptoInput {
  taxCurrency: string;
  ruleKey: string;
  ruleVersion: number;
  params: GermanCryptoParams;
  lots: CryptoDisposalLot[];
}

export interface PerDisposalResult {
  sellTransactionId: string;
  acquisitionDate: string;
  disposalDate: string;
  holdingPeriodDays: number;
  /** Held longer than the speculation period → tax-free. */
  longTerm: boolean;
  gainLoss: string;
  /** Tax-relevant for income-tax declaration (i.e. not long-term). */
  taxRelevant: boolean;
  appliedTaxRuleKey: string;
  appliedTaxRuleVersion: number;
}

export interface CryptoYearSummary {
  year: number;
  /** Sum of tax-relevant positive gains (short-term). */
  taxableGain: string;
  /** Sum of magnitudes of tax-relevant losses (short-term). */
  realizedLosses: string;
  /** taxableGain − realizedLosses (may be negative). */
  netTaxRelevant: string;
  /** Sum of gains from disposals held beyond the period (tax-free). */
  taxFreeGains: string;
  annualFreeLimit: string;
  /** Net tax-relevant gain is below the annual Freigrenze — likely tax-free (informational). */
  belowAnnualFreeLimit: boolean;
}

export interface GermanCryptoResult {
  taxCurrency: string;
  appliedTaxRuleKey: string;
  appliedTaxRuleVersion: number;
  perDisposal: PerDisposalResult[];
  byYear: CryptoYearSummary[];
  /** Standing disclosure: this is gain/loss reporting only, not a tax calculation. */
  note: string;
}

const ZERO = new Decimal(0);
const NOTE =
  'Crypto private disposals are reported as tax-relevant gains/losses only. ' +
  'No capital gains tax is withheld or calculated; final taxation depends on your personal income tax rate and filing.';

interface YearAccumulator {
  taxableGain: Decimal;
  realizedLosses: Decimal;
  taxFreeGains: Decimal;
}

export function computeGermanCryptoTax(input: GermanCryptoInput): GermanCryptoResult {
  const perDisposal: PerDisposalResult[] = [];
  const years = new Map<number, YearAccumulator>();

  for (const lot of input.lots) {
    const longTerm = isLongTerm(lot.acquisitionDate, lot.disposalDate, input.params.holdingPeriodMonths);
    const taxRelevant = !longTerm;
    const year = Number(lot.disposalDate.slice(0, 4));
    const acc = yearAcc(years, year);
    const g = lot.gainLoss;

    if (longTerm) {
      // Tax-free: only positive gains are reported as tax-free gains; long-term
      // losses are not deductible under §23 and are simply not tax-relevant.
      if (g.gt(0)) acc.taxFreeGains = acc.taxFreeGains.plus(g);
    } else if (g.gte(0)) {
      acc.taxableGain = acc.taxableGain.plus(g);
    } else {
      acc.realizedLosses = acc.realizedLosses.plus(g.negated());
    }

    perDisposal.push({
      sellTransactionId: lot.sellTransactionId,
      acquisitionDate: lot.acquisitionDate,
      disposalDate: lot.disposalDate,
      holdingPeriodDays: daysBetween(lot.acquisitionDate, lot.disposalDate),
      longTerm,
      gainLoss: g.toFixed(2),
      taxRelevant,
      appliedTaxRuleKey: input.ruleKey,
      appliedTaxRuleVersion: input.ruleVersion,
    });
  }

  const limit = input.params.annualFreeLimit;
  const byYear: CryptoYearSummary[] = [...years.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([year, a]) => {
      const net = a.taxableGain.minus(a.realizedLosses);
      const netGain = Decimal.max(ZERO, net);
      return {
        year,
        taxableGain: a.taxableGain.toFixed(2),
        realizedLosses: a.realizedLosses.toFixed(2),
        netTaxRelevant: net.toFixed(2),
        taxFreeGains: a.taxFreeGains.toFixed(2),
        annualFreeLimit: limit.toFixed(2),
        belowAnnualFreeLimit: netGain.lt(limit),
      };
    });

  return {
    taxCurrency: input.taxCurrency,
    appliedTaxRuleKey: input.ruleKey,
    appliedTaxRuleVersion: input.ruleVersion,
    perDisposal,
    byYear,
    note: NOTE,
  };
}

/** True when the disposal is strictly more than `months` after acquisition (tax-free). */
function isLongTerm(acquisitionDate: string, disposalDate: string, months: number): boolean {
  const [ay, am, ad] = acquisitionDate.split('-').map(Number) as [number, number, number];
  const threshold = Date.UTC(ay, am - 1 + months, ad);
  return timestamp(disposalDate) > threshold;
}

function daysBetween(from: string, to: string): number {
  return Math.round((timestamp(to) - timestamp(from)) / 86_400_000);
}

function timestamp(date: string): number {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return Date.UTC(y, m - 1, d);
}

function yearAcc(years: Map<number, YearAccumulator>, year: number): YearAccumulator {
  let a = years.get(year);
  if (!a) {
    a = { taxableGain: ZERO, realizedLosses: ZERO, taxFreeGains: ZERO };
    years.set(year, a);
  }
  return a;
}
