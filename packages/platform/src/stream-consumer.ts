import type { Logger } from 'pino';
import type { RedisClientType } from './redis.js';
import type { EventEnvelope } from './events.js';

export type EventHandler = (envelope: EventEnvelope) => Promise<void>;

export interface StreamConsumerOptions {
  redis: RedisClientType;
  /** Source stream key (the producer name written by OutboxPublisher). */
  stream: string;
  /** Consumer group — one per consuming service/use case. */
  group: string;
  /** Unique consumer name within the group. */
  consumer: string;
  handler: EventHandler;
  logger: Logger;
  blockMs?: number;
  count?: number;
  /** Idle time after which a pending entry from a crashed consumer is reclaimed. */
  claimMinIdleMs?: number;
}

/**
 * Redis-Streams consumer with its own consumer group. Acknowledges entries only
 * after successful processing, reclaims stale pending entries left by crashed
 * consumers, and routes failures to a dead-letter stream so one poison message
 * does not block the group. Handlers must be idempotent (delivery is at least
 * once). Retry/backoff is intentionally simplified: a failed entry is
 * dead-lettered immediately with error context rather than retried in-stream.
 */
export class StreamConsumer {
  private client: RedisClientType;
  private stopped = false;
  private readonly blockMs: number;
  private readonly count: number;
  private readonly claimMinIdleMs: number;
  private readonly dlqStream: string;

  constructor(private readonly options: StreamConsumerOptions) {
    // Blocking reads monopolize a connection, so use a dedicated duplicate.
    this.client = options.redis.duplicate();
    // A duplicated client does NOT inherit the parent's event listeners. Without
    // an 'error' listener, a transient socket reset (ECONNRESET on standby/wake,
    // a network blip, or a Redis restart) is re-emitted as an unhandled 'error'
    // and crashes the whole process. Log it and let the inherited reconnect
    // strategy heal the connection; the read loop's try/catch covers in-flight
    // commands meanwhile.
    this.client.on('error', (err) => {
      options.logger.error({ err, error_code: 'stream_redis_error' }, 'Stream consumer Redis error');
    });
    this.blockMs = options.blockMs ?? 5000;
    this.count = options.count ?? 50;
    this.claimMinIdleMs = options.claimMinIdleMs ?? 60_000;
    this.dlqStream = `${options.stream}.dlq`;
  }

  async start(): Promise<void> {
    if (!this.client.isOpen) await this.client.connect();
    await this.ensureGroup();
    void this.loop();
  }

  async stop(): Promise<void> {
    this.stopped = true;
    if (this.client.isOpen) await this.client.quit();
  }

  private async ensureGroup(): Promise<void> {
    try {
      // Start at '0' so a new group also processes the existing backlog.
      await this.client.xGroupCreate(this.options.stream, this.options.group, '0', { MKSTREAM: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (!message.includes('BUSYGROUP')) throw err;
    }
  }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      try {
        await this.reclaimStale();
        const response = await this.client.xReadGroup(
          this.options.group,
          this.options.consumer,
          [{ key: this.options.stream, id: '>' }],
          { COUNT: this.count, BLOCK: this.blockMs },
        );
        if (!response) continue;
        for (const streamResult of response) {
          for (const entry of streamResult.messages) {
            await this.process(entry.id, entry.message);
          }
        }
      } catch (err) {
        if (this.stopped) break;
        // If the group vanished (Redis was restarted/flushed while we slept),
        // recreate it and retry rather than spinning on NOGROUP forever.
        if (isNoGroupError(err)) {
          this.options.logger.warn(
            { error_code: 'stream_group_missing' },
            'Consumer group missing; recreating',
          );
          try {
            await this.ensureGroup();
          } catch (groupErr) {
            this.options.logger.error(
              { err: groupErr, error_code: 'stream_group_recreate_failed' },
              'Failed to recreate consumer group',
            );
            await delay(1000);
          }
          continue;
        }
        this.options.logger.error({ err, error_code: 'stream_read_failed' }, 'Stream read failed');
        await delay(1000);
      }
    }
  }

  private async reclaimStale(): Promise<void> {
    try {
      const claimed = await this.client.xAutoClaim(
        this.options.stream,
        this.options.group,
        this.options.consumer,
        this.claimMinIdleMs,
        '0',
        { COUNT: this.count },
      );
      for (const entry of claimed.messages) {
        if (entry) await this.process(entry.id, entry.message);
      }
    } catch (err) {
      this.options.logger.warn({ err, error_code: 'stream_autoclaim_failed' }, 'Stream autoclaim failed');
    }
  }

  private async process(id: string, fields: Record<string, string>): Promise<void> {
    const raw = fields['event'];
    try {
      if (!raw) throw new Error('Missing event payload');
      const envelope = JSON.parse(raw) as EventEnvelope;
      await this.options.handler(envelope);
      await this.client.xAck(this.options.stream, this.options.group, id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.options.logger.error(
        { err, error_code: 'stream_handler_failed', event_id: id },
        'Stream handler failed; dead-lettering',
      );
      await this.client.xAdd(this.dlqStream, '*', {
        event: raw ?? '',
        original_id: id,
        group: this.options.group,
        consumer: this.options.consumer,
        error: message,
        failed_at: new Date().toISOString(),
      });
      await this.client.xAck(this.options.stream, this.options.group, id);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** A Redis error raised when the consumer group no longer exists on the stream. */
function isNoGroupError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return message.includes('NOGROUP');
}
