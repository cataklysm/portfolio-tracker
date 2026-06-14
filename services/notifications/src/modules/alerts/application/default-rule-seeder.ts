import type { Logger } from '@portfolio/platform';
import type { AlertRuleRepository, NewAlertRule, SeedRepository } from './ports.js';

/**
 * The three "automatic" alerts, expressed as ordinary default rules. Seeded once
 * per user (the first time the service sees them) so they show up — and can be
 * edited, disabled, or deleted — exactly like any rule the user creates.
 */
const DEFAULT_RULES: Omit<NewAlertRule, 'userId'>[] = [
  { kind: 'daily_move', scope: 'all_holdings', instrumentId: null, listingId: null, params: { threshold_pct: 5 }, label: 'Significant daily move' },
  { kind: 'earnings_lead', scope: 'all_holdings', instrumentId: null, listingId: null, params: { days: 7 }, label: 'Upcoming earnings' },
  { kind: 'target_zone', scope: 'all_holdings', instrumentId: null, listingId: null, params: {}, label: 'Price target reached' },
];

/** Seeds each user's default alert rules exactly once. */
export class DefaultRuleSeeder {
  constructor(
    private readonly rules: AlertRuleRepository,
    private readonly seedState: SeedRepository,
    private readonly logger: Logger,
  ) {}

  async ensureDefaults(userId: string): Promise<void> {
    if (!(await this.seedState.claim(userId))) return;
    try {
      for (const rule of DEFAULT_RULES) {
        await this.rules.create({ ...rule, userId });
      }
      this.logger.info({ userId, count: DEFAULT_RULES.length }, 'Seeded default alert rules');
    } catch (err) {
      this.logger.error({ err, userId, error_code: 'seed_defaults_failed' }, 'Failed to seed default alert rules');
    }
  }
}
