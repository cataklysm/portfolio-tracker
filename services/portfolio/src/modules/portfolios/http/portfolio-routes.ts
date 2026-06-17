import type { FastifyInstance, preHandlerHookHandler } from 'fastify';
import { Type } from '@sinclair/typebox';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';
import { AppError } from '@portfolio/platform';
import type { PortfolioService } from '../application/portfolio-service.js';
import {
  PortfolioRowSchema,
  CreatePortfolioResponse,
  OkResponse,
} from '../../../schemas.js';

const CreatePortfolioBody = Type.Object({ name: Type.String({ minLength: 1, maxLength: 120 }) });
const ReorderBody = Type.Object({ ordered_ids: Type.Array(Type.String({ format: 'uuid' })) });
const ListQuery = Type.Object({ include_archived: Type.Optional(Type.Boolean()) });
const BenchmarkBody = Type.Object({
  listing_id: Type.Union([Type.String({ format: 'uuid' }), Type.Null()]),
});

export interface PortfolioRouteDeps {
  service: PortfolioService;
  authenticate: preHandlerHookHandler;
  requireScope: (scope: string) => preHandlerHookHandler;
}

/** Portfolio management endpoints. Reads need `portfolio:read`; writes `portfolio:write`. */
export function registerPortfolioRoutes(app: FastifyInstance, deps: PortfolioRouteDeps): void {
  const r = app.withTypeProvider<TypeBoxTypeProvider>();
  const read = [deps.authenticate, deps.requireScope('portfolio:read')];
  const write = [deps.authenticate, deps.requireScope('portfolio:write')];

  r.get('/portfolios', { preHandler: read, schema: { querystring: ListQuery, response: { 200: Type.Array(PortfolioRowSchema) } } }, async (request) =>
    deps.service.list(uid(request.user?.sub), request.query.include_archived ?? false),
  );

  r.post('/portfolios', { preHandler: write, schema: { body: CreatePortfolioBody, response: { 201: CreatePortfolioResponse } } }, async (request, reply) => {
    const result = await deps.service.create(uid(request.user?.sub), request.body.name);
    reply.code(201);
    return result;
  });

  r.post('/portfolios/:id/archive', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.archive(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true as const };
  });

  r.post('/portfolios/:id/unarchive', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.unarchive(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true as const };
  });

  r.delete('/portfolios/:id', { preHandler: write, schema: { response: { 200: OkResponse } } }, async (request) => {
    await deps.service.remove(uid(request.user?.sub), (request.params as { id: string }).id);
    return { ok: true as const };
  });

  r.patch('/portfolios/order', { preHandler: write, schema: { body: ReorderBody, response: { 200: OkResponse } } }, async (request) => {
    await deps.service.reorder(uid(request.user?.sub), request.body.ordered_ids);
    return { ok: true as const };
  });

  // Set or clear the portfolio's benchmark listing (used by the benchmark comparison).
  r.put('/portfolios/:id/benchmark', { preHandler: write, schema: { body: BenchmarkBody, response: { 200: OkResponse } } }, async (request) => {
    await deps.service.setBenchmark(uid(request.user?.sub), (request.params as { id: string }).id, request.body.listing_id);
    return { ok: true as const };
  });
}

function uid(sub: string | undefined): string {
  if (!sub) throw AppError.unauthorized('missing_subject', 'Token missing subject');
  return sub;
}
