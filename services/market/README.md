# market

Owns quotes, official daily FX rates, the consolidated refresh-interest
projection, and the refresh scheduler. It encapsulates external market-data
providers behind adapters and is the only service that talks to Yahoo Finance
and the ECB. Portfolio reads always use the stored, normalized data here and
never depend synchronously on an external provider.

## Owned capabilities

- Normalized quote cache/history (`price_quotes`) with freshness status.
- Official daily ECB FX reference rates (`fx_rates`) with last-available-rate
  fallback for weekends/holidays.
- Provider discovery (Yahoo symbol search) for the instruments service.
- Consolidated refresh-interest projection (`refresh_interests`) built from
  portfolio events, plus a periodic refresh scheduler (`data_refresh_state`).

Provider adapters (Yahoo, ECB) sit behind ports; Yahoo/ECB-specific shapes
never leak into business logic.

## Modules

| Module | Responsibility |
|---|---|
| `quotes` | Store/read normalized quotes; on-demand & scheduled provider refresh |
| `fx` | Store/read ECB EUR-based daily rates; provider refresh |
| `discovery` | Yahoo symbol search for instrument discovery |
| `refresh` | Interest projection, scheduler, and the portfolio-stream consumer |

## Public HTTP contracts

| Method & path | Exposure | Auth |
|---|---|---|
| `GET /quotes?listing_ids=a,b` | public | user (`market:read`) |
| `GET /quotes/:listingId/series?limit=` | public | user (`market:read`) |
| `GET /fx/rates?quote_currencies=USD,GBP` | public | user (`market:read`) |
| `GET /fx/rate?quote=USD&date=YYYY-MM-DD` | public | user (`market:read`) |
| `POST /internal/quotes/refresh` | internal | service (network restricted) |
| `POST /internal/fx/refresh` | internal | service (network restricted) |
| `GET /internal/discovery/search?q=` | internal | service (network restricted) |
| `GET /health/{live,ready,startup}` · `GET /metrics` | internal | none |

Internal endpoints are unauthenticated today and **must** be network/gateway
restricted; they move to service-token auth when that is introduced.

## Events

Consumes the `portfolio` Redis stream (group `market`) for
`portfolio.position.opened/closed` and `portfolio.watchlist.added/removed`,
maintaining `refresh_interests` idempotently (stale aggregate versions ignored).

## Persistence ownership

Owns `market.*`: `price_quotes`, `fx_rates`, `manual_valuations`,
`data_refresh_state`, `refresh_interests`, `outbox_events`.

## External dependencies

PostgreSQL (`MARKET_DATABASE_URL` / `DATABASE_URL`), Redis (`VALKEY_URL`,
required), the instruments service (`INSTRUMENTS_BASE_URL`) for listing→provider
resolution, Yahoo Finance, and the ECB. Provider failures degrade data
freshness but never affect readiness.

## Local run / test

```bash
pnpm --filter @portfolio/market dev
pnpm --filter @portfolio/market typecheck
```
