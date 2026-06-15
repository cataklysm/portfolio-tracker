# Backend (Service) Roadmap — Post Tax-P0

> **Phase A is complete (2026-06-14).** This file is now the record of the
> completed audit & explainability phase. The remaining phases (**B — historical &
> comparative reporting, C — activity feed, D — operations, E — benchmarks & risk**)
> and the separate Universal-Tracker track have moved to
> [backend-roadmap-pending.md](backend-roadmap-pending.md) — pick up there.

Slices the **service-side** follow-ups into dependency-ordered phases.
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

2. **Source provenance + change history (foundation).** ✅ **Done 2026-06-14.**
   Migration 012 added a `source` column to `transactions` and `cash_flows` (tax
   events already had one) and an append-only `portfolio.booking_changes` audit log
   (no FK, so history outlives the entity). The cash-flow, tax-event, and position
   (transaction) services record created/updated/deleted with before/after JSON
   snapshots via a shared `safeRecord` (best-effort — never blocks the write).
   `GET /changes?entity_type=&entity_id=&portfolio_id=` exposes the history.
   Verified live (create→update→delete yields 3 rows with correct snapshots).
   - *Hardening follow-up:* same-transaction durability (currently recorded right
     after the write, so a crash in between drops one log row). Carried into
     [backend-roadmap-pending.md](backend-roadmap-pending.md).

---

## Remaining phases

Phases **B–E** and the separate Universal-Tracker track now live in
[backend-roadmap-pending.md](backend-roadmap-pending.md). Recommended order from
here: **B-1 → B-2 → B-3 → C-1 → D → E**.
