import type { Kysely } from 'kysely';
import type { EventsDatabase } from '../../../platform/database/schema.js';
import type { NewsRepository, NewsRow, StoredNews } from '../application/ports.js';

/**
 * Kysely adapter for `events.news`. The table has no provider id to dedupe on,
 * so inserts are deduped on (instrument_id, url): existing items are skipped and
 * only genuinely new headlines are inserted. The scheduler runs one cycle at a
 * time, so there is no concurrent-writer race within a deployment.
 */
export class KyselyNewsRepository implements NewsRepository {
  constructor(private readonly db: Kysely<EventsDatabase>) {}

  async upsert(rows: NewsRow[]): Promise<void> {
    if (rows.length === 0) return;
    const instrumentIds = [...new Set(rows.map((r) => r.instrumentId))];
    const urls = rows.map((r) => r.url).filter((u): u is string => u !== null);

    const existing =
      urls.length > 0
        ? await this.db
            .selectFrom('events.news')
            .select(['instrument_id', 'url'])
            .where('instrument_id', 'in', instrumentIds)
            .where('url', 'in', urls)
            .execute()
        : [];
    const seen = new Set(existing.map((e) => `${e.instrument_id}|${e.url}`));

    const fresh = rows.filter((r) => !seen.has(`${r.instrumentId}|${r.url}`));
    if (fresh.length === 0) return;

    await this.db
      .insertInto('events.news')
      .values(
        fresh.map((row) => ({
          instrument_id: row.instrumentId,
          published_at: row.publishedAt,
          provider: row.provider,
          headline: row.headline,
          url: row.url,
          sentiment: row.sentiment,
          category: row.category,
          relevance: row.relevance,
          raw_payload: JSON.stringify(row.rawPayload),
        })),
      )
      .execute();
  }

  async listByInstrument(instrumentId: string, limit: number): Promise<StoredNews[]> {
    const rows = await this.db
      .selectFrom('events.news')
      .select(['id', 'instrument_id', 'published_at', 'provider', 'headline', 'url', 'sentiment', 'category', 'relevance'])
      .where('instrument_id', '=', instrumentId)
      .orderBy('published_at', 'desc')
      .limit(limit)
      .execute();

    return rows.map((row) => ({
      id: row.id,
      instrument_id: row.instrument_id,
      published_at: row.published_at instanceof Date ? row.published_at.toISOString() : String(row.published_at),
      provider: row.provider,
      headline: row.headline,
      url: row.url,
      sentiment: row.sentiment,
      category: row.category,
      relevance: row.relevance,
    }));
  }
}
