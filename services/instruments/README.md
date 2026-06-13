# instruments

Owns the shared instrument master data: underlying **instruments**,
exchange-specific **listings**, **exchanges** (ISO 10383 MIC), and
provider-identifier mappings. This data is global (not user-owned); other
services reference it by stable ID and never write it.

## Owned capabilities

- List exchanges; register a new exchange.
- Search the local instrument catalog (by name, ISIN, or listing symbol).
- Fetch an instrument with its listings, or a single listing.
- Batch-fetch listing summaries by ID (consumed by the portfolio service).
- Atomically register an instrument + listing from a confirmed search result.
  Duplicate confirmations converge on the same records via unique constraints
  (instrument ISIN; listing exchange + symbol; provider + provider identifier).

Provider-backed discovery (searching Yahoo via the market service) is a planned
extension; today search covers the existing local catalog. A
`instruments.listing.created` event is written to the transactional outbox on
creation; the publisher worker is a follow-up.

## Modules

| Module | Responsibility |
|---|---|
| `catalog` | Instruments, listings, exchanges, provider identifiers |

## Public HTTP contracts

| Method & path | Exposure | Auth (scope) |
|---|---|---|
| `GET /exchanges` | public | user (`instruments:read`) |
| `POST /exchanges` | public | user (`instruments:write`) |
| `GET /instruments/search?q=&limit=` | public | user (`instruments:read`) |
| `GET /instruments/:id` | public | user (`instruments:read`) |
| `POST /instruments` | public | user (`instruments:write`) |
| `GET /listings?ids=a,b,c` | internal+public | user (`instruments:read`) |
| `GET /listings/:id` | public | user (`instruments:read`) |
| `GET /health/{live,ready,startup}` · `GET /metrics` | internal | none |

## Persistence ownership

Owns the `instruments.*` schema: `currencies`, `exchanges`, `instruments`,
`listings`, `listing_provider_identifiers`, `outbox_events`.

## External dependencies

PostgreSQL (`INSTRUMENTS_DATABASE_URL`, falls back to `DATABASE_URL`) and Redis
(`VALKEY_URL`, required, checked at startup). Token verification uses the
authentication service JWKS.

## Local run / test

```bash
pnpm --filter @portfolio/instruments dev
pnpm --filter @portfolio/instruments typecheck
```
