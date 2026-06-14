import { AppError } from '@portfolio/platform';
import type {
  AlertRule,
  AlertRuleRepository,
  AlertStateRepository,
  RuleKind,
  RuleScope,
  UpdateAlertRule,
} from './ports.js';

export interface CreateRuleInput {
  kind: RuleKind;
  scope: RuleScope;
  instrumentId?: string | null;
  listingId?: string | null;
  params: Record<string, unknown>;
  label?: string | null;
}

export interface UpdateRuleInput {
  params?: Record<string, unknown>;
  label?: string | null;
  enabled?: boolean;
}

/**
 * CRUD for user-defined alert rules, with per-kind parameter validation so a
 * malformed rule can never reach the evaluator. Deleting a rule also clears its
 * dedup state so a recreated rule starts fresh.
 */
export class RuleService {
  constructor(
    private readonly repo: AlertRuleRepository,
    private readonly alertState: AlertStateRepository,
  ) {}

  list(userId: string): Promise<AlertRule[]> {
    return this.repo.listByUser(userId);
  }

  create(userId: string, input: CreateRuleInput): Promise<AlertRule> {
    const scope = requireScope(input.kind, input.scope);
    const instrumentId = scope === 'instrument' ? requireInstrument(input.instrumentId) : null;
    const params = validateParams(input.kind, input.params);
    return this.repo.create({
      userId,
      kind: input.kind,
      scope,
      instrumentId,
      listingId: scope === 'instrument' ? (input.listingId ?? null) : null,
      params,
      label: input.label ?? null,
    });
  }

  async update(userId: string, id: string, patch: UpdateRuleInput): Promise<AlertRule> {
    const next: UpdateAlertRule = {};
    if (patch.label !== undefined) next.label = patch.label;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.params !== undefined) {
      const existing = (await this.repo.listByUser(userId)).find((r) => r.id === id);
      if (!existing) throw AppError.notFound('alert_rule_not_found', 'Alert rule not found');
      next.params = validateParams(existing.kind, patch.params);
    }
    const updated = await this.repo.update(userId, id, next);
    if (!updated) throw AppError.notFound('alert_rule_not_found', 'Alert rule not found');
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(userId, id))) {
      throw AppError.notFound('alert_rule_not_found', 'Alert rule not found');
    }
    await this.alertState.clearByAlertType(userId, `rule:${id}`);
  }
}

function requireScope(kind: RuleKind, scope: RuleScope): RuleScope {
  // A price threshold is inherently about one instrument's price.
  if (kind === 'price_threshold' && scope !== 'instrument') {
    throw AppError.badRequest('invalid_scope', 'Price-threshold rules must target a specific instrument');
  }
  return scope;
}

function requireInstrument(instrumentId: string | null | undefined): string {
  if (!instrumentId) throw AppError.badRequest('missing_instrument', 'An instrument is required for this rule');
  return instrumentId;
}

function num(value: unknown): number {
  return typeof value === 'number' ? value : Number(value);
}

/** Validates + normalizes a rule's params for its kind, or throws 400. */
function validateParams(kind: RuleKind, raw: Record<string, unknown>): Record<string, unknown> {
  const bad = (detail: string): never => {
    throw AppError.badRequest('invalid_rule_params', detail);
  };
  const direction = (v: unknown): 'above' | 'below' => {
    if (v !== 'above' && v !== 'below') bad('direction must be "above" or "below"');
    return v as 'above' | 'below';
  };

  switch (kind) {
    case 'price_threshold': {
      const price = num(raw.price);
      if (!Number.isFinite(price) || price <= 0) bad('price must be a positive number');
      return { direction: direction(raw.direction), price };
    }
    case 'daily_move': {
      const threshold_pct = num(raw.threshold_pct);
      if (!Number.isFinite(threshold_pct) || threshold_pct <= 0) bad('threshold_pct must be a positive number');
      return { threshold_pct };
    }
    case 'earnings_lead': {
      const days = num(raw.days);
      if (!Number.isInteger(days) || days <= 0 || days > 365) bad('days must be an integer between 1 and 365');
      return { days };
    }
    case 'cost_basis_move': {
      const threshold_pct = num(raw.threshold_pct);
      if (!Number.isFinite(threshold_pct)) bad('threshold_pct must be a number');
      return { direction: direction(raw.direction), threshold_pct };
    }
    case 'target_zone':
      // No params — the rule reads the user's own price targets from insights.
      return {};
    default:
      return bad('unknown rule kind');
  }
}
