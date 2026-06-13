import { sql, type Kysely } from 'kysely';
import type { Logger } from 'pino';
import type { RedisClientType } from './redis.js';
import type { EventEnvelope } from './events.js';

interface OutboxRow {
  id: string;
  event_type: string;
  event_version: number;
  aggregate_type: string;
  aggregate_id: string;
  aggregate_version: string | number;
  payload: unknown;
  correlation_id: string | null;
  causation_id: string | null;
  occurred_at: Date;
  user_id?: string | null;
}

export interface OutboxPublisherOptions {
  // Accepts any service's typed Kysely instance; the worker queries the outbox
  // table by name via raw SQL, so it does not depend on the DB schema type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Kysely<any>;
  redis: RedisClientType;
  /** Producing service name, written as `producer` on every envelope. */
  producer: string;
  /** Outbox table location, e.g. { schema: 'portfolio', table: 'outbox_events' }. */
  outbox: { schema: string; table: string };
  /** Redis stream key consumers read from (defaults to the producer name). */
  stream?: string;
  logger: Logger;
  batchSize?: number;
  intervalMs?: number;
}

/**
 * Transactional-outbox publisher. Polls the service's outbox table for
 * unpublished rows, forwards each as an event envelope to a Redis stream, and
 * marks it published. Delivery is at least once; consumers deduplicate on
 * `event_id` (the outbox row id). One lightweight worker per producing service.
 */
export class OutboxPublisher {
  private timer: NodeJS.Timeout | undefined;
  private running = false;
  private readonly stream: string;
  private readonly batchSize: number;
  private readonly intervalMs: number;

  constructor(private readonly options: OutboxPublisherOptions) {
    this.stream = options.stream ?? options.producer;
    this.batchSize = options.batchSize ?? 100;
    this.intervalMs = options.intervalMs ?? 1000;
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
    if (typeof this.timer.unref === 'function') this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  private async tick(): Promise<void> {
    if (this.running) return; // never overlap polls
    this.running = true;
    try {
      await this.publishBatch();
    } catch (err) {
      this.options.logger.error({ err, error_code: 'outbox_publish_failed' }, 'Outbox publish failed');
    } finally {
      this.running = false;
    }
  }

  private async publishBatch(): Promise<void> {
    const table = sql.id(this.options.outbox.schema, this.options.outbox.table);
    const result = await sql<OutboxRow>`
      select * from ${table}
      where published_at is null
      order by occurred_at
      limit ${this.batchSize}
    `.execute(this.options.db);

    for (const row of result.rows) {
      const envelope = this.toEnvelope(row);
      await this.options.redis.xAdd(this.stream, '*', { event: JSON.stringify(envelope) });
      await sql`
        update ${table} set published_at = now() where id = ${row.id}
      `.execute(this.options.db);
    }
  }

  private toEnvelope(row: OutboxRow): EventEnvelope {
    const payload =
      typeof row.payload === 'string' ? (JSON.parse(row.payload) as Record<string, unknown>) : (row.payload as Record<string, unknown>);
    return {
      event_id: row.id,
      event_type: row.event_type,
      event_version: row.event_version,
      occurred_at: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : String(row.occurred_at),
      producer: this.options.producer,
      aggregate: {
        type: row.aggregate_type,
        id: row.aggregate_id,
        version: Number(row.aggregate_version),
      },
      ...(row.correlation_id ? { correlation_id: row.correlation_id } : {}),
      ...(row.causation_id ? { causation_id: row.causation_id } : {}),
      ...(row.user_id ? { user_id: row.user_id } : {}),
      payload,
    };
  }
}
