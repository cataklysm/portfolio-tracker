import { createClient, type RedisClientType } from 'redis';
import type { Logger } from 'pino';

export type { RedisClientType };

export interface RedisOptions {
  url: string;
  logger: Logger;
}

/**
 * Creates a Redis client used for the cache and Redis Streams event bus.
 *
 * Reconnect behaviour is phase-aware: until the first successful connection it
 * is bounded so a misconfigured/unreachable Redis fails fast at startup (see
 * `connectRedis`); after that it reconnects indefinitely with capped backoff so
 * transient outages — PC standby/wake, network blips, a Redis restart — self-heal
 * instead of permanently halting the service. `pingInterval` proactively detects
 * a half-open socket (common after standby) so reconnection starts promptly
 * rather than waiting for the next command.
 */
export function createRedis(options: RedisOptions): RedisClientType {
  const state = { everConnected: false };

  const client: RedisClientType = createClient({
    url: options.url,
    pingInterval: 30_000,
    socket: {
      connectTimeout: 5000,
      reconnectStrategy: (retries) => {
        if (!state.everConnected) {
          // Initial connection: bounded, so startup fails fast with a clear error.
          if (retries >= 10) return new Error('Redis unavailable');
          return Math.min((retries + 1) * 250, 2000);
        }
        // Already connected once: never give up. Capped exponential backoff
        // with jitter so the whole fleet doesn't reconnect in lockstep.
        return Math.min(2 ** retries * 100, 30_000) + Math.floor(Math.random() * 250);
      },
    },
  });

  client.on('ready', () => {
    const reconnected = state.everConnected;
    state.everConnected = true;
    if (reconnected) {
      options.logger.info({ error_code: 'redis_reconnected' }, 'Redis reconnected');
    }
  });
  client.on('reconnecting', () => {
    options.logger.warn({ error_code: 'redis_reconnecting' }, 'Redis connection lost; reconnecting');
  });
  client.on('error', (err) => {
    options.logger.error({ err, error_code: 'redis_error' }, 'Redis client error');
  });
  return client;
}

export async function connectRedis(client: RedisClientType): Promise<void> {
  // Spec-only build (OpenAPI dump): the app is constructed to read its route
  // table, never to serve traffic, so skip the live connection. No Redis is
  // required to generate the OpenAPI document.
  if (process.env['OPENAPI_DUMP'] === '1') return;
  try {
    await client.connect();
    await client.ping();
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new Error(`Redis unavailable: ${reason}`);
  }
}
