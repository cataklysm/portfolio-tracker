import type { Kysely, Selectable } from 'kysely';
import type { ProvidersDatabase, ProviderCapabilityRefreshTable } from '../platform/database/schema.js';
import type { CapabilityRefresh, CapabilityRefreshUpdate } from './types.js';

/**
 * Reads and upserts the per-(provider × capability) refresh cadence in
 * `providers.provider_capability_refresh`. The market/fundamentals/events
 * refreshers read it live (each heartbeat) so cadence edits take effect without a
 * restart; the admin UI edits it through the gateway.
 */
export class CapabilityRefreshRepository {
  constructor(private readonly db: Kysely<ProvidersDatabase>) {}

  async listAll(): Promise<CapabilityRefresh[]> {
    const rows = await this.db
      .selectFrom('providers.provider_capability_refresh')
      .selectAll()
      .orderBy('provider')
      .orderBy('capability')
      .execute();
    return rows.map(toRefresh);
  }

  async listForProvider(provider: string): Promise<CapabilityRefresh[]> {
    const rows = await this.db
      .selectFrom('providers.provider_capability_refresh')
      .selectAll()
      .where('provider', '=', provider)
      .orderBy('capability')
      .execute();
    return rows.map(toRefresh);
  }

  /**
   * Upserts one (provider, capability) row. A first edit for a pair inserts it;
   * later edits patch only the provided fields. `refreshIntervalMs` is required on
   * insert (the table has no default), so it must be present when the row is new.
   */
  async upsert(
    provider: string,
    capability: string,
    patch: CapabilityRefreshUpdate,
  ): Promise<CapabilityRefresh | null> {
    const existing = await this.db
      .selectFrom('providers.provider_capability_refresh')
      .selectAll()
      .where('provider', '=', provider)
      .where('capability', '=', capability)
      .executeTakeFirst();

    if (existing) {
      const values: Record<string, unknown> = { updated_at: new Date() };
      if (patch.refreshIntervalMs !== undefined) values.refresh_interval_ms = patch.refreshIntervalMs;
      if (patch.saveResolutionMs !== undefined) values.save_resolution_ms = patch.saveResolutionMs;
      if (patch.enabled !== undefined) values.enabled = patch.enabled;
      await this.db
        .updateTable('providers.provider_capability_refresh')
        .set(values)
        .where('provider', '=', provider)
        .where('capability', '=', capability)
        .execute();
    } else {
      if (patch.refreshIntervalMs === undefined) return null;
      await this.db
        .insertInto('providers.provider_capability_refresh')
        .values({
          provider,
          capability,
          refresh_interval_ms: patch.refreshIntervalMs,
          save_resolution_ms: patch.saveResolutionMs ?? null,
          enabled: patch.enabled ?? true,
          updated_at: new Date(),
        })
        .execute();
    }

    const row = await this.db
      .selectFrom('providers.provider_capability_refresh')
      .selectAll()
      .where('provider', '=', provider)
      .where('capability', '=', capability)
      .executeTakeFirst();
    return row ? toRefresh(row) : null;
  }
}

function toRefresh(r: Selectable<ProviderCapabilityRefreshTable>): CapabilityRefresh {
  return {
    provider: r.provider,
    capability: r.capability,
    refreshIntervalMs: r.refresh_interval_ms,
    saveResolutionMs: r.save_resolution_ms,
    enabled: r.enabled,
  };
}
