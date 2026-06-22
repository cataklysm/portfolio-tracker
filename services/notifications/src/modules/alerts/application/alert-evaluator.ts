import type { Logger } from '@portfolio/platform';
import type {
  EventsEarningsClient,
  InsightsTargetsClient,
  LatestQuote,
  ListingResolverClient,
  MarketQuotesClient,
  OwnTarget,
  PortfolioPositionsClient,
} from '../../../platform/clients.js';
import type { ActiveInterest, UserInterestRepository } from '../../interests/index.js';
import {
  evaluateCostBasisMove,
  evaluateDailyMove,
  evaluateEarnings,
  evaluatePriceThreshold,
  evaluateTargetZone,
  type AlertCandidate,
} from '../domain/rules.js';
import type {
  AlertRule,
  AlertRuleRepository,
  AlertStateRepository,
  NotificationEventStore,
  NotificationRepository,
  NotificationType,
  RuleKind,
} from './ports.js';

export interface AlertEvaluatorDeps {
  interests: UserInterestRepository;
  notifications: NotificationRepository;
  alertState: AlertStateRepository;
  events: NotificationEventStore;
  rules: AlertRuleRepository;
  resolver: ListingResolverClient;
  quotes: MarketQuotesClient;
  earnings: EventsEarningsClient;
  targets: InsightsTargetsClient;
  positions: PortfolioPositionsClient;
  logger: Logger;
}

interface RuleContext {
  symbol: string;
  quote: LatestQuote | undefined;
  price: number | null;
  reportDate: string | undefined;
  avgCost: number | undefined;
  targets: OwnTarget[];
  currency: string;
  today: string;
}

const RULE_TO_TYPE: Record<RuleKind, NotificationType> = {
  price_threshold: 'price_threshold',
  daily_move: 'daily_move',
  earnings_lead: 'earnings_upcoming',
  cost_basis_move: 'cost_basis_move',
  target_zone: 'target_zone',
};
// Threshold/zone-crossing rules clear their state on exit so a later re-cross
// re-fires; date-keyed ones (daily move per day, earnings per report) do not.
const RULE_CLEARS_ON_EMPTY: Record<RuleKind, boolean> = {
  price_threshold: true,
  cost_basis_move: true,
  target_zone: true,
  daily_move: false,
  earnings_lead: false,
};

/**
 * Evaluates every user's alert rules — including the pre-seeded default rules
 * that stand in for the old built-in alerts — writing deduped notifications.
 * Per-listing/instrument data is fetched once per cycle and shared across users;
 * per-user data (target zones, position cost bases, rules) is fetched per user.
 */
export class AlertEvaluator {
  constructor(private readonly deps: AlertEvaluatorDeps) {}

  async runCycle(): Promise<void> {
    const interests = await this.deps.interests.listActiveInterests();
    if (interests.length === 0) return;

    const listingIds = [...new Set(interests.map((i) => i.listingId))];
    const [resolved, quotes] = await Promise.all([
      this.deps.resolver.resolve(listingIds),
      this.deps.quotes.fetchQuotes(listingIds),
    ]);
    const instrumentIds = [...new Set([...resolved.values()].map((r) => r.instrumentId))];
    const upcoming = await this.deps.earnings.fetchUpcoming(instrumentIds);
    const todayIso = new Date().toISOString().slice(0, 10);

    for (const [userId, userListings] of groupByUser(interests)) {
      try {
        await this.evaluateUser(userId, userListings, resolved, quotes, upcoming, todayIso);
      } catch (err) {
        this.deps.logger.warn({ err, userId, error_code: 'user_eval_failed' }, 'Alert evaluation failed for user');
      }
    }
  }

  private async evaluateUser(
    userId: string,
    userListings: string[],
    resolved: Awaited<ReturnType<ListingResolverClient['resolve']>>,
    quotes: Map<string, LatestQuote>,
    upcoming: Map<string, string>,
    todayIso: string,
  ): Promise<void> {
    const rules = await this.deps.rules.listEnabled(userId);
    if (rules.length === 0) return;

    const userInstrumentIds = [
      ...new Set(userListings.map((l) => resolved.get(l)?.instrumentId).filter((id): id is string => Boolean(id))),
    ];
    // Per-user data is only fetched when a rule actually needs it.
    const targetsByInstrument = rules.some((r) => r.kind === 'target_zone')
      ? await this.deps.targets.fetchOwnTargets(userId, userInstrumentIds)
      : new Map<string, OwnTarget[]>();
    const costByListing = rules.some((r) => r.kind === 'cost_basis_move')
      ? await this.deps.positions.fetchCostBases(userId)
      : new Map<string, number>();

    for (const rule of rules) {
      const targetListings = rule.scope === 'all_holdings'
        ? userListings
        : userListings.filter((l) => resolved.get(l)?.instrumentId === rule.instrument_id);
      for (const listingId of targetListings) {
        const r = resolved.get(listingId);
        if (!r) continue;
        const quote = quotes.get(listingId);
        const ctx: RuleContext = {
          symbol: r.symbol,
          quote,
          price: quote?.latest ?? null,
          reportDate: upcoming.get(r.instrumentId),
          avgCost: costByListing.get(listingId),
          targets: targetsByInstrument.get(r.instrumentId) ?? [],
          currency: r.currency,
          today: todayIso,
        };
        const fired = await this.maybeFire(userId, listingId, r.instrumentId, rule.id, RULE_TO_TYPE[rule.kind], `rule:${rule.id}`,
          evaluateRule(rule, ctx), RULE_CLEARS_ON_EMPTY[rule.kind]);
        if (fired) {
          await this.deps.rules.update(userId, rule.id, { enabled: false });
          break;
        }
      }
    }
  }

  /**
   * Fires a notification when the candidate's signature differs from the last
   * one stored for (user, listing, alertType). `clearOnEmpty` resets the state
   * when the condition lapses so a later re-trigger notifies again.
   */
  private async maybeFire(
    userId: string,
    listingId: string,
    instrumentId: string,
    ruleId: string,
    notificationType: NotificationType,
    alertType: string,
    candidate: AlertCandidate | null,
    clearOnEmpty: boolean,
  ): Promise<boolean> {
    const previous = await this.deps.alertState.get(userId, listingId, alertType);
    if (candidate === null) {
      if (clearOnEmpty && previous !== null) await this.deps.alertState.clear(userId, listingId, alertType);
      return false;
    }
    if (previous === candidate.signature) return false;

    const id = await this.deps.notifications.insert({
      userId,
      type: notificationType,
      severity: candidate.severity,
      title: candidate.title,
      body: candidate.body,
      instrumentId,
      listingId,
      ruleId,
      data: candidate.data,
    });
    await this.deps.alertState.set(userId, listingId, alertType, candidate.signature);
    await this.deps.events.enqueueCreated({ notificationId: id, userId, type: notificationType });
    return true;
  }
}

function evaluateRule(rule: AlertRule, ctx: RuleContext): AlertCandidate | null {
  switch (rule.kind) {
    case 'price_threshold': {
      const p = rule.params as { direction: 'above' | 'below'; price: number };
      return evaluatePriceThreshold(ctx.symbol, ctx.price, p.direction, p.price, ctx.currency);
    }
    case 'daily_move': {
      const p = rule.params as { threshold_pct: number };
      return ctx.quote ? evaluateDailyMove(ctx.symbol, ctx.quote, p.threshold_pct, ctx.today) : null;
    }
    case 'earnings_lead': {
      const p = rule.params as { days: number };
      return evaluateEarnings(ctx.symbol, ctx.reportDate, p.days, ctx.today);
    }
    case 'cost_basis_move': {
      const p = rule.params as { direction: 'above' | 'below'; threshold_pct: number };
      return evaluateCostBasisMove(ctx.symbol, ctx.price, ctx.avgCost, p.direction, p.threshold_pct);
    }
    case 'target_zone':
      return evaluateTargetZone(ctx.symbol, ctx.price, ctx.targets, ctx.currency);
    default:
      return null;
  }
}

function groupByUser(interests: ActiveInterest[]): Map<string, string[]> {
  const byUser = new Map<string, string[]>();
  for (const i of interests) {
    const list = byUser.get(i.userId) ?? [];
    list.push(i.listingId);
    byUser.set(i.userId, list);
  }
  return byUser;
}
