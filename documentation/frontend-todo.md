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

## Benchmark catalog quick-pick
- [ ] **Offer the curated catalog in the benchmark pickers.** `GET /benchmarks`
  returns `[{ key, name, region, listing_id, instrument_id, symbol, currency }]`
  (MSCI World, S&P 500, NASDAQ-100, DAX). In `PortfolioBenchmarkSettings` (and the
  combined-benchmark setter) show these as one-click chips that set the benchmark
  to the entry's `listing_id`, keeping the free-text instrument search as the
  fallback for benchmarks outside the catalog. Index listings are non-holdable —
  the position "add" flow should hide/disable `asset_type: "index"` results
  (backend already rejects them with `index_not_holdable`).

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

## Portfolio pulse (intelligence)
- [x] **Render the explainable portfolio pulse.** `GET /reporting/intelligence?portfolio_id=&period=`
  returns a versioned health score: `{ version, score (0–100 | null), status
  (strong|balanced|fragile|at_risk|insufficient_data), confidence (0–1),
  primary_driver (structure|risk|data_quality|null), components{ structure{score,
  weight,top1_pct,top3_pct,hhi}, risk{score,weight}, data_quality{score,weight,
  priced_value_pct,fresh_value_pct,ledger_valid} } }`. UI: a pulse card (gauge/
  badge by status + score), the primary-driver headline, an expandable component
  breakdown, and a confidence indicator. Handle `score: null` /
  `insufficient_data` (show why — no holdings / not enough history). Combined view
  aggregates concentration across portfolios. Period selector reuses the existing
  performance periods.

## Dashboard notifications
- [x] **Add a compact notifications card to the dashboard intelligence rail.**
  Show a small selection of open/unread notifications from `GET /notifications`
  and link a "More" action to the full `/notifications` page. In a selected
  single-portfolio view, prefer notifications whose `listing_id` belongs to a
  position in that portfolio; the combined view may show notifications across all
  holdings.
- [ ] **Later: mark holdings with open notifications.** Show a subtle warning
  indicator, such as a yellow warning triangle, beside a holding when it has one
  or more open/unread notifications associated through `listing_id`. The
  indicator should link to or reveal the relevant notifications and must not
  imply that every notification is critical.

## Provider configuration & selection (admin) — P4 of provider-todo.md

Backend context: providers service now owns admin-editable provider settings
(migration 018) and instruments owns per-(instrument × capability) provider
selection (migration 019). See `documentation/provider-todo.md`.

- [ ] **Per-instrument provider selection UI.** Backend ready & gateway-exposed:
  `GET /instruments/:id/providers` → `[{ capability, provider }]` and
  `PUT /instruments/:id/providers` `{ capability, provider }` → updated full
  selection list (scopes `instruments:read`/`write`). UI on the instrument/admin
  detail should render provider dropdowns by selection group: **price series**
  (`quotes` + `chart`, one control), **events feed** (`earnings` +
  `corporate_actions` + `news`, one control), plus standalone `analyst` and
  `fundamentals`. The server writes all members of a group when any member is set.
  Provider symbols are per listing/provider and are set via the existing
  `PATCH /listings/:id` `provider_identifiers[]` upsert; **pre-fill missing
  provider symbols with the instrument/listing base symbol** and let the admin
  correct them (e.g. `SAP.DE`).
- [ ] **Quotes/chart provider switch → purge + rebuild, with a prominent warning.**
  When the admin changes the quotes/chart provider, warn loudly that the stored
  price history will be **purged and rebuilt** from the new provider, then trigger
  `POST /quotes/rebuild` `{ listing_ids[], from?, confirm: true }` (gateway-exposed,
  `system:admin`; rebuild range = `from` → today). Backend ready. The UI should
  supply `from` = the instrument's first-acquisition date when available, and all
  active `listing_ids` for the instrument; `confirm: true` is required. If the
  admin surface cannot derive the first-acquisition date yet, call that out in the
  UI implementation plan rather than silently using the backend's short default
  rebuild window.
- [ ] **Provider admin screen (enable/disable, pacing, data-quality).** Backend
  ready & gateway-exposed (`system:admin`): `GET /admin/providers` →
  `{ providers: [{ provider, enabled, providerClass, dataQuality, maxBatchSize,
  rateLimitPerMin, maxConcurrency, capabilityQuality }] }` and
  `PATCH /admin/providers/:provider`
  `{ enabled?, data_quality?, max_batch_size?, rate_limit_per_min?, max_concurrency? }`
  (class is intrinsic, not editable). Show the enabled toggle, class, admin-assigned
  data-quality grade, per-capability quality map, and pacing fields; surface the
  grade as a provenance badge where provider-sourced data is shown. Note:
  pacing/quality edits take effect live; a routing-level enable/disable currently
  applies on service restart.
- [ ] **Disable-in-use warning.** Backend ready & gateway-exposed:
  `GET /instruments/provider-usage?provider=X` (`instruments:read`) →
  `[{ instrument_id, instrument_name, capability }]`. Before disabling a provider
  (via the admin screen above), call this and warn, listing the affected
  instruments/capabilities (no failover by design — those go dark until reassigned).
- [ ] **Exchange calendar editor.** Backend ready & gateway-exposed:
  `PATCH /exchanges/:id` `{ name?, timezone?, regular_open_local?,
  regular_close_local?, holidays? }`. UI on an exchange admin view to edit the
  trading session + full-closure holiday dates. The existing open/closed session
  display (`GET /listings/sessions`) already consumes this calendar.

## (add new items below as backend features ship)
