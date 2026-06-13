import { createHash } from 'node:crypto';
import type {
  CorporateActionInput,
  CorporateActionRow,
  EarningsRow,
  EarningsSnapshot,
  NewsItem,
  NewsRow,
} from '../application/ports.js';

function numToStr(value: number | null): string | null {
  return value === null || !Number.isFinite(value) ? null : String(value);
}

/** UTC YYYY-MM-DD for an epoch-ms timestamp. */
function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/** Calendar-derived fiscal year + quarter from a period/report date. Yahoo does
 * not expose fiscal labels, so we approximate from the date (good enough for
 * grouping; fiscal years that differ from calendar are a known limitation). */
function fiscalFromMs(ms: number): { year: number; quarter: number } {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), quarter: Math.floor(d.getUTCMonth() / 3) + 1 };
}

/**
 * Deterministic UUID (v5-style, SHA-1) so the same corporate action keeps a
 * stable id across refreshes without a provider-supplied identifier. Keyed on
 * the instrument, action type, and ex-date — the natural identity of the fact.
 */
export function stableActionId(key: string): string {
  const h = createHash('sha1').update(key).digest();
  const b = Buffer.from(h.subarray(0, 16));
  b[6] = ((b[6] as number) & 0x0f) | 0x50; // version 5
  b[8] = ((b[8] as number) & 0x3f) | 0x80; // RFC 4122 variant
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** Maps an earnings snapshot to storage rows (history + the upcoming report). */
export function toEarningsRows(instrumentId: string, provider: string, snap: EarningsSnapshot): EarningsRow[] {
  const rows: EarningsRow[] = [];

  for (const period of snap.history) {
    const ms = period.periodEndMs ?? period.reportDateMs;
    if (ms === null) continue;
    const { year, quarter } = fiscalFromMs(ms);
    rows.push({
      instrumentId,
      fiscalYear: year,
      fiscalQuarter: quarter,
      periodEndDate: period.periodEndMs !== null ? isoDate(period.periodEndMs) : null,
      reportDate: period.reportDateMs !== null ? isoDate(period.reportDateMs) : null,
      epsEstimate: numToStr(period.epsEstimate),
      epsActual: numToStr(period.epsActual),
      revenueEstimate: numToStr(period.revenueEstimate),
      revenueActual: numToStr(period.revenueActual),
      surprisePct: numToStr(period.surprisePct),
      provider,
      rawPayload: { ...period },
    });
  }

  const up = snap.upcoming;
  if (up && up.reportDateMs !== null) {
    const { year, quarter } = fiscalFromMs(up.reportDateMs);
    rows.push({
      instrumentId,
      fiscalYear: year,
      fiscalQuarter: quarter,
      periodEndDate: up.periodEndMs !== null ? isoDate(up.periodEndMs) : null,
      reportDate: isoDate(up.reportDateMs),
      epsEstimate: numToStr(up.epsEstimate),
      epsActual: null,
      revenueEstimate: numToStr(up.revenueEstimate),
      revenueActual: null,
      surprisePct: null,
      provider,
      rawPayload: { ...up, upcoming: true },
    });
  }

  return rows;
}

/** Maps provider corporate actions to storage rows (dividends + splits). */
export function toCorporateActionRows(
  instrumentId: string,
  provider: string,
  currency: string,
  actions: CorporateActionInput[],
): CorporateActionRow[] {
  const rows: CorporateActionRow[] = [];
  for (const action of actions) {
    const exDate = isoDate(action.dateMs);
    if (action.kind === 'dividend') {
      rows.push({
        stableActionId: stableActionId(`${instrumentId}:dividend:${exDate}`),
        version: 1,
        instrumentId,
        type: 'dividend',
        exDate,
        ratioNumerator: null,
        ratioDenominator: null,
        dividendAmount: numToStr(action.amount),
        dividendCurrency: currency,
        provider,
        rawPayload: { ...action },
      });
    } else {
      // A split must carry positive ratio components (DB CHECK). Skip malformed.
      if (!action.numerator || !action.denominator || action.numerator <= 0 || action.denominator <= 0) continue;
      const type = action.numerator >= action.denominator ? 'split' : 'reverse_split';
      rows.push({
        stableActionId: stableActionId(`${instrumentId}:split:${exDate}`),
        version: 1,
        instrumentId,
        type,
        exDate,
        ratioNumerator: numToStr(action.numerator),
        ratioDenominator: numToStr(action.denominator),
        dividendAmount: null,
        dividendCurrency: null,
        provider,
        rawPayload: { ...action },
      });
    }
  }
  return rows;
}

/** Maps provider news to storage rows (drops items with no timestamp). */
export function toNewsRows(instrumentId: string, provider: string, items: NewsItem[]): NewsRow[] {
  const rows: NewsRow[] = [];
  for (const item of items) {
    if (item.publishedAtMs === null || !item.url) continue;
    rows.push({
      instrumentId,
      publishedAt: new Date(item.publishedAtMs).toISOString(),
      provider,
      headline: item.title,
      url: item.url,
      rawPayload: { ...item },
    });
  }
  return rows;
}
