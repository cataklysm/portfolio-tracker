# Deployment & Verification Caveats

Standing caveats to clear before relying on recently shipped backend work. These
were verified by `pnpm typecheck` + the unit/domain suite, but **not yet run
against a live PostgreSQL** (no DB was available in the build environment). Tick
them off once smoke-tested against a running stack.

## 1. New SQL not yet run against a live DB

Apply migrations and exercise each endpoint once against real Postgres:

- [ ] **Migration 016 — partial transfers.** `position_transfers` gains
  `kind` / `destination_position_id` / `transferred_quantity`. Smoke-test
  `POST /positions/:id/transfer-lots` (move fully-open lots) and
  `GET /positions/:id/transfers`.
- [ ] **Migration 017 — benchmark catalog.** `index` asset type + `benchmark_catalog`
  table + seeds. Verify `GET /benchmarks` returns the four entries and that
  opening a position on an index listing is rejected (`index_not_holdable`).
- [ ] **Activity feed union** (`GET /activity`) now also unions
  `position_corporate_action_applications` (`corporate_action`) and
  `position_transfers` (`transfer`). Verify both kinds appear, ownership scoping,
  and keyset pagination still hold.
- [ ] **Per-portfolio transfer attribution.** `listWholeTransfersForUser` +
  ownership-window clipping in the performance/returns reconstruction. After a
  whole transfer, verify `GET /reporting/performance` attributes history to the
  source before the transfer and the destination after (combined unchanged).
- [ ] **Combined benchmark.** `auth` reads/writes `user_preferences.combined_benchmark`
  (the column predates this work). Verify `PATCH /me/preferences` round-trips and
  `GET /reporting/benchmark` (no `portfolio_id`) defaults to it.
- [ ] **Change-history durability.** Booking writes + their `booking_changes`
  audit row now commit in one transaction (`withAudit`). Verify a normal
  create/update/delete still writes the audit row, and that an induced audit
  failure rolls the write back.

## 2. External-data caveats

- [ ] **Benchmark catalog Yahoo symbols** (migration 017) need verification —
  Yahoo is an unofficial, changeable integration:
  - `^GSPC` (S&P 500), `^NDX` (NASDAQ-100), `^GDAXI` (DAX) — generally reliable.
  - `^990100-USD-STRD` (MSCI World) — Yahoo's MSCI World series is awkward and may
    not resolve; if so, reseed with a working identifier or rely on the free-text
    search fallback. Index listings only feed benchmark series, never holdings.

## 3. Known approximations (correctness scope, not bugs)

- **Partial-transfer historical attribution** is position-level. Lots moved by a
  *partial* transfer still count toward the destination position from their
  original buy date (needs lot-level ownership). Whole transfers are exact.
- **Per-portfolio TWR/XIRR across a transfer boundary** uses the cost-basis model;
  the single sub-period spanning the transfer is approximate (market-value-exact
  legs were the deferred alternative).
- **TWR sub-periods coarsen** under long strided (`ALL`) sampling.

## 4. Deferred, pending product decisions (do not implement implicitly)

- **Return of capital** and **spin-off** corporate actions — fully specified in
  `prompt.md` §2.6 (DE policy decided), not yet built.
- **User risk profiles** adjusting portfolio-pulse risk thresholds.
