import type { Kysely, Selectable } from 'kysely';
import type { ProvidersDatabase, ProviderSettingsTable } from '../platform/database/schema.js';
import type { ProviderSettings, ProviderSettingsUpdate } from './types.js';

/**
 * Reads and updates the admin-editable provider settings in
 * `providers.provider_settings` — the source of truth for provider config. The
 * registry reads it once at startup (for routing/class checks); the admin and
 * `/internal/providers` endpoints read it live so edits take effect without a
 * restart for the market scheduler's pacing.
 */
export class ProviderSettingsRepository {
  constructor(private readonly db: Kysely<ProvidersDatabase>) {}

  async listAll(): Promise<ProviderSettings[]> {
    const rows = await this.db
      .selectFrom('providers.provider_settings')
      .selectAll()
      .orderBy('provider')
      .execute();
    return rows.map(toSettings);
  }

  async getByName(provider: string): Promise<ProviderSettings | null> {
    const row = await this.db
      .selectFrom('providers.provider_settings')
      .selectAll()
      .where('provider', '=', provider)
      .executeTakeFirst();
    return row ? toSettings(row) : null;
  }

  /** Updates the editable fields of one provider; returns the updated row, or null if unknown. */
  async update(provider: string, patch: ProviderSettingsUpdate): Promise<ProviderSettings | null> {
    const values: Record<string, unknown> = { updated_at: new Date() };
    if (patch.enabled !== undefined) values.enabled = patch.enabled;
    if (patch.dataQuality !== undefined) values.data_quality = patch.dataQuality;
    if (patch.maxBatchSize !== undefined) values.max_batch_size = patch.maxBatchSize;
    if (patch.rateLimitPerMin !== undefined) values.rate_limit_per_min = patch.rateLimitPerMin;
    if (patch.maxConcurrency !== undefined) values.max_concurrency = patch.maxConcurrency;
    await this.db
      .updateTable('providers.provider_settings')
      .set(values)
      .where('provider', '=', provider)
      .execute();
    return this.getByName(provider);
  }
}

function toSettings(r: Selectable<ProviderSettingsTable>): ProviderSettings {
  return {
    provider: r.provider,
    enabled: r.enabled,
    providerClass: r.provider_class,
    dataQuality: r.data_quality,
    capabilityQuality: r.capability_quality ?? {},
    maxBatchSize: r.max_batch_size,
    rateLimitPerMin: r.rate_limit_per_min,
    maxConcurrency: r.max_concurrency,
  };
}
