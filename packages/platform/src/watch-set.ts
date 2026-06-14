import type { Logger } from './logger.js';
import type { RedisClientType } from './redis.js';
import type { EventEnvelope } from './events.js';
import { StreamConsumer } from './stream-consumer.js';

/**
 * A resolved entry in the canonical watch set owned by the instruments service:
 * one per watched listing, carrying the listing→instrument resolution and the
 * provider symbol so consumers never have to re-resolve. `provider_identifier`
 * is null when the listing has no mapping for the configured provider.
 */
export interface WatchSetEntry {
  listing_id: string;
  instrument_id: string;
  symbol: string;
  currency: string;
  provider: string;
  provider_identifier: string | null;
}

interface WatchDeltaPayload extends WatchSetEntry {
  active: boolean;
}

export interface WatchSetOptions {
  /** Instruments watch-set snapshot URL, e.g. http://host:3004/internal/watch-set. */
  snapshotUrl: string;
  redis: RedisClientType;
  /** Consumer group on the instruments stream — one per consuming service. */
  group: string;
  /** Unique consumer name within the group. */
  consumer: string;
  logger: Logger;
  /** Stream carrying the instruments.watch.* deltas (default 'instruments'). */
  stream?: string;
}

const ACTIVATED = 'instruments.watch.activated';
const DEACTIVATED = 'instruments.watch.deactivated';

/**
 * In-memory view of the instruments-owned watch set. Replaces the per-service
 * refresh-interest projection tables: it hydrates once from the snapshot
 * endpoint, then stays live by consuming `instruments.watch.*` deltas off the
 * instruments stream. Membership application is idempotent (activated = upsert,
 * deactivated = delete), so snapshot + at-least-once delta replay converge on
 * the current set.
 */
export class WatchSet {
  private readonly entries = new Map<string, WatchSetEntry>();
  private consumer: StreamConsumer | undefined;
  private hydrated = false;

  constructor(private readonly opts: WatchSetOptions) {}

  /** Hydrate from the snapshot, then begin applying live deltas. */
  async start(): Promise<void> {
    await this.hydrate();
    this.consumer = new StreamConsumer({
      redis: this.opts.redis,
      stream: this.opts.stream ?? 'instruments',
      group: this.opts.group,
      consumer: this.opts.consumer,
      handler: (envelope) => this.apply(envelope),
      logger: this.opts.logger,
    });
    await this.consumer.start();
  }

  async stop(): Promise<void> {
    if (this.consumer) await this.consumer.stop();
  }

  /** Listing IDs currently in the watch set. */
  listActiveListingIds(): string[] {
    return [...this.entries.keys()];
  }

  /** All resolved entries currently in the watch set. */
  all(): WatchSetEntry[] {
    return [...this.entries.values()];
  }

  get(listingId: string): WatchSetEntry | undefined {
    return this.entries.get(listingId);
  }

  /** Whether the initial snapshot load succeeded. */
  get isHydrated(): boolean {
    return this.hydrated;
  }

  private async hydrate(): Promise<void> {
    try {
      const res = await fetch(this.opts.snapshotUrl);
      if (!res.ok) throw new Error(`snapshot responded ${res.status}`);
      const list = (await res.json()) as WatchSetEntry[];
      this.entries.clear();
      for (const entry of list) this.entries.set(entry.listing_id, entry);
      this.hydrated = true;
      this.opts.logger.info({ count: this.entries.size, error_code: 'watch_hydrated' }, 'Watch set hydrated from snapshot');
    } catch (err) {
      // Non-fatal: the delta stream still feeds the set; a later cycle will have
      // a fuller view. Logged so a persistently empty set is diagnosable.
      this.opts.logger.error({ err, error_code: 'watch_hydrate_failed' }, 'Watch set snapshot hydration failed');
    }
  }

  private async apply(envelope: EventEnvelope): Promise<void> {
    if (envelope.event_type !== ACTIVATED && envelope.event_type !== DEACTIVATED) return;
    const payload = envelope.payload as unknown as WatchDeltaPayload;
    if (!payload.listing_id) return;
    if (envelope.event_type === ACTIVATED) {
      this.entries.set(payload.listing_id, {
        listing_id: payload.listing_id,
        instrument_id: payload.instrument_id,
        symbol: payload.symbol,
        currency: payload.currency,
        provider: payload.provider,
        provider_identifier: payload.provider_identifier ?? null,
      });
    } else {
      this.entries.delete(payload.listing_id);
    }
  }
}
