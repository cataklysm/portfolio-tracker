# Quote & Market-Session Status Contract

Stand: 2026-06-24

This is the shared vocabulary for asset-detail "is this price trustworthy right now?"
logic (requirements §7). It is a **contract/enum alignment**, not a new aggregation
endpoint: `market` and `instruments` each emit their own raw status, and the web
(`web/features/asset-detail/model/asset-detail-model.ts` → `deriveQuoteStatus`)
combines them into a single exchange-aware status for the UI. No service calls another.

## Producers

### `market` — quote freshness
`GET /quotes?listing_ids=...` (`QuoteView`, see `services/market/src/modules/quotes`).
Authoritative `freshness_status` values:

| value | meaning |
|-------|---------|
| `fresh` | newest stored tick is within `staleAfterMs` of now |
| `stale` | a tick exists but is older than `staleAfterMs` |
| `unavailable` | no stored quote for the listing |

Also exposed for attribution: `latest_at` (newest tick time), `provider`,
`provider_timestamp`. Note: the storage column `market.price_quotes.freshness_status`
also has a `delayed` literal, but it is an ingest-time marker and is **not** surfaced
on the read API — readers must rely on the three values above plus session context.

### `instruments` — market session
`GET /listings/sessions?ids=...` (`computeMarketSession`, `services/instruments/.../session.ts`).
Authoritative `status` (`MarketStatus`) values:

| value | meaning |
|-------|---------|
| `open` | now is within the exchange's regular session |
| `closed` | trading day, but outside regular hours |
| `weekend` | non-trading weekend day |
| `holiday` | listed full-closure holiday |
| `unknown` | no exchange / timezone (e.g. crypto, 24h, unmapped) |

Plus `last_session_close` and `next_session_open` (UTC ISO instants) and
`minutes_since_close`, used to phrase "valid until the market reopens".

## Combined `data_quality` (web-derived)

`deriveQuoteStatus(quote, session)` maps freshness × session to one state:

| data_quality | derivation | tone | action required |
|--------------|-----------|------|-----------------|
| `fresh` | `freshness=fresh` AND (`open` OR `unknown`) | positive | no |
| `official_close` | market `closed` (trading day, after close) | neutral | no |
| `market_closed_valid` | market `weekend`/`holiday` | neutral | no |
| `stale` | `freshness=stale` while `open`/`unknown` | warning | **yes** |
| `missing` | no quote / `latest` null | critical | **yes** |
| `delayed` | *reserved* — no per-provider delay signal on the read path yet | — | — |
| `provider_error` | *reserved* — no error signal propagated to reads yet | — | — |

### Rules of thumb
- **Closed exchange is never "stale".** A recent-enough close during `closed`/`weekend`/
  `holiday` is `official_close` / `market_closed_valid` (neutral), not a problem.
- **Action required** = `stale` (overdue while the venue is open) or `missing`. These are
  the only states the UI should flag as needing attention.
- **`unknown` venues** (crypto/24h) fall back to freshness alone: `fresh` → ok,
  `stale` → warning.

## Extending
`delayed` and `provider_error` are reserved so the enum is stable when those signals
are eventually propagated from the providers service to the read path. Add them to the
producer contract (market quote view) before deriving them in the web, so the
vocabulary stays single-sourced.
