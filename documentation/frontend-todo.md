# Frontend TODO

Frontend-only work, deferred out of the current backend-focused work stream.
Backend features land first (with their contracts); the matching UI is captured
here so nothing is lost. Each item notes the backend it depends on.

> Convention: when a backend change ships an endpoint or shape the UI should
> surface, add a checkbox item here instead of editing web/ in the backend work.

## Benchmark comparison UI
- [ ] **Re-integrate or remove the benchmark panel.** `BenchmarkPanel.tsx` and
  `app/reports/benchmark-actions.ts` were committed (4d7f556) but the reports
  page wiring was reverted, so they are currently **dead code**. Decide: re-wire
  into `/reports` (single-portfolio) or delete the two files.
  Backend ready: `GET /reporting/benchmark`, `PUT /portfolios/:id/benchmark`.
- [ ] **Resolve the saved benchmark's display name on load.** Today only a
  this-session pick shows a friendly label; a fresh load shows the truncated
  listing id. Needs a listing-by-id name lookup (see backend todo for a possible
  `/listings/:id` name field or batch resolve).

## Activity feed — new kinds
- [ ] **Render `corporate_action` and `transfer` activity items.** `GET /activity`
  now unions applied corporate actions and position transfers (kinds
  `corporate_action`, `transfer`). The web `ActivityFeed` needs: filter chips for
  the two new kinds; row rendering where `amount`/`currency` are **null** (no
  money) — for `corporate_action` show the ratio from `quantity:price` and the
  `split`/`reverse_split` subtype, plus a "reversed" badge when `direction ===
  "reversed"`; for `transfer` show a move between portfolios. Backend shipped.

## (add new items below as backend features ship)
