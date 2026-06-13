import Decimal from 'decimal.js';

/**
 * All monetary and quantity arithmetic runs through this configured Decimal
 * type — never JavaScript `number` — so many small savings-plan executions do
 * not accumulate floating-point rounding error.
 */
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
export type Money = Decimal;

export function dec(value: string | number | Decimal): Decimal {
  return new D(value);
}
