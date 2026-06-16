import type { ColumnType, Generated } from 'kysely';
import type { Capability, DataQuality, ProviderClass } from '../../providers/types.js';

/**
 * Kysely schema for the providers service. It owns the single `providers.*`
 * table: admin-editable, provider-intrinsic settings (enabled flag, class,
 * static data-quality grade, and refresh pacing). Instrument-coupled mappings
 * (per-capability provider selection, per-listing provider symbols) live in the
 * instruments service and are referenced only by provider name.
 */

type Timestamp = ColumnType<Date, Date | string | undefined, Date | string>;

export interface ProviderSettingsTable {
  provider: string;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  provider_class: ProviderClass;
  data_quality: ColumnType<DataQuality, DataQuality | undefined, DataQuality>;
  /** Per-capability quality overrides, e.g. {"fundamentals": "low"}. */
  capability_quality: ColumnType<Partial<Record<Capability, DataQuality>>, string | undefined, string>;
  /** NULL = single-symbol-only (scheduler throttles instead of batching). */
  max_batch_size: number | null;
  rate_limit_per_min: number | null;
  max_concurrency: ColumnType<number, number | undefined, number>;
  created_at: Generated<Date>;
  updated_at: Timestamp;
}

/** Per-(provider × capability) refresh cadence; see migration 022. */
export interface ProviderCapabilityRefreshTable {
  provider: string;
  capability: string;
  refresh_interval_ms: number;
  save_resolution_ms: number | null;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  updated_at: Timestamp;
}

export interface ProvidersDatabase {
  'providers.provider_settings': ProviderSettingsTable;
  'providers.provider_capability_refresh': ProviderCapabilityRefreshTable;
}
