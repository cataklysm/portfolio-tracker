import type { Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { ActiveHolding, HoldingsRepository } from '../application/ports.js';

/**
 * Kysely adapter resolving the open-position holders of a set of listings. Joins
 * positions to portfolios for the owning `user_id`, mirroring the ownership +
 * non-archived scoping used by listPositionsForUser.
 */
export class KyselyHoldingsRepository implements HoldingsRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async findOpenHolders(listingIds: string[], userIds: string[]): Promise<ActiveHolding[]> {
    if (listingIds.length === 0 || userIds.length === 0) return [];
    const rows = await this.db
      .selectFrom('portfolio.positions as p')
      .innerJoin('portfolio.portfolios as pf', 'pf.id', 'p.portfolio_id')
      .select(['pf.user_id as user_id', 'p.listing_id as listing_id'])
      .distinct()
      .where('p.state', '=', 'open')
      .where('pf.archived_at', 'is', null)
      .where('p.listing_id', 'in', listingIds)
      .where('pf.user_id', 'in', userIds)
      .execute();
    return rows.map((r) => ({ userId: r.user_id, listingId: r.listing_id }));
  }
}
