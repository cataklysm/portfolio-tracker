/**
 * scripts/seed-development.ts — Loads all DEV sample-data SQL files (idempotent).
 *
 * ⚠️ Development ONLY. The SQL is repeatable via ON CONFLICT DO NOTHING.
 *
 * Reads all *.sql from SEEDS_DIR (sorted by filename), runs each in its own
 * transaction so a failure in one file doesn't roll back earlier files.
 *
 * Invocation: pnpm db:seed:dev   (loads .env via node --env-file)
 */

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const SEEDS_DIR =
  process.env.SEEDS_DIR ?? "packages/database/seeds/development";

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is missing (see .env).");

  const files = readdirSync(SEEDS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  if (files.length === 0) {
    console.log(`No .sql files found in ${SEEDS_DIR}.`);
    return;
  }

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    for (const file of files) {
      const sql = readFileSync(join(SEEDS_DIR, file), "utf8");
      console.log(`+ seeding: ${file}`);
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(
          `Seed file ${file} failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    console.log(`${files.length} seed file(s) applied.`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
