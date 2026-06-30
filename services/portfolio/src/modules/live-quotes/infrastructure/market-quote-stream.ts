import type { EventEnvelope, Logger, RedisClientType } from '@portfolio/platform';
import type { LiveQuoteFanout } from '../application/live-quote-fanout.js';

interface QuotesUpdatedPayload {
  listing_ids?: unknown;
  as_of?: unknown;
}

export interface MarketQuoteStreamOptions {
  redis: RedisClientType;
  fanout: LiveQuoteFanout;
  logger: Logger;
  /** Source stream key (the market producer name). */
  stream?: string;
  blockMs?: number;
  count?: number;
}

/**
 * Tails the `market` Redis stream and forwards `market.quotes.updated` batches to
 * the live-quote fan-out. Uses a plain `xRead` from `$` (not a consumer group):
 * these are transient "your data changed" hints for open SSE tabs, so every
 * replica independently tails the stream and serves its own connections, and a
 * batch missed during downtime is irrelevant (no backlog replay, no acks). The
 * durable consumers of this stream keep their own consumer groups.
 */
export class MarketQuoteStream {
  private readonly client: RedisClientType;
  private stopped = false;
  private lastId = '$';

  constructor(private readonly options: MarketQuoteStreamOptions) {
    // Blocking reads monopolize a connection; use a dedicated duplicate. A
    // duplicate does NOT inherit the parent's listeners, so attach an 'error'
    // handler or a transient socket reset crashes the process.
    this.client = options.redis.duplicate();
    this.client.on('error', (err) => {
      options.logger.error({ err, error_code: 'live_quote_redis_error' }, 'Live quote stream Redis error');
    });
  }

  async start(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
    void this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.client.isOpen) await this.client.quit();
  }

  private async loop(): Promise<void> {
    const stream = this.options.stream ?? 'market';
    const blockMs = this.options.blockMs ?? 5000;
    const count = this.options.count ?? 100;
    while (!this.stopped) {
      try {
        const response = await this.client.xRead([{ key: stream, id: this.lastId }], { COUNT: count, BLOCK: blockMs });
        if (!response) continue;
        for (const streamResult of response) {
          for (const entry of streamResult.messages) {
            this.lastId = entry.id;
            await this.process(entry.message);
          }
        }
      } catch (err) {
        if (this.stopped) break;
        this.options.logger.error({ err, error_code: 'live_quote_stream_read_failed' }, 'Live quote stream read failed');
        await delay(1000);
      }
    }
  }

  private async process(fields: Record<string, string>): Promise<void> {
    const raw = fields['event'];
    if (!raw) return;
    let envelope: EventEnvelope<QuotesUpdatedPayload>;
    try {
      envelope = JSON.parse(raw) as EventEnvelope<QuotesUpdatedPayload>;
    } catch {
      return; // Not our concern: a malformed entry never blocks the tail.
    }
    if (envelope.event_type !== 'market.quotes.updated') return;
    const payload = envelope.payload;
    const listingIds = Array.isArray(payload.listing_ids)
      ? payload.listing_ids.filter((id): id is string => typeof id === 'string' && id.length > 0)
      : [];
    if (listingIds.length === 0) return;
    const asOf = typeof payload.as_of === 'string' ? payload.as_of : null;
    // Best-effort: a failed fan-out must not stop the tail (no acks here).
    try {
      await this.options.fanout.fanOut(listingIds, asOf);
    } catch (err) {
      this.options.logger.warn({ err, error_code: 'live_quote_fanout_failed' }, 'Live quote fan-out failed');
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
