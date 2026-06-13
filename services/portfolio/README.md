# portfolio

Owns user portfolios, positions, authoritative transactions, realization
accounting, and the watchlist. Position state, cost basis, and P&L are **derived**
from the ordered transaction ledger and are never set directly.

## Owned capabilities

- Portfolios: create, list, archive/unarchive, reorder, permanent delete
  (cascades to contained positions, transactions, and derived records).
- Positions and authoritative buy/sell transactions, with fractional shares.
- Realization accounting (FIFO / LIFO / average cost) and core performance
  metrics (current value, open cost basis, realized & unrealized P&L, total
  fees, simple return, total return, daily change) in the user's reporting
  currency.
- Watchlist of not-yet-held listings.
- Transactional outbox (`portfolio.position.opened`) for refresh-interest
  propagation. The publisher worker is a planned follow-up.

## Modules

| Module | Responsibility |
|---|---|
| `portfolios` | Portfolio lifecycle management |
| `positions` | Positions, transactions, realization & performance (domain) |
| `watchlist` | User-level listing interest |

`positions/domain/` holds the exact-decimal money type, realization accounting,
performance, currency conversion, and state derivation — free of any I/O.

## Cross-service reads (temporary)

The instruments and market services do not exist yet, so listings, quotes, and
FX rates are read through **read-model adapters** in
`positions/infrastructure/read-models/` that query the `instruments.*`,
`market.*`, and `authentication.*` schemas in the shared database. These are the
only place that touches foreign schemas. They are defined behind ports
(`ListingReader`, `QuoteReader`, `FxReader`, `SettingsReader`) so they become
HTTP clients without changing any domain or application code.

## Public HTTP contracts

| Method & path | Exposure | Auth (scope) |
|---|---|---|
| `GET /portfolios` | public | user (`portfolio:read`) |
| `POST /portfolios` | public | user (`portfolio:write`) |
| `POST /portfolios/:id/archive` · `/unarchive` | public | user (`portfolio:write`) |
| `DELETE /portfolios/:id` | public | user (`portfolio:write`) |
| `PATCH /portfolios/order` | public | user (`portfolio:write`) |
| `GET /positions` · `GET /positions/:id` | public | user (`portfolio:read`) |
| `POST /positions` | public | user (`portfolio:write`) |
| `POST /positions/:id/transactions` | public | user (`portfolio:write`) |
| `GET /watchlist` | public | user (`portfolio:read`) |
| `POST /watchlist` · `DELETE /watchlist/:listingId` | public | user (`portfolio:write`) |
| `GET /health/{live,ready,startup}` · `GET /metrics` | internal | none |

## Persistence ownership

Owns the `portfolio.*` schema. Reads `instruments.*` / `market.*` /
`authentication.*` only through the temporary read-models above; never writes
them.

## External dependencies

PostgreSQL (`PORTFOLIO_DATABASE_URL`, falls back to `DATABASE_URL`) and Redis
(`VALKEY_URL`) — Redis is required and checked at startup. Token verification
uses the authentication service JWKS (`AUTH_JWT_ISSUER`).

## Local run / test

```bash
pnpm --filter @portfolio/portfolio dev
pnpm --filter @portfolio/portfolio typecheck
```
