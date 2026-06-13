# gateway

The single public edge of the platform. It reverse-proxies public routes to the
owning services, verifies access tokens at the edge, and applies CORS, security
headers, and rate limiting. It is deliberately lightweight — routing and edge
concerns only, no business logic, no service mesh.

## Responsibilities

- **Routing** by path prefix to the four upstreams (see `routes.ts`).
- **Edge token verification** — protected routes require a valid bearer token
  (verified via the authentication service's JWKS) before forwarding. The token
  is forwarded; downstream services validate again (defense in depth).
- **CORS**, **Helmet** security headers, and **rate limiting**.
- **Correlation** — forwards/init `x-request-id` to upstreams.
- **Exposure** — only the routing-table prefixes are reachable. Every upstream
  `/internal/*`, `/health/*`, and `/metrics` is unrouted (404 at the edge).

## Public route map

| Prefix | Upstream | Auth |
|---|---|---|
| `/auth/*` | authentication | public |
| `/.well-known/*` | authentication | public |
| `/me` | authentication | bearer |
| `/portfolios`, `/positions`, `/watchlist` | portfolio | bearer |
| `/instruments`, `/exchanges`, `/listings` | instruments | bearer |
| `/quotes`, `/fx` | market | bearer |
| `GET /health/{live,ready,startup}`, `GET /metrics` | gateway itself | none |

Upstream errors surface as RFC 9457 `502` problem details.

## External dependencies

The four upstream services (`AUTH_BASE_URL`, `PORTFOLIO_BASE_URL`,
`INSTRUMENTS_BASE_URL`, `MARKET_BASE_URL`) and the authentication JWKS for edge
verification. No database or Redis.

## Local run / test

```bash
pnpm --filter @portfolio/gateway dev
pnpm --filter @portfolio/gateway typecheck
```
