# @portfolio/platform

Shared service runtime for the backend services. It provides the cross-cutting
technical capabilities every service needs so that feature modules stay focused
on business behavior. It is **not** a place for business-domain logic.

## Exports

- `createService` — Fastify factory wired with request IDs, `X-API-Version`
  negotiation, RFC 9457 problem-details errors, health probes, and Prometheus
  metrics.
- `createDatabase` — Kysely + pg pool with NUMERIC/INT8 returned as exact
  strings (never lossy floats).
- `createRedis` / `connectRedis` — Redis client and fail-fast startup check.
- `UserTokenVerifier` — verifies internal access tokens via JWKS and exposes
  `authenticate` and `requireScope` Fastify hooks.
- `AppError` / `toProblemDetails` — typed errors that render as problem details.
- `createLogger` — structured JSON logger with secret redaction.
- `EventEnvelope` — the shared Redis Streams event-envelope contract.

Consumed as a workspace package (`@portfolio/platform`) via `package.json`
`exports`; only `src/index.ts` is public API.
