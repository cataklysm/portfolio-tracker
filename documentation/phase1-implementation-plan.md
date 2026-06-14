# Phase 1 Implementation Plan — Reliable Current-State Dashboard

> **Status: implemented 2026-06-14.** All six items built and verified. A test
> runner is now in place — `node:test` + `tsx` (`pnpm test`), 35 tests covering
> realization (FIFO/LIFO/average + dated events), historical-FX conversion +
> daily-change, the reporting summary/holdings/allocation aggregation, and
> cash-flow validation. Backend complete; frontend wiring of the new
> `/reporting/*` endpoints is the remaining follow-up.

Concrete, file-level plan for **Phase 1** of [missing-features.md](missing-features.md):
make the dashboard's headline numbers authoritative and server-owned. Ordered by
dependency. Each item lists the owning service, the files to add/change, the
contracts, the core logic, and how to verify.

Grounding facts (verified against the code):
- Portfolio service has modules `portfolios`, `positions`, `watchlist` only — no
  reporting, no cash-flows. Per-position metrics live in
  `positions/domain/performance.ts`; views are assembled in
  `positions/application/build-position-view.ts` and batched in
  `position-service.ts:listPositions`.
- `convertToReporting` uses a **single latest** EUR rate (`FxReader.getEurRates`)
  for every amount — no historical FX.
- `QuotePair.previous` is the second-most-recent stored tick, not a prior close.
- The market service **already** exposes historical FX: `GET /fx/rate?quote=&date=`
  (`getEurRateForDate`, on-or-before fallback). Portfolio just doesn't call it.
- `portfolio.cash_flows` exists in the DB (type ∈ dividend/deposit/withdrawal/
  cash_in_lieu; gross/withholding/fee/net/currency/value-date) but is **not**
  mapped in the portfolio Kysely schema and has no module.
- `'equity' | 'crypto'` is hardcoded in ~6 files; the DB already allows `fund`.

---

## Item 1 — Consistent `fund` support  *(warm-up, independent)*

**Why first:** self-contained, unblocks the funds already in the seed, and de-risks
the type plumbing before reporting touches it.

**Changes (replace the `'equity' | 'crypto'` union with `'equity' | 'crypto' | 'fund'`):**
- `services/instruments/src/platform/database/schema.ts` — `InstrumentsTable.asset_type`.
- `services/instruments` catalog domain/validation + create/search flow — accept `fund`.
- `services/portfolio/src/modules/positions/application/ports.ts` (`ListingSummary`),
  `.../application/build-position-view.ts` (`PositionView.listing.asset_type`),
  `.../infrastructure/clients/instruments-listing-client.ts`,
  `.../modules/watchlist/application/watchlist-service.ts`.
- `web/lib/types.ts` + the add-position form (equity/crypto selector), positions-grid
  type filter, asset-type theming/formatting, and i18n labels.

**Verify:** add a `fund` instrument via the UI; it lists, gets quotes, and renders with
a fund theme. Typecheck clean.

---

## Item 2 — Historical FX for realized amounts & fees  *(portfolio ⇄ market)*

**Why second:** foundational for correct realized P&L/fees/dividends, which the
reporting snapshot (Item 5) sums.

**Contract (consume the existing market endpoint):**
- Extend `FxReader` (`positions/application/ports.ts`) with a batch historical read:
  `getEurRatesAt(requests: {currency, date}[], bearerToken): Promise<Map<\`${currency}@${date}\`, string>>`,
  implemented in `infrastructure/clients/market-fx-client.ts` against
  `GET /fx/rate?quote=&date=` (dedupe pairs; EUR→1).

**Core logic:**
- Thread a `rateAt(currency, valueDate)` resolver into the realization→performance
  path. In `performance.ts`, convert **realized P&L per sell-lot** and **each fee**
  at that transaction's `tax_relevant_value_date`, not at the latest rate.
- Keep open cost basis / current value / unrealized P&L mark-to-market at the latest
  rate (standard). Only realized/fees/dividends move to value-date FX.
- This requires `computeRealization` (or a thin wrapper) to expose per-realization-event
  amounts + their value dates so each can be converted independently, then summed.

**Verify:** unit tests for weekend/holiday value dates (uses preceding rate), partial
sells, and mixed-currency positions; a position whose realized P&L differs between
latest-FX and value-date-FX shows the value-date number.

---

## Item 3 — Prior-close & exact daily change  *(market, then portfolio)*

**Why third:** the summary's "today" figure needs a real prior close and an absolute
amount, not `qty × pct`.

**Market changes:**
- Add a prior-close read to the quote repo: the most recent stored quote strictly
  before the latest quote's **exchange-local calendar day** (exchange timezone comes
  from the instruments `exchanges` row; pass tz alongside the listing, or resolve it
  in market). Surface it as `QuotePair.previous`/`prior_close` distinctly from "latest
  intraday tick".
- *Bounded scope:* full holiday-calendar session state stays P2 (per the doc's
  "Market Session Status"). Phase 1 uses the calendar-day boundary as the prior-close
  definition — already a correct fix over "2nd-most-recent tick".

**Portfolio changes:**
- In `performance.ts`, expose `daily_change_amount_reporting = openQty × (latest −
  priorClose)` converted at latest FX, alongside the existing `daily_change_pct`.

**Verify:** a listing with several intraday ticks today reports a daily change based on
yesterday's close, not the previous tick; amount = qty × price delta in reporting ccy.

---

## Item 4 — Cash-flow / dividend module  *(portfolio)*

**Why fourth:** dividends feed total return and the income metric in the summary.

**New module `services/portfolio/src/modules/cash-flows/`:**
- `platform/database/schema.ts` — add `CashFlowsTable` (map the existing table:
  id, user_id, portfolio_id, position_id?, type, gross_amount, withholding_tax, fee,
  net_amount, currency, value_date, …) + register in `PortfolioDatabase`.
- `infrastructure/cash-flow-repository.ts` — CRUD + `listForUser(portfolioId?)`,
  `sumDividendsByPortfolio`, `sumByInstrument` (joined via position→listing).
- `application/cash-flow-service.ts` — validation (net = gross − withholding − fee),
  ownership checks.
- `http/cash-flow-routes.ts` — `POST/GET/PATCH/DELETE /portfolios/:id/cash-flows`,
  filterable by type and position. Scope `portfolio` (existing write scope).
- Wire into `app.ts` + the gateway public-prefix list if a new prefix is introduced.

**Verify:** record a dividend; it appears in the list, sums correctly (incl.
withholding), and later flows into the summary's dividend + total-return fields.

---

## Item 5 — Portfolio summary + combined-holdings reporting  *(portfolio, headline)*

**Why fifth:** the header, allocation rail, and intelligence panel all consume this
one snapshot; it depends on Items 2–4.

**New module `services/portfolio/src/modules/reporting/`:**
- `domain/summary.ts` — pure aggregation: given each position's realization +
  quote + value-date FX resolver + cash flows, produce one snapshot. **Percentages
  are computed from summed cash amounts and their denominators** (never by averaging
  position percentages).
- `application/reporting-service.ts` — reuses the `listPositions` batch-fetch pattern
  (listings, quotes, transactions, FX) but for a portfolio or the combined active set;
  pulls cash flows from Item 4.
- `http/reporting-routes.ts`.

**`GET /reporting/summary?portfolio_id=` (omit ⇒ combined active portfolios):**
```
{ snapshot_at, reporting_currency, quote_freshness, completeness,
  current_value, invested_capital,
  daily_change_amount, daily_change_pct,
  realized_pnl, unrealized_pnl, dividends, fees, total_pnl,
  simple_return_pct, total_return_pct,
  preferred_headline_metric, preferred_benchmark,
  counts: { open, closed, invalid, stale, unavailable } }
```
(`preferred_headline_metric`/`preferred_benchmark` come from `portfolios` columns —
already in the DB, currently omitted from responses; surface them.)

**`GET /reporting/holdings?portfolio_id=` (combined ⇒ grouped by instrument):**
```
[ { instrument_id, symbol, name, asset_type,
    portfolios: [{id, name}],            // contributing-portfolio badges
    listings: [{ listing_id, currency, quantity, price, value_reporting }],
    quantity, market_value, open_cost_basis,
    realized_pnl, unrealized_pnl, dividends,
    daily_change_amount,                  // value-weighted
    weight_pct } ]
```
Accounting stays **listing-specific** before aggregation.

**Verify:** for a known seeded portfolio, the summary's totals reconcile with the sum
of per-position views (within rounding); combined holdings groups a dual-listed
instrument into one row with both portfolio badges.

---

## Item 6 — Allocation + intelligence from the same snapshot  *(portfolio)*

**Why last:** pure derivations of the Item 5 snapshot.

- `GET /reporting/allocation?portfolio_id=` — breakdowns by instrument, asset_type,
  portfolio, and currency, all from the same snapshot/completeness rules.
- Add `largest_concentration` (with a configurable warning threshold) and
  `top_mover` (using Item 3 prior-close semantics + grouped-instrument handling) —
  either as fields on the summary or a small `/reporting/intelligence` response.

**Verify:** allocation percentages sum to 100% of classified value; concentration and
top-mover match a hand check against the holdings response.

---

## Build order & checkpoints

1. **Item 1 (fund)** — small, ship + verify independently.
2. **Item 2 (historical FX)** — domain + tests; no API surface change yet.
3. **Item 3 (prior close / daily amount)** — market + portfolio perf field.
4. **Item 4 (cash-flows)** — new module + endpoints.
5. **Item 5 (summary + combined holdings)** — the headline; depends on 2–4.
6. **Item 6 (allocation + intelligence)** — derivations of 5.

Each item is independently typecheckable and verifiable. After Item 5 the frontend can
replace its self-summed `PortfolioSummary` with the authoritative snapshot; Items 1, 3,
4 also have immediate user-visible payoffs.

**Out of Phase 1 (kept as later phases per the doc):** historical portfolio series &
XIRR, benchmark catalog/series/comparison, activity feed, risk metrics, batched
sparklines, session status with holiday calendar, classifications/logos, cross-device
theme.
