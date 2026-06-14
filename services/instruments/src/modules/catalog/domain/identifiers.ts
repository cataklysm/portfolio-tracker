/**
 * Normalization rules for instrument and listing identifiers. Symbols and ISINs
 * are upper-cased and trimmed so duplicate detection and the database unique
 * constraints behave consistently regardless of how the value was entered.
 */

export const ASSET_TYPES = ['equity', 'crypto', 'fund'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase();
}

export function normalizeIsin(isin: string): string {
  return isin.trim().toUpperCase();
}

export function normalizeMic(mic: string): string {
  return mic.trim().toUpperCase();
}
