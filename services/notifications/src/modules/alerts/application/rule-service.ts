import { AppError } from '@portfolio/platform';
import type {
  AlertRule,
  AlertRuleRepository,
  AlertStateRepository,
  RuleKind,
  UpdateAlertRule,
} from './ports.js';

export interface CreateRuleInput {
  kind: RuleKind;
  instrumentId?: string | null;
  listingId?: string | null;
  params: Record<string, unknown>;
  label?: string | null;
  notifyOnce?: boolean;
}

export interface UpdateRuleInput {
  params?: Record<string, unknown>;
  label?: string | null;
  enabled?: boolean;
  notifyOnce?: boolean;
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

  list(userId: string, filter?: { instrumentId?: string; listingId?: string }): Promise<AlertRule[]> {
    return this.repo.listByUser(userId, filter);
  }

  create(userId: string, input: CreateRuleInput): Promise<AlertRule> {
    // Rules are always instrument-scoped; global ("all holdings") rules were removed.
    const instrumentId = requireInstrument(input.instrumentId);
    const params = validateParams(input.kind, input.params);
    // Default to one-shot; the caller opts into recurring explicitly.
    const notifyOnce = input.notifyOnce ?? true;
    return this.repo.create({
      userId,
      kind: input.kind,
      instrumentId,
      listingId: input.listingId ?? null,
      params,
      label: input.label ?? null,
      notifyOnce,
    });
  }

  async update(userId: string, id: string, patch: UpdateRuleInput): Promise<AlertRule> {
    const existing = patch.params !== undefined || patch.enabled === true
      ? (await this.repo.listByUser(userId)).find((r) => r.id === id)
      : undefined;
    if ((patch.params !== undefined || patch.enabled === true) && !existing) {
      throw AppError.notFound('alert_rule_not_found', 'Alert rule not found');
    }

    const next: UpdateAlertRule = {};
    if (patch.label !== undefined) next.label = patch.label;
    if (patch.enabled !== undefined) next.enabled = patch.enabled;
    if (patch.notifyOnce !== undefined) next.notifyOnce = patch.notifyOnce;
    if (patch.params !== undefined) {
      next.params = validateParams(existing!.kind, patch.params);
    }
    const updated = await this.repo.update(userId, id, next);
    if (!updated) throw AppError.notFound('alert_rule_not_found', 'Alert rule not found');
    if (patch.params !== undefined || (patch.enabled === true && existing?.enabled === false)) {
      await this.alertState.clearByAlertType(userId, `rule:${id}`);
    }
    return updated;
  }

  async delete(userId: string, id: string): Promise<void> {
    if (!(await this.repo.delete(userId, id))) {
      throw AppError.notFound('alert_rule_not_found', 'Alert rule not found');
    }
    await this.alertState.clearByAlertType(userId, `rule:${id}`);
  }
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
    case 'target_zone': {
      const normalizedTargetId = typeof raw.target_id === 'string' ? raw.target_id.trim() : '';
      if (normalizedTargetId.length === 0) {
        bad('target_id is required for target_zone rules');
      }
      return { target_id: normalizedTargetId };
    }
    default:
      return bad('unknown rule kind');
  }
}
