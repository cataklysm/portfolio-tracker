import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { FxService } from '../application/fx-service.js';

const RatesQuery = Type.Object({ quote_currencies: Type.String({ minLength: 1 }) });
const RateForDateQuery = Type.Object({
  quote: Type.String({ minLength: 3, maxLength: 3 }),
  date: Type.String({ format: 'date' }),
});
const RateSeriesQuery = Type.Object({
  quote_currencies: Type.String({ minLength: 1 }),
  from: Type.String({ format: 'date' }),
  to: Type.String({ format: 'date' }),
});
const RefreshBody = Type.Object({ history: Type.Optional(Type.Boolean()) });

const RatePointSchema = Type.Object({ date: Type.String(), rate: Type.String() });
const FxRateForDateResponse = Type.Object({
  quote_currency: Type.String(),
  date: Type.String(),
  rate: Type.String(),
});
const StoredResponse = Type.Object({ stored: Type.Integer() });

export interface FxRouteDeps {
  service: FxService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * FX endpoints. Reads (public, `market:read`) serve stored ECB rates. The
 * refresh trigger is internal-only and calls the provider.
 */
export function registerFxRoutes(app: FastifyInstance, deps: FxRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('market:read')];

  r.get('/fx/rates', { preHandler: read, schema: { querystring: RatesQuery, response: { 200: Type.Record(Type.String(), Type.String()) } } }, async (request) => {
    const currencies = request.query.quote_currencies
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 3);
    return deps.service.getEurRates(currencies);
  });

  r.get('/fx/rate', { preHandler: read, schema: { querystring: RateForDateQuery, response: { 200: FxRateForDateResponse } } }, async (request) => {
    const result = await deps.service.getEurRateForDate(request.query.quote.toUpperCase(), request.query.date);
    if (!result) throw AppError.notFound('fx_rate_unavailable', 'No FX rate available on or before that date');
    return { quote_currency: request.query.quote.toUpperCase(), ...result };
  });

  // Daily EUR-based rate series per currency over a date range, for historical
  // reporting (e.g. the portfolio performance series). One request covers the
  // whole window instead of one lookup per (currency, day).
  r.get('/fx/series', { preHandler: read, schema: { querystring: RateSeriesQuery, response: { 200: Type.Record(Type.String(), Type.Array(RatePointSchema)) } } }, async (request) => {
    const currencies = request.query.quote_currencies
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 3);
    return deps.service.getEurRateSeries(currencies, request.query.from, request.query.to);
  });

  // User-facing on-demand FX refresh (e.g. alongside a quote refresh) so
  // reporting-currency conversions have a current rate.
  r.post('/fx/refresh', { preHandler: read, schema: { response: { 200: StoredResponse } } }, async () => {
    const stored = await deps.service.refreshDaily();
    return { stored };
  });

  // Internal: refresh from ECB. Network/gateway restricted.
  r.post('/internal/fx/refresh', { schema: { body: RefreshBody, response: { 200: StoredResponse } } }, async (request) => {
    const stored = request.body.history
      ? await deps.service.refreshHistory()
      : await deps.service.refreshDaily();
    return { stored };
  });
}
