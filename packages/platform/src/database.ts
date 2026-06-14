import pg from 'pg';
import { Kysely, PostgresDialect, type LogEvent } from 'kysely';
import type { Logger } from 'pino';

/**
 * Ensure NUMERIC/DECIMAL columns arrive in JavaScript as strings rather than
 * being coerced to a lossy float. All financial arithmetic runs through
 * decimal.js, so the raw textual value must survive the driver untouched.
 */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (value) => value);
// int8/bigint as string as well — creation sequences and aggregate versions
// can exceed Number.MAX_SAFE_INTEGER over time.
pg.types.setTypeParser(pg.types.builtins.INT8, (value) => value);
// DATE columns as the raw 'YYYY-MM-DD' string. The default driver parses them
// into a Date at local midnight, which then shifts a day when reserialized to
// ISO/UTC. Every schema types date columns (tax_relevant_value_date,
// payment_date, …) as strings, so keep the calendar date verbatim.
pg.types.setTypeParser(pg.types.builtins.DATE, (value) => value);

export interface DatabaseOptions {
  connectionString: string;
  logger: Logger;
  maxConnections?: number;
}

export interface DatabaseHandle<DB> {
  db: Kysely<DB>;
  pool: pg.Pool;
}

/**
 * Builds a Kysely instance bound to a pg connection pool. Each service supplies
 * its own `DB` schema interface so queries are fully typed against the tables
 * that service owns.
 */
export function createDatabase<DB>(options: DatabaseOptions): DatabaseHandle<DB> {
  const pool = new pg.Pool({
    connectionString: options.connectionString,
    max: options.maxConnections ?? 10,
  });

  // pg only routes the 'error' event of *idle* pooled clients to pool.on('error').
  // When a client is checked out (running a query, or held across statements in a
  // transaction) the pool removes that idle listener, so if the socket dies while
  // the client is in use the Client emits 'error' with no listener — which Node
  // escalates to an unhandled 'error' event and crashes the process. This is
  // exactly what happens when the host resumes from standby and every pooled
  // socket is already dead. Attaching a permanent listener at connect time keeps
  // at least one 'error' listener on every client for its whole lifetime, so a
  // severed connection is always handled; the pool then evicts the broken client
  // and opens a fresh one on the next query.
  pool.on('error', (err) => {
    options.logger.error({ err, error_code: 'db_pool_error' }, 'Unexpected database pool error');
  });

  pool.on('connect', (client) => {
    client.on('error', (err) => {
      options.logger.warn({ err, error_code: 'db_client_error' }, 'Database client connection error');
    });
  });

  const db = new Kysely<DB>({
    dialect: new PostgresDialect({ pool }),
    log: (event: LogEvent) => {
      if (event.level === 'error') {
        options.logger.error(
          { duration_ms: Math.round(event.queryDurationMillis), error_code: 'db_query_error' },
          'Database query failed',
        );
      }
    },
  });

  return { db, pool };
}
