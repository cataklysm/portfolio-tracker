import { sql, type Kysely } from 'kysely';
import type { PortfolioDatabase } from '../../../platform/database/schema.js';
import type { ActivityKind, ActivityQuery, ActivityRepository, ActivityRow } from '../application/ports.js';

/**
 * Union read model over the financial-booking tables plus the two ledger-altering
 * operations (applied corporate actions, position transfers). Every source is
 * projected to one shape and ordered by `(occurred_at, id)` descending, with
 * keyset pagination on that pair. Trades and corporate actions are scoped through
 * positions → portfolios for ownership; cash flows and tax events carry `user_id`
 * directly; transfers are scoped through their source portfolio. Monetary amounts
 * are unsigned (sign/meaning comes from `subtype` and `direction`); corporate
 * actions and transfers carry no amount/currency.
 */
export class KyselyActivityRepository implements ActivityRepository {
  constructor(private readonly db: Kysely<PortfolioDatabase>) {}

  async list(query: ActivityQuery): Promise<ActivityRow[]> {
    const { userId, portfolioId, kind, before, limit } = query;

    const tradePortfolio = portfolioId ? sql`AND p.portfolio_id = ${portfolioId}` : sql``;
    const cashPortfolio = portfolioId ? sql`AND cf.portfolio_id = ${portfolioId}` : sql``;
    const taxPortfolio = portfolioId ? sql`AND te.portfolio_id = ${portfolioId}` : sql``;
    const caPortfolio = portfolioId ? sql`AND cap.portfolio_id = ${portfolioId}` : sql``;
    // A transfer touches two portfolios; it is relevant to either side.
    const transferPortfolio = portfolioId
      ? sql`AND (tr.source_portfolio_id = ${portfolioId} OR tr.destination_portfolio_id = ${portfolioId})`
      : sql``;
    const kindFilter = kind ? sql`AND feed.kind = ${kind}` : sql``;
    const keyset = before
      ? sql`AND (feed.occurred_at < ${before.occurredAt}::timestamptz
                 OR (feed.occurred_at = ${before.occurredAt}::timestamptz AND feed.id < ${before.id}))`
      : sql``;

    const result = await sql<ActivityRow>`
      WITH feed AS (
        SELECT t.id::text AS id, 'trade' AS kind, t.effective_at AS occurred_at,
               p.portfolio_id AS portfolio_id, t.position_id AS position_id,
               t.side AS subtype, t.currency AS currency,
               (t.quantity * t.price)::text AS amount,
               t.quantity::text AS quantity, t.price::text AS price, t.fee::text AS fee,
               NULL::text AS direction, t.note AS note
        FROM portfolio.transactions t
        JOIN portfolio.positions p ON p.id = t.position_id
        JOIN portfolio.portfolios pf ON pf.id = p.portfolio_id
        WHERE pf.user_id = ${userId} ${tradePortfolio}

        UNION ALL

        SELECT cf.id::text, 'cash_flow', cf.payment_date::timestamptz,
               cf.portfolio_id, cf.position_id, cf.type, cf.currency,
               cf.net_amount::text, NULL::text, NULL::text, cf.fee::text,
               NULL::text, cf.note
        FROM portfolio.cash_flows cf
        WHERE cf.user_id = ${userId} ${cashPortfolio}

        UNION ALL

        SELECT te.id::text, 'tax_event', te.booking_date::timestamptz,
               te.portfolio_id, te.position_id, te.component, te.currency,
               te.amount::text, NULL::text, NULL::text, NULL::text,
               te.direction, te.note
        FROM portfolio.tax_events te
        WHERE te.user_id = ${userId} ${taxPortfolio}

        UNION ALL

        SELECT ca.id::text, 'corporate_action', ca.effective_at,
               cap.portfolio_id, ca.position_id,
               CASE
                 WHEN ca.ratio_numerator IS NULL OR ca.ratio_denominator IS NULL THEN 'corporate_action'
                 WHEN ca.ratio_numerator::numeric >= ca.ratio_denominator::numeric THEN 'split'
                 ELSE 'reverse_split'
               END,
               NULL::text, NULL::text,
               ca.ratio_numerator::text, ca.ratio_denominator::text, NULL::text,
               CASE WHEN ca.reversed_at IS NULL THEN NULL ELSE 'reversed' END, NULL::text
        FROM portfolio.position_corporate_action_applications ca
        JOIN portfolio.positions cap ON cap.id = ca.position_id
        JOIN portfolio.portfolios capf ON capf.id = cap.portfolio_id
        WHERE capf.user_id = ${userId} ${caPortfolio}

        UNION ALL

        SELECT tr.id::text, 'transfer', tr.effective_at,
               tr.destination_portfolio_id, tr.position_id,
               'transfer', NULL::text,
               NULL::text, NULL::text, NULL::text, NULL::text,
               NULL::text, NULL::text
        FROM portfolio.position_transfers tr
        JOIN portfolio.portfolios trpf ON trpf.id = tr.source_portfolio_id
        WHERE trpf.user_id = ${userId} ${transferPortfolio}
      )
      SELECT id, kind, occurred_at, portfolio_id, position_id, subtype, currency,
             amount, quantity, price, fee, direction, note
      FROM feed
      WHERE TRUE ${kindFilter} ${keyset}
      ORDER BY occurred_at DESC, id DESC
      LIMIT ${limit}
    `.execute(this.db);

    return result.rows.map((row) => ({ ...row, kind: row.kind as ActivityKind }));
  }
}
