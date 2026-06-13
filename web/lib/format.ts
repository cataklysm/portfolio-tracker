export function fmtCurrency(locale: string, value: number, currency: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(value)
  } catch {
    return `${value.toFixed(2)} ${currency}`
  }
}

export function fmtQty(locale: string, value: number, assetType: string): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: assetType === "crypto" ? 8 : 4,
  }).format(value)
}

export function fmtPct(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`
}

/** Compact number (e.g. 1.39B, 451B), optionally as a currency. Used for large
 * fundamentals figures like market cap, revenue, and net debt. */
export function fmtCompact(locale: string, value: number, currency?: string): string {
  try {
    return new Intl.NumberFormat(locale, {
      notation: "compact",
      maximumFractionDigits: 2,
      ...(currency ? { style: "currency", currency } : {}),
    }).format(value)
  } catch {
    return value.toLocaleString(locale)
  }
}

/** parseFloat that returns null for null/undefined/empty rather than NaN. */
export function num(value: string | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number.parseFloat(value)
  return Number.isFinite(parsed) ? parsed : null
}
