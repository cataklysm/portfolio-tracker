import type { Kysely } from 'kysely';
import type { AuthDatabase } from '../../../platform/database/schema.js';

export interface UserProfile {
  id: string;
  email: string;
  display_name: string | null;
  role: 'user' | 'admin';
  preferences: {
    reporting_currency: string;
    realization_accounting_method: 'fifo' | 'lifo' | 'average_cost';
    combined_headline_metric: string;
    /** Benchmark listing id for the combined all-portfolios view, or null if unset. */
    combined_benchmark: string | null;
    avatar_color: string;
    locale: string | null;
    timezone: string | null;
  };
  /** Current (open-ended) primary tax residence; null until the user sets one. */
  tax_residence: { country_code: string; valid_from: string } | null;
}

export interface PreferencesPatch {
  reporting_currency?: string;
  realization_accounting_method?: 'fifo' | 'lifo' | 'average_cost';
  combined_headline_metric?: string;
  /** A benchmark listing id, or null to clear the combined-view benchmark. */
  combined_benchmark?: string | null;
  avatar_color?: string;
  locale?: string | null;
  timezone?: string | null;
}

/**
 * Reads and writes the user identity and preferences the authentication service
 * owns. Other services obtain these values over HTTP rather than reading these
 * tables directly.
 */
export class KyselyProfileRepository {
  constructor(private readonly db: Kysely<AuthDatabase>) {}

  async getProfile(userId: string): Promise<UserProfile | null> {
    const user = await this.db
      .selectFrom('authentication.users')
      .select(['id', 'email', 'display_name', 'role'])
      .where('id', '=', userId)
      .where('active', '=', true)
      .executeTakeFirst();
    if (!user) return null;

    const prefs = await this.db
      .selectFrom('authentication.user_preferences')
      .select([
        'reporting_currency',
        'realization_accounting_method',
        'combined_headline_metric',
        'combined_benchmark',
        'avatar_color',
        'locale',
        'timezone',
      ])
      .where('user_id', '=', userId)
      .executeTakeFirst();

    const residence = await this.db
      .selectFrom('authentication.tax_residencies')
      .select(['country_code', 'valid_from'])
      .where('user_id', '=', userId)
      .where('valid_until', 'is', null)
      .where('is_primary', '=', true)
      .executeTakeFirst();

    return {
      id: user.id,
      email: user.email,
      display_name: user.display_name,
      role: user.role,
      preferences: {
        reporting_currency: prefs?.reporting_currency ?? 'EUR',
        realization_accounting_method: prefs?.realization_accounting_method ?? 'fifo',
        combined_headline_metric: prefs?.combined_headline_metric ?? 'total_return',
        combined_benchmark: parseCombinedBenchmark(prefs?.combined_benchmark),
        avatar_color: prefs?.avatar_color ?? 'sky',
        locale: prefs?.locale ?? null,
        timezone: prefs?.timezone ?? null,
      },
      tax_residence: residence ? { country_code: residence.country_code, valid_from: dateStr(residence.valid_from) } : null,
    };
  }

  async upsertPreferences(userId: string, patch: PreferencesPatch): Promise<void> {
    const row = preferencesRow(patch);
    await this.db
      .insertInto('authentication.user_preferences')
      .values({ user_id: userId, ...row })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ ...row, updated_at: new Date() }))
      .execute();
  }

  async updateDisplayName(userId: string, displayName: string): Promise<void> {
    await this.db
      .updateTable('authentication.users')
      .set({ display_name: displayName, updated_at: new Date() })
      .where('id', '=', userId)
      .execute();
  }
}

/** `date` columns may arrive as a Date (driver-dependent); normalize to YYYY-MM-DD. */
function dateStr(value: Date | string): string {
  return typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10);
}

/**
 * Strip undefined keys so an upsert only writes the fields actually provided.
 * `combined_benchmark` is a jsonb column, so its value (a listing id, or null to
 * clear) is JSON-encoded — a bare id becomes the jsonb string `"id"`, null
 * becomes jsonb `null`.
 */
function preferencesRow(patch: PreferencesPatch): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    out[key] = key === 'combined_benchmark' ? JSON.stringify(value) : value;
  }
  return out;
}

/**
 * Resolves the stored combined benchmark to a listing id. The jsonb column holds
 * either a bare listing-id string, a `{ listing_id }` object, or the legacy
 * `{ type, identifier }` catalog default — the latter (and null) read as unset
 * until the curated benchmark catalog resolves keys to seeded listings.
 */
function parseCombinedBenchmark(raw: unknown): string | null {
  if (typeof raw === 'string') return raw.length > 0 ? raw : null;
  if (raw && typeof raw === 'object' && 'listing_id' in raw) {
    const id = (raw as { listing_id?: unknown }).listing_id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
  return null;
}
