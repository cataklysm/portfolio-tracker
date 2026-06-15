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

**~~B-1~~ → B-2 → B-3 → C-1 → D → E.** (B-1 done 2026-06-15.)

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

2. **XIRR + time-weighted return.** Money-weighted (XIRR) over external cash flows
   and TWR over sub-period returns, layered on B-1's series.
   - *Owner:* portfolio. *Size:* M (pure domain + tests once the series exists).

3. **Consistent combined snapshot.** Either one endpoint returning
   summary+holdings+allocation+tax under a single `snapshot_at`/version, or a shared
   snapshot id across the existing reads, to remove cross-request drift.
   - *Owner:* portfolio. *Size:* S–M.

---

## Phase C — Activity & Read Models *(medium)*

**Goal:** a single chronological, paginated stream behind the dashboard "Activity"
tab.

> **Web slice done (2026-06-15):** the `/activity` page (`ActivityWorkspace`)
> already merges trades, cash flows, and tax events into one chronological,
> filterable stream by aggregating the existing per-entity reads client/server
> side. **Still pending:** the backend union read model + cursor pagination below
> (`GET /activity`), and folding in Phase D's corporate actions / transfers.

1. **Cross-portfolio activity feed.** Merge trades, cash flows, **tax events**, and
   (once Phase D lands) applied corporate actions / transfers into one paginated,
   filterable read model.
   - *Owner:* portfolio. *Contract:* `GET /activity?cursor=&type=&portfolio_id=`.
   - *Dep:* none for the trade/cash-flow/tax slice; corporate actions/transfers
     plug in from Phase D. The `portfolio.booking_changes` log (Phase A-2) is a
     useful adjacent source but is an *audit* trail, not the activity feed.
   - *Size:* M. A union read model + cursor pagination; no new write paths.

---

## Phase D — Portfolio Operations *(medium; touches accounting)*

**Goal:** the write workflows that change holdings beyond plain buy/sell.

1. **Position transfers.** Implement the module over `portfolio.position_transfers`
   (move/merge lots between portfolios while preserving cost basis & history).
2. **Corporate-action apply/reverse.** A signed apply/reverse workflow over
   `portfolio.position_corporate_action_applications` that adjusts accounting
   (splits, spin-offs, returns of capital); events service already exposes the
   objective actions.
3. **Market session/holiday-aware prior close.** Extend the market service beyond
   the current UTC-calendar-day prior close to exchange-local session + holiday
   calendars and explicit open/closed/holiday state.
   - *Owners:* portfolio (1–2), market (3). *Tables:* exist for 1–2. *Dep:* feeds
     Phase C and Phase E. *Size:* L overall (split per item).

---

## Phase E — Benchmarks & Risk *(depends on B)*

**Goal:** comparison and risk analytics, which need the historical series first.

1. **Benchmark catalog + series + comparison.** Public read/write for portfolio &
   combined benchmark preferences (`preferred_benchmark` / `combined_benchmark`
   columns exist), a benchmark instrument catalog, historical series, and
   period-relative portfolio-vs-benchmark calculations.
   - *Owners:* portfolio (preferences/comparison), market (benchmark series),
     authentication (combined benchmark preference). *Dep:* Phase B-1.
2. **Risk analytics.** Volatility, max drawdown, Sharpe/Sortino, best/worst
   periods, closed-position win rate, benchmark-relative risk.
   - *Owner:* portfolio. *Dep:* Phase B-1 (+ E-1 for relative measures).
   - *Size:* M (pure domain over the series).

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

A hardening follow-up also carries over from Phase A-2: make change-history
recording **same-transaction** with the write (currently best-effort right after).

---

## Hardening / smaller follow-ups carried over

- **Change-history durability:** record `booking_changes` in the same DB
  transaction as the write (today it is appended right after, so a crash in between
  drops one log row).
- **Transaction-level tax UI completeness:** position-detail already returns linked
  tax events per transaction; richer correction/reversal UX is part of the
  provenance follow-up.
