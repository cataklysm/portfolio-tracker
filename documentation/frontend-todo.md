# Frontend TODO

Frontend-only work, deferred out of the current backend-focused work stream.
Backend features land first (with their contracts); the matching UI is captured
here so nothing is lost. Each item notes the backend it depends on.

> Convention: when a backend change ships an endpoint or shape the UI should
> surface, add a checkbox item here instead of editing web/ in the backend work.

## Benchmark comparison UI
- [x] **Integrated & working** (corrected 2026-06-15). The comparison is wired on
  the per-portfolio **dashboard** page (`web/app/dashboard/page.tsx` →
  `fetchBenchmark` → `GET /reporting/benchmark`), and `PortfolioBenchmarkSettings`
  (portfolio settings page, `portfolios/[id]/settings/actions.ts` →
  `setPreferredBenchmarkAction`) sets/changes the benchmark. Display name is
  resolved server-side and passed in as `current.label`, so the earlier
  "resolve display name" concern is moot. Not on `/reports` by design.

## Activity feed — new kinds
- [ ] **Render `corporate_action` and `transfer` activity items.** `GET /activity`
  now unions applied corporate actions and position transfers (kinds
  `corporate_action`, `transfer`). The web `ActivityFeed` needs: filter chips for
  the two new kinds; row rendering where `amount`/`currency` are **null** (no
  money) — for `corporate_action` show the ratio from `quantity:price` and the
  `split`/`reverse_split` subtype, plus a "reversed" badge when `direction ===
  "reversed"`; for `transfer` show a move between portfolios. Backend shipped.

## Combined-view benchmark
- [ ] **Set the combined benchmark in the UI.** `PATCH /me/preferences`
  `{ combined_benchmark: <listing_id> | null }` sets/clears the per-user benchmark
  for the **combined all-portfolios** view; `GET /me` returns it at
  `preferences.combined_benchmark`. The combined benchmark comparison
  (`GET /reporting/benchmark` with **no** `portfolio_id`) now defaults to it.
  UI: when "All portfolios" is selected (dashboard) or in user settings, offer an
  instrument-search picker (reuse `searchInstrumentsAction`) wired to a
  `setCombinedBenchmarkAction` server action. Distinct from the per-portfolio
  benchmark (`PortfolioBenchmarkSettings`).

## Partial-lot position transfers
- [ ] **Lot-transfer UI on the position detail.** `POST /positions/:id/transfer-lots`
  `{ destination_portfolio_id, lot_transaction_ids[], effective_at? }` moves a
  subset of **fully-open** buy lots to a same-listing position in another
  portfolio. UI needs: a multi-select of the position's open buy lots (the
  transactions table already shows which buys are open) + a destination-portfolio
  picker, calling the endpoint. Backend rejects consumed lots / average-cost
  positions with sales / non-buys (surface those 400 messages). Distinct from the
  existing whole-position "Move position" control (`TransferPositionControl`).
  `listTransfers` now also returns `kind`, `destination_position_id`,
  `transferred_quantity` for display.

## (add new items below as backend features ship)
