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
    avatar_color: string;
    locale: string | null;
    timezone: string | null;
  };
}

export interface PreferencesPatch {
  reporting_currency?: string;
  realization_accounting_method?: 'fifo' | 'lifo' | 'average_cost';
  combined_headline_metric?: string;
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
        'avatar_color',
        'locale',
        'timezone',
      ])
      .where('user_id', '=', userId)
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
        avatar_color: prefs?.avatar_color ?? 'sky',
        locale: prefs?.locale ?? null,
        timezone: prefs?.timezone ?? null,
      },
    };
  }

  async upsertPreferences(userId: string, patch: PreferencesPatch): Promise<void> {
    await this.db
      .insertInto('authentication.user_preferences')
      .values({
        user_id: userId,
        ...definedPreferences(patch),
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({ ...definedPreferences(patch), updated_at: new Date() }),
      )
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

/** Strip undefined keys so an upsert only writes the fields actually provided. */
function definedPreferences(patch: PreferencesPatch): PreferencesPatch {
  const out: PreferencesPatch = {};
  for (const [key, value] of Object.entries(patch)) {
    if (value !== undefined) (out as Record<string, unknown>)[key] = value;
  }
  return out;
}
