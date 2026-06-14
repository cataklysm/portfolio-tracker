import type Decimal from 'decimal.js';
import { dec } from './money.js';

/**
 * Builds a currency converter from a set of ECB-style EUR-based rates, where
 * each rate is "units of that currency per 1 EUR". Conversion pivots through
 * EUR. If a required rate is missing the converter returns null so the caller
 * can surface the value as unavailable rather than silently using a wrong rate.
 */
export function makeConverter(
  eurRates: Map<string, string>,
  from: string,
  to: string,
): (amount: Decimal) => Decimal | null {
  return (amount: Decimal) => {
    if (from === to) return amount;
    const fromRate = from === 'EUR' ? dec(1) : rateOrNull(eurRates, from);
    const toRate = to === 'EUR' ? dec(1) : rateOrNull(eurRates, to);
    if (fromRate === null || toRate === null || fromRate.lte(0)) return null;
    return amount.div(fromRate).times(toRate);
  };
}

function rateOrNull(eurRates: Map<string, string>, currency: string): Decimal | null {
  const raw = eurRates.get(currency);
  return raw === undefined ? null : dec(raw);
}

/**
 * Builds a historical converter that converts an amount in a given currency to
 * the reporting currency using the EUR-based rate that applied on a specific
 * value date. `historicalRates` is keyed `${currency}@${date}` (units of that
 * currency per 1 EUR, on or before the date). Returns null when a needed rate is
 * absent so the caller can fall back to the latest rate or report unavailable.
 */
export function makeDatedConverter(
  historicalRates: Map<string, string>,
  reportingCurrency: string,
): (amount: Decimal, fromCurrency: string, valueDate: string) => Decimal | null {
  return (amount, fromCurrency, valueDate) => {
    if (fromCurrency === reportingCurrency) return amount;
    const fromRate = fromCurrency === 'EUR' ? dec(1) : datedRateOrNull(historicalRates, fromCurrency, valueDate);
    const toRate = reportingCurrency === 'EUR' ? dec(1) : datedRateOrNull(historicalRates, reportingCurrency, valueDate);
    if (fromRate === null || toRate === null || fromRate.lte(0)) return null;
    return amount.div(fromRate).times(toRate);
  };
}

function datedRateOrNull(rates: Map<string, string>, currency: string, valueDate: string): Decimal | null {
  const raw = rates.get(`${currency}@${valueDate}`);
  return raw === undefined ? null : dec(raw);
}
