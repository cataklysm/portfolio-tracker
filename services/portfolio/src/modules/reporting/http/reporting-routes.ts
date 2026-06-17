import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { ReportingService } from '../application/reporting-service.js';
import {
  PortfolioSummarySchema,
  HoldingGroupSchema,
  AllocationReportSchema,
  TaxReportSchema,
  ReportingSnapshotSchema,
  PerformanceReportSchema,
  RiskReportSchema,
  IntelligenceReportSchema,
  BenchmarkReportSchema,
} from '../../../schemas.js';

const ScopeQuery = Type.Object({ portfolio_id: Type.Optional(Type.String({ format: 'uuid' })) });
const PeriodUnion = Type.Union([
  Type.Literal('1W'),
  Type.Literal('1M'),
  Type.Literal('YTD'),
  Type.Literal('1Y'),
  Type.Literal('ALL'),
]);
const PerformanceQuery = Type.Object({
  portfolio_id: Type.Optional(Type.String({ format: 'uuid' })),
  period: Type.Optional(PeriodUnion),
});
const BenchmarkQuery = Type.Object({
  portfolio_id: Type.Optional(Type.String({ format: 'uuid' })),
  period: Type.Optional(PeriodUnion),
  benchmark_listing_id: Type.Optional(Type.String({ format: 'uuid' })),
});

export interface ReportingRouteDeps {
  service: ReportingService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/**
 * Authoritative reporting reads. `portfolio_id` selects one portfolio; omitting
 * it reports the combined active set. Both need `portfolio:read`.
 */
export function registerReportingRoutes(app: FastifyInstance, deps: ReportingRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];

  r.get('/reporting/summary', { preHandler: read, schema: { querystring: ScopeQuery, response: { 200: PortfolioSummarySchema } } }, async (request) =>
    deps.service.getSummary(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/holdings', { preHandler: read, schema: { querystring: ScopeQuery, response: { 200: Type.Array(HoldingGroupSchema) } } }, async (request) =>
    deps.service.getHoldings(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/allocation', { preHandler: read, schema: { querystring: ScopeQuery, response: { 200: AllocationReportSchema } } }, async (request) =>
    deps.service.getAllocation(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/tax', { preHandler: read, schema: { querystring: ScopeQuery, response: { 200: TaxReportSchema } } }, async (request) =>
    deps.service.getTaxReport(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/snapshot', { preHandler: read, schema: { querystring: ScopeQuery, response: { 200: ReportingSnapshotSchema } } }, async (request) =>
    deps.service.getSnapshot(uid(request.user?.sub), bearer(request.headers.authorization), request.query.portfolio_id),
  );

  r.get('/reporting/performance', { preHandler: read, schema: { querystring: PerformanceQuery, response: { 200: PerformanceReportSchema } } }, async (request) =>
    deps.service.getPerformance(
      uid(request.user?.sub),
      bearer(request.headers.authorization),
      request.query.period ?? '1Y',
      request.query.portfolio_id,
    ),
  );

  r.get('/reporting/risk', { preHandler: read, schema: { querystring: PerformanceQuery, response: { 200: RiskReportSchema } } }, async (request) =>
    deps.service.getRisk(
      uid(request.user?.sub),
      bearer(request.headers.authorization),
      request.query.period ?? '1Y',
      request.query.portfolio_id,
    ),
  );

  r.get('/reporting/intelligence', { preHandler: read, schema: { querystring: PerformanceQuery, response: { 200: IntelligenceReportSchema } } }, async (request) =>
    deps.service.getIntelligence(
      uid(request.user?.sub),
      bearer(request.headers.authorization),
      request.query.period ?? '1Y',
      request.query.portfolio_id,
    ),
  );

  r.get('/reporting/benchmark', { preHandler: read, schema: { querystring: BenchmarkQuery, response: { 200: BenchmarkReportSchema } } }, async (request) =>
    deps.service.getBenchmark(
      uid(request.user?.sub),
      bearer(request.headers.authorization),
      request.query.period ?? '1Y',
      request.query.portfolio_id,
      request.query.benchmark_listing_id,
    ),
  );
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
