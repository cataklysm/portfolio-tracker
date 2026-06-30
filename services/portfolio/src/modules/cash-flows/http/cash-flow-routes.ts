import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { CashFlowService } from '../application/cash-flow-service.js';
import type { CashFlowType } from '../application/ports.js';
import { CashFlowKindSchema, CashFlowRecordSchema, OkResponse, TaxComponentSchema } from '../../../schemas.js';

const Amount = Type.String({ pattern: '^-?\\d+(\\.\\d+)?$' });
const DateStr = Type.String({ format: 'date' });
const Currency = Type.String({ minLength: 3, maxLength: 3 });

// Same-currency component: a single amount in the cash-flow settlement currency.
const TaxComponentLegacy = Type.Object(
  {
    component: TaxComponentSchema,
    amount: Amount,
    currency: Currency,
    booking_date: DateStr,
  },
  { description: 'Same-currency tax component: `amount` is in the cash-flow settlement currency.' },
);

// Foreign-currency component: the original source amount and the broker-settled amount.
const TaxComponentCrossCurrency = Type.Object(
  {
    component: TaxComponentSchema,
    source_amount: Amount,
    source_currency: Currency,
    settlement_amount: Amount,
    settlement_currency: Currency,
    booking_date: DateStr,
  },
  { description: 'Foreign-currency tax component: original `source_amount` plus broker-settled `settlement_amount`.' },
);

const TaxComponentInput = Type.Union([TaxComponentLegacy, TaxComponentCrossCurrency], {
  description: 'A withheld-tax component — either same-currency or split into source/settlement.',
});

const ListQuery = Type.Object({
  // `types` (CSV, e.g. "dividend,interest") takes precedence over single `type`.
  type: Type.Optional(CashFlowKindSchema),
  types: Type.Optional(Type.String({ minLength: 1 })),
  position_id: Type.Optional(Type.String({ format: 'uuid' })),
  // Inclusive value-date (tax_relevant_value_date) range.
  date_from: Type.Optional(DateStr),
  date_to: Type.Optional(DateStr),
});

const CreateBody = Type.Object({
  type: CashFlowKindSchema,
  gross_amount: Amount,
  withholding_tax: Type.Optional(Amount),
  fee: Type.Optional(Amount),
  currency: Type.String({ minLength: 3, maxLength: 3 }),
  payment_date: DateStr,
  tax_relevant_value_date: Type.Optional(DateStr),
  position_id: Type.Optional(Type.String({ format: 'uuid' })),
  note: Type.Optional(Type.String({ maxLength: 280 })),
  // Event linkage (dividend/cash-in-lieu booked from an `events` corporate action).
  source_event_id: Type.Optional(Type.String({ minLength: 1, maxLength: 200 })),
  source_event_version: Type.Optional(Type.Integer({ minimum: 0 })),
  source_event_type: Type.Optional(Type.String({ maxLength: 100 })),
  ex_date: Type.Optional(DateStr),
  amount_per_share: Type.Optional(Amount),
  // Foreign-currency source economics. The settlement fields above stay the
  // broker-reconciled amounts; these capture the original (source) currency. When
  // source_currency differs from currency, the source breakdown and broker FX are
  // required (and source_net is recomputed server-side); same-currency bookings omit them.
  source_currency: Type.Optional(Currency),
  source_gross_amount: Type.Optional(Amount),
  source_withholding_tax: Type.Optional(Amount),
  source_fee: Type.Optional(Amount),
  source_net_amount: Type.Optional(Amount),
  source_amount_per_share: Type.Optional(Amount),
  // Broker's fixed conversion, as a direct source->settlement rate (units of the
  // settlement currency per 1 unit of source currency). Direction defaults to
  // source_currency -> currency.
  broker_fx_rate: Type.Optional(Amount),
  broker_fx_from_currency: Type.Optional(Currency),
  broker_fx_to_currency: Type.Optional(Currency),
  broker_fx_rate_date: Type.Optional(DateStr),
  // Withheld-tax breakdown (income types); sets withholding_tax = their sum and
  // creates linked tax events. Mutually exclusive with withholding_tax.
  tax_components: Type.Optional(Type.Array(TaxComponentInput, { minItems: 1 })),
});

const UpdateBody = Type.Object({
  gross_amount: Type.Optional(Amount),
  withholding_tax: Type.Optional(Amount),
  fee: Type.Optional(Amount),
  currency: Type.Optional(Type.String({ minLength: 3, maxLength: 3 })),
  payment_date: Type.Optional(DateStr),
  tax_relevant_value_date: Type.Optional(DateStr),
  note: Type.Optional(Type.Union([Type.String({ maxLength: 280 }), Type.Null()])),
});

export interface CashFlowRouteDeps {
  service: CashFlowService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/** Cash-flow endpoints, nested under a portfolio. Reads need `portfolio:read`; writes `portfolio:write`. */
export function registerCashFlowRoutes(app: FastifyInstance, deps: CashFlowRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get(
    '/portfolios/:portfolioId/cash-flows',
    { preHandler: read, schema: { querystring: ListQuery, response: { 200: Type.Array(CashFlowRecordSchema) } } },
    async (request) =>
      deps.service.list(
        uid(request.user?.sub),
        (request.params as { portfolioId: string }).portfolioId,
        {
          types: parseTypes(request.query.types, request.query.type as CashFlowType | undefined),
          positionId: request.query.position_id,
          dateFrom: request.query.date_from,
          dateTo: request.query.date_to,
        },
        bearer(request.headers.authorization),
      ),
  );

  r.post(
    '/portfolios/:portfolioId/cash-flows',
    { preHandler: write, schema: { body: CreateBody, response: { 201: CashFlowRecordSchema } } },
    async (request, reply) => {
      const created = await deps.service.create(
        uid(request.user?.sub),
        (request.params as { portfolioId: string }).portfolioId,
        {
          type: request.body.type,
          grossAmount: request.body.gross_amount,
          withholdingTax: request.body.withholding_tax,
          fee: request.body.fee,
          currency: request.body.currency,
          paymentDate: request.body.payment_date,
          taxRelevantValueDate: request.body.tax_relevant_value_date,
          positionId: request.body.position_id ?? null,
          note: request.body.note ?? null,
          sourceEventId: request.body.source_event_id ?? null,
          sourceEventVersion: request.body.source_event_version ?? null,
          sourceEventType: request.body.source_event_type ?? null,
          exDate: request.body.ex_date ?? null,
          amountPerShare: request.body.amount_per_share ?? null,
          sourceCurrency: request.body.source_currency,
          sourceGrossAmount: request.body.source_gross_amount,
          sourceWithholdingTax: request.body.source_withholding_tax,
          sourceFee: request.body.source_fee,
          sourceNetAmount: request.body.source_net_amount,
          sourceAmountPerShare: request.body.source_amount_per_share,
          brokerFxRate: request.body.broker_fx_rate,
          brokerFxFromCurrency: request.body.broker_fx_from_currency,
          brokerFxToCurrency: request.body.broker_fx_to_currency,
          brokerFxRateDate: request.body.broker_fx_rate_date,
          taxComponents: request.body.tax_components?.map((c) =>
            'amount' in c
              ? { component: c.component, amount: c.amount, currency: c.currency, bookingDate: c.booking_date }
              : {
                  component: c.component,
                  sourceAmount: c.source_amount,
                  sourceCurrency: c.source_currency,
                  settlementAmount: c.settlement_amount,
                  settlementCurrency: c.settlement_currency,
                  bookingDate: c.booking_date,
                },
          ),
        },
      );
      reply.code(201);
      return created;
    },
  );

  r.patch(
    '/portfolios/:portfolioId/cash-flows/:id',
    { preHandler: write, schema: { body: UpdateBody, response: { 200: CashFlowRecordSchema } } },
    async (request) =>
      deps.service.update(uid(request.user?.sub), (request.params as { id: string }).id, {
        grossAmount: request.body.gross_amount,
        withholdingTax: request.body.withholding_tax,
        fee: request.body.fee,
        currency: request.body.currency,
        paymentDate: request.body.payment_date,
        taxRelevantValueDate: request.body.tax_relevant_value_date,
        note: request.body.note,
      }),
  );

  r.delete('/portfolios/:portfolioId/cash-flows/:id', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.delete(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true as const };
  });
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}

function bearer(header: string | undefined): string {
  if (!header || !header.startsWith('Bearer ')) {
    throw AppError.unauthorized('missing_bearer_token', 'A bearer token is required');
  }
  return header.slice(7);
}

const KNOWN_TYPES: readonly CashFlowType[] = ['dividend', 'deposit', 'withdrawal', 'cash_in_lieu', 'interest'];

/**
 * Resolves the type filter: a CSV `types` (validated against the known set) takes
 * precedence over the single schema-validated `type`; neither given → no filter.
 */
function parseTypes(csv: string | undefined, single: CashFlowType | undefined): CashFlowType[] | undefined {
  if (csv !== undefined) {
    const parts = csv.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
    const invalid = parts.filter((p) => !KNOWN_TYPES.includes(p as CashFlowType));
    if (invalid.length > 0) throw AppError.badRequest('invalid_filter', `Unknown cash-flow type(s): ${invalid.join(', ')}`);
    return parts.length > 0 ? (parts as CashFlowType[]) : undefined;
  }
  return single ? [single] : undefined;
}
