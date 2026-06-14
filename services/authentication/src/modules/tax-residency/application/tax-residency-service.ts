import { AppError } from '@portfolio/platform';
import type {
  KyselyTaxResidencyRepository,
  TaxResidency,
} from '../infrastructure/tax-residency-repository.js';

export interface SetTaxResidencyInput {
  countryCode: string;
  validFrom: string;
  isPrimary?: boolean;
}

export interface TaxResidencyView {
  /** The open-ended (currently effective) residence, or null if never set. */
  current: TaxResidency | null;
  /** Full effective-dated history, newest first. */
  history: TaxResidency[];
}

/**
 * The authenticated user's tax residence. This is recorded information that
 * controls jurisdiction-specific labels and disclosures only — it never makes
 * the tracker compute local tax. Residence is explicitly user-confirmed and must
 * never be inferred from locale, currency, citizenship, or broker country.
 */
export class TaxResidencyService {
  constructor(private readonly repo: KyselyTaxResidencyRepository) {}

  async get(userId: string): Promise<TaxResidencyView> {
    const history = await this.repo.listForUser(userId);
    return { current: history.find((r) => r.valid_until === null) ?? null, history };
  }

  async set(userId: string, input: SetTaxResidencyInput): Promise<TaxResidencyView> {
    const countryCode = normalizeCountry(input.countryCode);
    const validFrom = requireDate(input.validFrom, 'valid_from');
    await this.repo.setResidency(userId, { countryCode, validFrom, isPrimary: input.isPrimary ?? true });
    return this.get(userId);
  }
}

function normalizeCountry(raw: string): string {
  const code = raw.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(code)) {
    throw AppError.badRequest('invalid_country_code', 'country_code must be an ISO 3166-1 alpha-2 code');
  }
  return code;
}

function requireDate(raw: string, field: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw AppError.badRequest('invalid_date', `${field} must be YYYY-MM-DD`);
  return raw;
}
