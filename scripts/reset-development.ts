/**
 * scripts/reset-development.ts — Empties all dev-seeded + runtime data.
 *
 * Runs packages/database/reset-development.sql (which TRUNCATEs the seeded
 * tables and accumulated market/auth data, in its own transaction) so you can
 * re-seed a clean state without dropping the database. The schema is untouched.
 *
 * ⚠️ DEVELOPMENT ONLY — irreversible. Typical flow:
 *   pnpm db:reset:development && pnpm db:seed:development
 *
 * Invocation: pnpm db:reset:development   (loads .env via node --env-file)
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const SQL_FILE =
  process.env.RESET_SQL_FILE ?? join("packages", "database", "reset-development.sql");

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing (see .env).");

  const sql = readFileSync(SQL_FILE, "utf8");
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    console.log(`+ resetting dev data via ${SQL_FILE}`);
    // The SQL file manages its own BEGIN/COMMIT.
    await client.query(sql);
    console.log("Dev data cleared. Run `pnpm db:seed:development` to reseed.");
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
