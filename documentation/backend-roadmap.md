# Backend (Service) Roadmap — Post Tax-P0

Slices the remaining **service-side** follow-ups into dependency-ordered phases.
Frontend-only items (e.g. the cash-flow management UI) are out of scope here.
Grounding state as of 2026-06-14:

- **Done:** authoritative reporting (`/reporting/summary|holdings|allocation`),
  cash-flow ledger, historical-FX realized values, prior-close daily change,
  transaction-level realized/unrealized attribution (derive-on-read, now joined
  with linked tax events on the position detail), recorded broker tax + after-tax
  reporting (`/reporting/tax`), effective-dated tax residence.
- **Schema already present but unused by services:** `portfolio.realization_allocations`,
  `portfolio.average_cost_realizations`, `portfolio.position_transfers`,
  `portfolio.position_corporate_action_applications`, `preferred_benchmark`
  (portfolios) / `combined_benchmark` (user_preferences), macro-event storage.

Each phase lists the **goal**, **owning service(s)**, **tables** (existing vs new),
**contract**, **dependencies**, and a rough **size**.

---

## Phase A — Audit & Explainability *(small; builds directly on done work)*

**Goal:** make the derived accounting durable and traceable, so realized P&L, tax
exports, and "which buy lots a sell consumed" survive without replaying the ledger.

1. **Persist realization allocations.** ✅ **Done 2026-06-14.**
   `computeRealization` now emits `lotConsumptions` (per-sell→buy lot quantities);
   `recalculate` persists them to `portfolio.realization_allocations` (FIFO/LIFO)
   and `portfolio.average_cost_realizations` inside the same transaction that bumps
   `calculation_version`, replacing the prior version's rows (idempotent).
   `GET /positions/:id/allocations` exposes the current snapshot. Verified live:
   replace-not-duplicate + version bump.

2. **Source provenance + change history (foundation).** Add a `source`
   (manual/import/api/corporate_action) and an append-only change log to financial
   bookings (transactions, cash flows, tax events). Tax events already carry
   `source`; extend to transactions/cash flows and add a `*_history` audit table.
   - *Owner:* portfolio. *Tables:* new audit table(s). *Dep:* none.
   - *Size:* M. Prerequisite for imports/reconciliation (later) and tax exports.

---

## Phase B — Historical & Comparative Reporting *(the big unlock)*

**Goal:** turn the dashboard chart from a single-asset price into real portfolio
performance, and make report reads internally consistent.

1. **Historical portfolio performance series.** A new module reconstructing
   portfolio value, contributed capital, and cumulative P&L per point over
   `1W/1M/YTD/1Y/ALL` from: trades, cash flows, historical prices, historical FX.
   - *Owner:* portfolio (consumes market history + FX). *Tables:* none required if
     computed on read; consider a cached daily-value table if latency demands.
   - *Contract:* `GET /reporting/performance?portfolio_id=&period=`.
   - *Dep:* market daily-close history + historical FX (both exist).
   - *Size:* L. Core new計算 engine; the largest item here.

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

1. **Cross-portfolio activity feed.** Merge trades, cash flows, **tax events**, and
   (once Phase D lands) applied corporate actions / transfers into one paginated,
   filterable read model.
   - *Owner:* portfolio. *Contract:* `GET /activity?cursor=&type=&portfolio_id=`.
   - *Dep:* none for the trade/cash-flow/tax slice; corporate actions/transfers
     plug in from Phase D.
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

## Recommended order

**A-1 → A-2 → B-1 → B-2 → B-3 → C-1 → D → E.**

A is the cheapest high-value step (closes the audit/export loop that transaction
attribution and the tax ledger already feed). B is the biggest unlock and gates C's
richness and all of E. D can proceed in parallel with B once A is done.

> The "Universal Tracker" P0s in [missing-features.md](missing-features.md) (broker
> accounts, statement imports, reconciliation, cash ledger) are deliberately **not**
> phased here: they are a separate multi-subsystem track best started after A-2
> (provenance) gives them a correction/audit model to build on.
