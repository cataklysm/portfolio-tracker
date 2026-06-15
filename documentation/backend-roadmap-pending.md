# Backend (Service) Roadmap — Pending Phases

The remaining **service-side** work after Phase A (audit & explainability) shipped.
Phase A's completed record lives in [backend-roadmap.md](backend-roadmap.md); this
file is the to-do list to pick up later. Frontend-only items (e.g. the cash-flow
management UI) are out of scope here.

Each phase lists the **goal**, **owning service(s)**, **tables** (existing vs new),
**contract**, **dependencies**, and a rough **size**.

## Grounding state (as of 2026-06-14)

- **Done (don't redo):** authoritative reporting (`/reporting/summary|holdings|
  allocation|tax`), cash-flow ledger, historical-FX realized values, prior-close
  daily change, transaction-level realized/unrealized attribution (joined with
  linked tax events on the position detail), recorded broker tax + after-tax
  reporting, effective-dated tax residence, **persisted realization allocations**
  (`/positions/:id/allocations`), and **source provenance + change history**
  (`source` columns + `portfolio.booking_changes`, `GET /changes`).
- **Shipped ahead of the phase order (2026-06-15):** country-aware **tax
  estimation** — `tax-rules` (effective-dated rule catalog, migration 013),
  `tax-settings` (validated user/portfolio config, migration 014), and `tax-calc`
  (German securities + crypto engines) behind `GET /tax/estimate`; realization now
  emits per-lot acquisition/disposal dates + per-lot realized P&L. Not in any phase
  below. **C-1's web slice also shipped** (see Phase C note).
- **Schema present but still unused by services:** `portfolio.position_transfers`,
  `portfolio.position_corporate_action_applications`, `preferred_benchmark`
  (portfolios) / `combined_benchmark` (user_preferences), macro-event storage.
- **Market service already provides:** listing daily-close history and historical
  FX (`GET /fx/rate?quote=&date=`) — the inputs Phase B needs.

## Recommended order

**~~B-1~~ → ~~B-2~~ → ~~B-3~~ → ~~C-1~~ → ~~D~~ → ~~E~~.** ✅ **All phased work (B–E) done 2026-06-15.**
The only remaining roadmap track is the separate **Universal-Tracker P0s** below
(broker accounts, statement imports, reconciliation) plus the per-phase follow-ups
noted inline (e.g. benchmark catalog/UI, spin-off/return-of-capital corporate
actions, same-transaction change-history durability).

B is the biggest unlock and gates C's richness and all of E. D (operations) can
proceed in parallel with B. The "Universal Tracker" track (below) is separate and
best started after the audit/correction model from Phase A — it is the foundation
it needs.

---

## Phase B — Historical & Comparative Reporting *(the big unlock)*

**Goal:** turn the dashboard chart from a single-asset price into real portfolio
performance, and make report reads internally consistent.

1. **Historical portfolio performance series.** ✅ **Done 2026-06-15.**
   `reporting/domain/performance-series.ts` replays every position's ledger as of
   each sample date and marks holdings to that day's close, reconstructing value,
   contributed capital, and cumulative P&L over `1W/1M/YTD/1Y/ALL` (computed on
   read — no cache table yet). Conversions mirror the live snapshot (day-FX for
   value/cost, value-date FX for realized/dividends) so the last point reconciles
   with `/reporting/summary`; each point carries a `complete` flag. Served at
   `GET /reporting/performance?portfolio_id=&period=`. Market gained batched
   date-range history to avoid per-day N+1 reads (`GET /fx/series`,
   `GET /quotes/:id/history`, both anchor-prefixed for forward-fill). Dashboard
   shows a value-vs-cost-basis chart with a period selector.
   - *Follow-up:* a cached daily-value table if read latency demands (the replay
     is O(positions × sample-dates)).

2. **XIRR + time-weighted return.** ✅ **Done 2026-06-15.**
   `reporting/domain/returns.ts` adds `computeXirr` (annualized money-weighted,
   ACT/365, Newton–Raphson + bisection) and `computeTwr` (chained sub-period
   returns), built from the ledger by `computeReturns`: trades are the investment
   flows (buy = capital deployed, sell = returned) plus dividends, with the
   opening value as the initial outflow and the closing value the terminal inflow
   (the trades-as-flows convention, matching per-position `total_return_pct`).
   `GET /reporting/performance` returns a `returns { money_weighted, time_weighted }`
   object; the dashboard chart shows both. 12 domain tests.
   - *Approximation:* TWR sub-periods coarsen under strided (long `ALL`) sampling.

3. **Consistent combined snapshot.** ✅ **Done 2026-06-15.**
   `GET /reporting/snapshot` returns summary+holdings+allocation+tax from a single
   fetch of positions/flows/quotes/FX/tax events under one `snapshot_at`, so the
   four reports always reconcile (tax uses the snapshot's own realized P&L). The
   reports page reads it instead of four separate calls. A shared `buildTaxReport`
   is reused by `getTaxReport` and `getSnapshot`.
   - *Note:* the period-scoped `GET /reporting/performance` (B-1/B-2) stays a
     separate read; the snapshot is the current-state set.

---

## Phase C — Activity & Read Models *(medium)*

**Goal:** a single chronological, paginated stream behind the dashboard "Activity"
tab.

1. **Cross-portfolio activity feed.** ✅ **Done 2026-06-15.**
   `modules/activity` adds `GET /activity?cursor=&type=&portfolio_id=`: a union
   read model over `transactions` (trades, scoped via positions→portfolios),
   `cash_flows`, and `tax_events`, projected to one shape and ordered by
   `(occurred_at, id)` DESC with keyset (cursor) pagination. `ActivityService`
   handles opaque cursor encoding and a fetch-limit+1 has-more probe; amounts are
   unsigned with meaning carried by `subtype`/`direction`. The web `/activity` page
   gained a real "Feed" tab (default) with filters and cursor "Load more",
   alongside the existing cash-flow management and change-history tabs.
   - *Still pending:* folding in Phase D's applied corporate actions / transfers
     once those write paths exist. The `portfolio.booking_changes` log (Phase A-2)
     is an adjacent *audit* trail, not part of this feed.

---

## Phase D — Portfolio Operations *(medium; touches accounting)*

**Goal:** the write workflows that change holdings beyond plain buy/sell.

1. **Position transfers.** ✅ **Done 2026-06-15.**
   `POST /positions/:id/transfer` moves a position (with its full ledger) to
   another owned portfolio; `GET /positions/:id/transfers` lists the moves. Atomic
   reassign, or — when the destination already holds the listing — re-point the
   source ledger into the destination position (merge) and drop the empty source;
   transaction ids survive so re-derivation over the combined ledger preserves
   cost basis & history. Logged in `portfolio.position_transfers` (now typed). Web:
   a "Move position" control on the position detail. *Scope:* whole-position only;
   partial-lot splitting is a follow-up. *Caveat:* move/merge SQL verified by
   typecheck + unit tests, not yet run against a live DB.
2. **Corporate-action apply/reverse.** ✅ **Done 2026-06-15.**
   `POST /positions/:id/corporate-actions` applies a share-ratio action (split /
   reverse split): validates the ratio, snapshots the objective action with a
   SHA-256 content hash (`token_signature_hash` — tamper-evident, not a crypto
   signature), derives a UUID from the events stable id for the active-only unique
   index, then re-derives the position. `POST /corporate-actions/:id/reverse`
   un-applies; `GET /positions/:id/corporate-actions` lists. The **realization
   engine is now split-aware** (restate open lots qty ×ratio / unit cost ÷ratio at
   each ex-date, cost basis preserved) with an optional `asOf` so it is correct for
   the live snapshot and every historical sample — threaded through position
   recalc + view AND the reporting performance series + XIRR/TWR. 14 tests.
   - *Scope/notes:* splits & reverse splits only (dividends → cash-flow ledger;
     spin-offs / returns-of-capital are a follow-up). `getOpenPositionCostBases`
     (notifications alert) stays split-unaware. SQL verified by typecheck + unit
     tests, not yet run live.
3. **Market session/holiday-aware prior close.** ✅ **Done 2026-06-15.**
   `GET /listings/sessions?ids=` (instruments) returns each listing's market
   status (open/closed/holiday/weekend/unknown) and the exchange-local current +
   previous trading-session dates via the pure `computeMarketSession` (DST-correct
   Intl local-time math + holiday/weekend walk). Web shows a status badge on the
   position detail. *Placement:* built in **instruments** (owns exchange
   timezone/hours/`holiday_calendar`) rather than market, avoiding a cross-service
   round-trip. *Note:* the market quote prior-close SQL is unchanged — it already
   skips non-trading days via data gaps; this exposes the authoritative session
   state + `previous_trading_date` for consumers to adopt.

---

## Phase E — Benchmarks & Risk *(depends on B)* ✅ **Done 2026-06-15**

**Goal:** comparison and risk analytics, which need the historical series first.

1. **Benchmark comparison.** ✅ `GET /reporting/benchmark?portfolio_id=&period=&benchmark_listing_id=`
   compares a portfolio vs a benchmark listing — both rebased to 100 (portfolio
   from its TWR returns, benchmark from daily closes), with period/excess return,
   beta, correlation, and annualized tracking error (`benchmark.ts`, 4 tests).
   `PUT /portfolios/:id/benchmark` sets/clears `preferred_benchmark`; the
   comparison defaults to it. **Web UI shipped 2026-06-15:** a `BenchmarkPanel`
   on the reports page (single-portfolio only) with the comparison stats, a
   dual-line rebased-to-100 index chart, an instrument-search picker to
   set/change/clear the benchmark, and a `?bperiod=` period selector.
   *Follow-ups:* a curated benchmark **catalog** (vs selecting by listing id),
   resolving the saved benchmark's display name on load (today only a
   this-session pick shows a friendly label), and the auth-owned
   `combined_benchmark` for the combined view.
2. **Risk analytics.** ✅ `GET /reporting/risk?portfolio_id=&period=` — annualized
   volatility, max drawdown, Sharpe, Sortino, best/worst period, and closed-position
   win rate, over the TWR per-period return series (`risk.ts`, 6 tests). Web: a risk
   panel on the reports page. *Follow-up:* benchmark-relative risk (beta is in E-1).

---

## Separate track — Universal Tracker P0s

The "Universal Tracker" P0s in [missing-features.md](missing-features.md) (broker
accounts, statement imports, reconciliation, per-account cash ledger) are **not**
part of the phases above: they are a multi-subsystem track of their own. They are
best started now that Phase A-2 (source provenance + change history) gives them the
correction/audit model they depend on. Rough internal order:

1. Broker & account records (separate from user portfolios) + per-account, per-currency cash ledger.
2. Generic CSV importer + broker statement adapters, with import-batch tracking (source hash, parser version, warnings) and idempotent re-import.
3. Import preview → validation → instrument matching → explicit confirmation; safe rollback of a batch.
4. Reconciliation view + discrepancy queue (holdings, cash, tax, fees, dividends vs. a statement).

~~A hardening follow-up also carries over from Phase A-2: make change-history
recording **same-transaction** with the write (currently best-effort right
after).~~ ✅ **Done 2026-06-15** — see the hardening section below.

---

## Hardening / smaller follow-ups carried over

- ~~**Change-history durability:** record `booking_changes` in the same DB
  transaction as the write (today it is appended right after, so a crash in between
  drops one log row).~~ ✅ **Done 2026-06-15.** The change-log repo now also acts
  as a transactional `ChangeRecorder`; the cash-flow, tax-event, and position
  (transaction) repos take it and run each financial write + its audit row in one
  `db.transaction()` via a shared `withAudit` helper. Services pass a pure
  `AuditFn` builder instead of calling the old fire-and-forget `safeRecord`
  (removed). The trade-off is now **durability over availability**: an audit-row
  failure rolls the write back. Position recalculation stays a separate idempotent
  projection after the commit (it makes external calls and must not hold a txn
  open). *Verified by typecheck + the full suite (168 pass); the DB-transaction
  path itself is not unit-tested (needs a live DB).*
- **Transaction-level tax UI completeness:** position-detail already returns linked
  tax events per transaction; richer correction/reversal UX is part of the
  provenance follow-up.
