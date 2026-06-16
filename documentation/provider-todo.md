# Provider logic overhaul — TODO & open questions

Status: **design / not started**. Captures a planned reshaping of the providers
service and its consumers. Nothing here is implemented yet; the "Open questions"
sections are the gate before any code.

## Goal (as requested)

1. Each provider carries **data-quality information per capability**.
2. **Drop the watch-set "which symbols to refresh" table** — refresh *all used
   symbols* regardless of whether positions are open or closed.
3. **Select a specific provider per capability** (quotes → providerA,
   fundamentals → providerB, …) instead of "first registered wins".
4. Add a **`symbol_search` capability that every provider must implement**.
5. The **stock exchange** stops being a property of the symbol/listing and
   becomes a property of **quotes/chart**, discovered via `symbol_search`. This
   implies a **real, updatable exchange calendar owned by the market service**.

---

## Decisions (2026-06-16)

- **Exchange calendar stays in instruments.** No move to market. The
  listing↔exchange contract is **display-only**: the frontend shows whether the
  exchange is open. Canonical exchange remains a **listing** property; the
  `symbol_search` result only *suggests* it at creation time.
- **Data quality is static and admin-information-only**, hand-assigned per
  provider (Yahoo = "meh", EODHD = "top"). Not measured at runtime, **not stored
  per quote/fundamental** — it is a live attribute of the provider, surfaced on the
  frontend (admin) to inform provider choice. It never drives routing.
- **No failover.** Deliberate: prices differ across providers and some exchanges
  (e.g. Lang & Schwarz) exist on only a few providers, so silently substituting a
  provider would corrupt data. A missing/failed provider is an error, not a
  fall-through.
- **Provider selection is per (instrument × capability), admin-editable at
  runtime** (DB-backed). Not global. This is what handles "exchange X only exists
  on a few providers" — each instrument is pointed at the provider that actually
  carries it, per capability.
- **Capabilities that share one upstream feed are bound to one selection:**
  `quotes` + `chart` (one price series) and `earnings` + `corporate_actions` +
  `news` (one bundled events feed) each move together — setting any member assigns
  the whole group. `analyst` and `fundamentals` are standalone. (2026-06-16:
  events bundled this way so the events service resolves a single provider per
  instrument.)
- **Per-(instrument × capability) selection is honored for *all* capabilities**
  (2026-06-16). market quotes/chart + analyst, the fundamentals service, and the
  events service all resolve each instrument's selected provider via
  `/internal/refresh-plan?capability=…`, fetch from that provider (passing it
  explicitly to the providers service), and tag stored data with it. No consumer
  hardcodes a provider anymore.
- **Switching the quotes/chart provider purges the full stored price history for
  that instrument and rebuilds it** from the newly selected provider, behind a
  **prominent admin warning**. Rebuild range follows the existing rule: **start =
  first acquisition (first buy) date, end = today**. A chart never mixes prices
  from two sources.
- **Multiple provider symbols per listing** are required (Yahoo bakes a non-MIC
  exchange suffix into the symbol, e.g. `SAP.DE`). **Keep the existing
  `listing_provider_identifiers` table — no JSONB blob** (see "Provider identity").
- **`symbol_search` is mandatory only for symbol-based providers.** ECB is FX-only
  and exempt — we never look up symbols on it. Providers split into two classes:
  symbol-based vs reference-data/FX.
- **"Used symbols" = every listing in the database.** The refresh set is the whole
  catalog, not a subset derived from open positions / watchlist. This means the
  `instruments.watch_interests` projection **and its entire event-driven
  machinery** (the `position.opened/closed` → `watch.activated/deactivated`
  mapping, the active filter) can be **deleted**; the refresh set becomes "all
  active listings". Refresh must be **paced per provider**: providers that allow
  batch queries are **chunked** (a per-provider max batch size; the scheduler
  already chunks at 25), and **single-symbol providers are throttled/spread** so we
  don't fire every symbol at once. Pacing + batch size are **provider metadata**.
- **Admin-editable config is DB-backed and split by ownership.** Data is placed
  where it conceptually belongs — provider-intrinsic in providers, instrument-
  coupled in instruments. The two reference each other only by **provider name (a
  string)**, never a cross-service FK, so nothing scatters.
  - **The providers service becomes stateful** (drops the "no DB" principle — see
    [config.ts](services/providers/src/config/config.ts)) and owns
    `providers.provider_settings`, one row per provider, seeded from code defaults:
    `enabled` (admin on/off toggle), `class` (symbol-based vs FX),
    `data_quality` (static grade per capability, frontend-only), and pacing:
    `max_batch_size` (null = single-symbol-only → throttle), `rate_limit_per_min`,
    `max_concurrency`. The registry still constructs adapters in code but reads
    these to filter (disabled providers excluded) and pace.
  - **Instruments keeps the instrument-coupled mappings**:
    `instruments.provider_selection` (`instrument_id`, `capability`, `provider`)
    — a property of the *instrument*, with the `quotes`=`chart` same-provider
    constraint — and the existing `listing_provider_identifiers`
    (listing → provider → symbol). These reference a provider by name only.
  - **Disabling an in-use provider:** allowed, but surface a warning naming the
    instruments/capabilities that will go dark (consistent with no-failover).
    Decide: warn-and-proceed (preferred) vs block-while-in-use.
- **Instrument ↔ listing is 1:1 for now**, but the design must not foreclose
  multiple listings per instrument later. Provider symbol is resolved **per
  provider** (and capability selects the provider), stored in
  `listing_provider_identifiers`. On the frontend, each provider-symbol field is
  **pre-filled with the instrument's base symbol** and is admin-editable (e.g.
  append `.DE` for Yahoo).

## Current state (what we're changing)

- **Routing is first-match, not selectable.** `registry.require(cap)` returns the
  first registered provider that declares `cap` ([registry.ts:37](services/providers/src/providers/registry.ts#L37)).
  Registration order (`[yahoo, ecb]`) is the only priority lever
  ([registry.ts:70](services/providers/src/providers/registry.ts#L70)). No
  fallback: a failure of the chosen provider is the request's failure.
- **`search` already exists as a capability but is optional** ([types.ts:12](services/providers/src/providers/types.ts#L12),
  [types.ts:156](services/providers/src/providers/types.ts#L156)). Yahoo implements
  it; ECB does not.
- **Refresh is active-only.** The watch set only yields listings with ≥1 *active*
  interest — `listActiveListingIds()` ([refresh-service.ts:39](services/market/src/modules/refresh/application/refresh-service.ts#L39)),
  backed by `where active = true` ([watch-repository.ts:104](services/instruments/src/modules/watch/infrastructure/watch-repository.ts#L104)).
  Closing a position flips the interest inactive via the event mapping
  ([watch-service.ts:8](services/instruments/src/modules/watch/application/watch-service.ts#L8)),
  so closed positions stop refreshing.
- **The "which symbols" table is `instruments.watch_interests`** ([schema.ts:74](services/instruments/src/platform/database/schema.ts#L74)),
  a projection fed by `portfolio.position.opened/closed` + watchlist events,
  emitting `instruments.watch.activated/deactivated` deltas consumed in-memory by
  market/fundamentals/events.
- **Exchange is on the listing today.** `instruments.listings.exchange_id`
  ([schema.ts:47](services/instruments/src/platform/database/schema.ts#L47)) →
  `instruments.exchanges` which already holds a calendar: `timezone`,
  `regular_open_local`, `regular_close_local`, `holiday_calendar` (a static JSON
  array of dates) ([schema.ts:19](services/instruments/src/platform/database/schema.ts#L19)).
  Sessions are computed **in the instruments service** ([session.ts](services/instruments/src/modules/catalog/domain/session.ts),
  served by `getListingSessions` [catalog-service.ts:113](services/instruments/src/modules/catalog/application/catalog-service.ts#L113)).
  There is `createExchange` but **no update**, and the calendar is full-day
  holidays only (no half-days / early closes / multiple sessions).
- **Per-provider symbol identity already exists** but is used single-provider:
  `instruments.listing_provider_identifiers (listing_id, provider,
  provider_identifier)` ([schema.ts:55](services/instruments/src/platform/database/schema.ts#L55)).
  The watch set resolves exactly **one** provider's identifier (the configured
  `provider`, e.g. `yahoo`) ([watch-service.ts:17](services/instruments/src/modules/watch/application/watch-service.ts#L17),
  [watch-repository.ts:93](services/instruments/src/modules/watch/infrastructure/watch-repository.ts#L93)).
- **DTOs carry no exchange.** `QuoteDto` / `ChartDto` have price/currency/timestamp
  but no exchange or MIC ([types.ts:26](services/providers/src/providers/types.ts#L26)).

---

## Workstream 1 — Data quality per capability

**Intent:** annotate each provider's capabilities with a quality descriptor.

**Direction:** extend the provider contract from a flat `Set<Capability>` to a
map `Capability → CapabilityMeta`, where meta includes at least a quality grade.
`capabilityMap()` ([registry.ts:51](services/providers/src/providers/registry.ts#L51))
and `/internal/capabilities` ([routes.ts:37](services/providers/src/http/routes.ts#L37))
expose it for diagnostics/UI.

**Open questions**
- **What is "quality"?** Static, hand-assigned grade (e.g. `authoritative` for ECB
  fx, `best-effort` for Yahoo fundamentals)? Or *measured* at runtime (success
  rate, staleness, coverage)? These are very different builds.
- **What consumes it?** Pure provenance/display (a confidence badge), or does it
  *drive* selection (auto-pick highest quality), or conflict resolution when
  merging providers? If selection is manual (Workstream 3), is quality only
  informational?
- **Shape:** single enum, a numeric score, or structured (coverage %, latency,
  freshness, accuracy)? Per capability only, or per (capability × exchange/region)
  since coverage usually varies by market?
- Does quality need to be **persisted/versioned** (for historical provenance on
  stored quotes/fundamentals), or is it a live attribute only?

---

## Workstream 2 — Refresh all used symbols, drop `watch_interests`

**Intent:** every *used* symbol refreshes regardless of open/closed; remove the
active/inactive projection table.

**Direction:** replace the event-fed `watch_interests` projection with a set
*derived* from the portfolio reference tables already mirrored in instruments
(`portfolio.positions`, `portfolio.watchlist_items` — [schema.ts:83](services/instruments/src/platform/database/schema.ts#L83)).
"Used" = listing referenced by any position (ever) or watchlist, with no `active`
filter. The market/fundamentals/events consumers keep hydrating from a snapshot;
only the *contents* change (active filter dropped).

**Open questions**
- **Define "used" precisely.** Referenced by any position (open or closed) or
  watchlist? Or *every active listing in the catalog*? Or "ever referenced" even
  after the position is deleted? This decides the data source.
- **Pruning / unbounded growth.** "Once used, always refreshed" means the refresh
  set only grows. Provider cost & rate limits scale with it. Is there *any*
  removal (listing deactivated, instrument delisted, manual purge)? Or a **tiered
  cadence** (open positions hot, closed/watchlist cold)?
- **Do we still need event-driven deltas at all?** If the set is derived on read
  from reference tables, we can drop the `instruments.watch.activated/deactivated`
  outbox events and the `opened/closed` MAPPING entirely — but consumers currently
  rely on those deltas for incremental updates. Snapshot-poll instead?
- **Why keep closed-position refresh?** Confirm the motivation (historical charts
  staying current? after-tax/realized recomputation? benchmarking?) — it changes
  whether *quotes* specifically need refreshing or just *chart history*.
- Migration: drop `watch_interests` table + the watch module, or repurpose it.

---

## Workstream 3 — Per-capability provider selection

**Intent:** explicitly map each capability to a chosen provider.

**Direction:** add a selection config (capability → provider name) consumed by the
registry; `require(cap)` resolves via the map instead of array order. Providers
config currently has no such field ([config.ts](services/providers/src/config/config.ts)).

**Open questions**
- **Where does selection live?** Static env/config in the providers service, or
  DB-backed and admin-editable at runtime? (Ties to "updatable on market service"
  theme.)
- **Granularity.** Global per-capability only (as stated), or also per
  (capability × exchange/region)? Real providers cover different markets, so a
  single global "quotes → providerA" may not hold.
- **Fallback.** Still none (selected provider fails → request fails), or do we
  finally want failover to the next-best provider (which needs `require` to
  iterate, and ties into Workstream 1 quality ordering)?
- **Provider symbol identity becomes mandatory per selected provider.** If quotes
  come from providerA and fundamentals from providerB, each listing needs a
  `provider_identifier` for *both*. Today the watch set resolves only one
  ([watch-repository.ts:93](services/instruments/src/modules/watch/infrastructure/watch-repository.ts#L93)).
  How are the per-provider identifiers discovered and stored — via `symbol_search`
  (Workstream 4) at listing-creation time? What happens when a selected provider
  has no identifier for a listing (skip that capability? error?)?

---

## Workstream 4 — Mandatory `symbol_search` capability

**Intent:** every provider implements `symbol_search`.

**Direction:** rename/standardize the existing optional `search` to `symbol_search`,
make the method non-optional on `MarketDataProvider` ([types.ts:148](services/providers/src/providers/types.ts#L148)),
and have search results carry the provider's symbol identity **plus exchange/MIC
and currency** (feeds Workstreams 3 and 5).

**Open questions**
- **ECB / FX providers can't "search symbols" meaningfully.** Is the "all
  providers must implement" rule really *all*, or only providers that offer
  symbol-based capabilities (quotes/chart/fundamentals/…)? An FX-only provider
  breaks the universal rule. Likely need a provider *class* distinction
  (symbol-based vs reference-data) — confirm.
- **Result shape.** Today `SearchResultDto` has `symbol/name/exchange/quoteType`
  ([types.ts:43](services/providers/src/providers/types.ts#L43)). To drive
  per-provider identity + exchange sourcing we likely need MIC, currency, and the
  provider's own identifier explicitly. Define the enriched contract.
- **Flow.** At listing creation, do we fan out `symbol_search` across *all enabled
  providers* to resolve each one's identifier + exchange, then persist into
  `listing_provider_identifiers`? Who triggers it and when (create-time,
  background reconciliation)?

---

## Workstream 5 — Exchange sourced from search; calendar stays in instruments

**Intent (per decisions):** the exchange is *suggested* by the `symbol_search`
result at creation time, but the **canonical exchange stays a listing property in
instruments**, and the **calendar stays in instruments**. The listing↔exchange
contract is **display-only** (frontend shows open/closed). No move to market.

**Direction:** enrich `symbol_search` results with exchange/MIC so listing creation
can pre-fill the exchange; keep `instruments.exchanges` + the session engine where
they are; add the missing exchange **update/CRUD** (only `createExchange` exists
today). `QuoteDto`/`ChartDto` do *not* need an exchange field — exchange is
resolved from the listing, not the quote.

**Open questions**
- **Ownership move is significant.** Exchanges + the session engine live in
  *instruments* today ([session.ts](services/instruments/src/modules/catalog/domain/session.ts),
  `instruments.exchanges`). Moving the *calendar* to market splits exchange
  identity (instruments) from its calendar (market) — or do we move the whole
  exchange concept? Listings still need an `exchange_id` FK somewhere. Define the
  new ownership boundary and the cross-service contract.
- **"Exchange on the quote" vs the listing FK.** If exchange comes from the quote
  provider, and quotes (providerA) and chart (providerB) are *different* providers
  (Workstream 3), they could report *different* exchanges for the same listing.
  Which wins? Is there still a single canonical exchange per listing, or per
  (listing × capability)?
- **"Real calendar" scope.** Today: timezone + open/close + full-day holiday
  list, no half-days/early-closes/multiple sessions ([session.ts:38](services/instruments/src/modules/catalog/domain/session.ts#L38)).
  Does "real" require early closes, multi-session days, per-year holiday updates?
- **Calendar data source.** Manual admin entry, a provider feed, or a calendar
  library? Who maintains holidays year over year?
- **Editing API.** `createExchange` exists but there's no update
  ([catalog-service.ts:65](services/instruments/src/modules/catalog/application/catalog-service.ts#L65)).
  Need update/CRUD for exchanges and their calendars — on which service, and behind
  what auth (admin-only)?
- **Migration of existing data.** Existing listings already carry `exchange_id`;
  how do they reconcile with search-sourced exchanges (trust existing, or
  re-derive)?

---

## Cross-cutting

- **Provider identity is the linchpin** connecting Workstreams 3, 4, 5: a listing
  needs, per enabled provider, that provider's symbol + exchange, all sourced from
  `symbol_search`. Get this model right first.
- **Downstream consumers** of the watch set and providers (fundamentals, events,
  notifications, analyst refresh) all inherit Workstream 2's semantics change and
  Workstream 3's identity-per-provider requirement.
- **Migrations:** drop `watch_interests`; add provider-selection + data-quality
  storage; exchange ownership/calendar changes; per-provider identifier backfill.
- **No-fallback today is a recurring decision point** — Workstreams 1 and 3 both
  push toward finally adding failover.

## Provider identity — table vs JSONB

The need ("multiple provider symbols per listing, e.g. Yahoo `SAP.DE`") is
**already modelled** by `instruments.listing_provider_identifiers
(listing_id, provider, provider_identifier, metadata JSONB)`
([schema.ts:55](services/instruments/src/platform/database/schema.ts#L55)) — one
row per provider, plus a `metadata` JSONB already there for provider-specific
extras. Recommendation: **keep the table** rather than collapse to a JSONB
key-value on the listing, because it keeps a real FK, allows reverse lookup
("which listing is Yahoo `SAP.DE`?") and per-provider indexing/uniqueness, and
still gives you JSONB room via `metadata`. A JSONB blob would re-implement this
less safely. (Open: do we ever need *multiple symbols for the same provider* on
one listing — e.g. Yahoo `SAP.DE` vs `SAP.F` — which would need a composite key,
not a simple per-provider map?)

## The genuinely untackled questions (decide before coding)

Resolved: data-quality (static, admin-info only); no failover; selection per
(instrument × capability), runtime-editable; quotes+chart bound as a pair;
quotes/chart provider switch = full price-history purge + rebuild (first
acquisition → today) behind a warning; provider identity = keep the table,
per-provider, frontend pre-fills the instrument symbol; `symbol_search` mandatory
for symbol-based providers only (ECB exempt); refresh set = **all listings** with
per-provider pacing/chunking and the `watch_interests` machinery deleted;
instrument↔listing 1:1 for now (don't foreclose multi-listing); calendar stays in
instruments (display-only).

**Backend gaps blocking P4 — all landed (2026-06-16):** the frontend rework can now
be done in one pass.

1. ✅ **Admin read + write for provider settings.** Providers service gained auth +
   gateway-exposed `GET /admin/providers` + `PATCH /admin/providers/:provider`
   (`system:admin`); gateway has a `/admin/providers` → providers route + the new
   `providers` upstream. Settings are now read live from the DB (repo), so pacing/
   quality/enabled edits reach the market scheduler without a restart (routing-level
   enable/disable still applies on restart — noted).
2. ✅ **Gateway/admin exposure for the quotes purge+rebuild.** Market gained
   gateway-exposed `POST /quotes/rebuild` (`system:admin`, `confirm` required); the
   web supplies `from` = first-acquisition date.
3. ✅ **"Instruments selecting provider X" lookup.** Instruments gained
   gateway-exposed `GET /instruments/provider-usage?provider=` (`instruments:read`).

**Follow-up:**

4. ✅ **Done (2026-06-16).** Fundamentals + events migrated off the watch set onto
   the all-listings sweep (new `InstrumentsListingsClient` → `/internal/listings/all`
   in each). The instruments **watch module, the portfolio-interest consumer, and
   `/internal/watch-set` were removed**, and migration `020` drops
   `instruments.watch_interests`. (The portfolio service still emits
   position/watchlist events — now consumed only by notifications' own interest
   projection, not by instruments.)

**Open design questions (unchanged):**

5. **Per-provider pacing parameters.** What metadata does each provider declare —
   max batch size (or single-symbol-only), requests/minute, concurrency — and does
   the scheduler spread a full-catalog sweep over the refresh interval, or fire
   chunks back-to-back? (`rate_limit_per_min` is stored but not yet enforced as an
   inter-request delay.)
6. **Calendar richness (low priority).** Stay at full-day holidays only, or grow
   to half-days / multi-session, and where does holiday data come from (manual
   admin entry vs provider vs library)?

Watch items (not blocking, keep an eye out): the **multi-listing-per-instrument**
path (we ship 1:1 but must not brick it); and the per-provider symbol resolution
flow at instrument creation (fan-out `symbol_search` vs pre-fill + manual).

---

## Implementation packages & sequencing

Sliced per service in dependency order. Each package is independently shippable;
later packages depend on the contracts the earlier ones establish. The spine is:
**providers contract → instruments mappings → market scheduler → web admin.**

### P1 — Providers service (the new contract; everything depends on this)

**Status (2026-06-16): largely landed.** Done: migration `018` (`providers`
schema + `provider_settings`, seeded yahoo/ecb); providers service is now stateful
(DB + readiness gate); registry loads settings from the DB, excludes disabled
providers, and enforces the `symbol`-class → `symbol_search` contract at startup;
capability `search`→`symbol_search`; `SearchResultDto` enriched with
`mic`/`currency`/provider `symbol`; `GET /internal/providers` exposes settings.
**Deferred within P1:** removing `require()` in favor of an explicit
caller-supplied provider is held until P2/P3 wire the per-instrument selection —
removing it now would strand the market service with no selection source. For now
`require()` remains but only considers *enabled* providers.

The providers service **becomes stateful**. Land this first because the capability
shape, provider-class split, and settings model are what P2–P4 consume.

- Add a DB to the service: `DATABASE_URL` config, a `providers.*` schema, and a
  migration creating `providers.provider_settings` (`provider`, `enabled`,
  `class`, `data_quality` per capability, `max_batch_size`, `rate_limit_per_min`,
  `max_concurrency`). Seed Yahoo + ECB with sensible defaults so first boot
  preserves today's behavior. Update [config.ts](services/providers/src/config/config.ts)
  (drop the "stateless / no DB" note).
- Refactor the registry ([registry.ts](services/providers/src/providers/registry.ts)):
  still construct adapters in code, but load `enabled`/pacing/quality from the DB;
  exclude disabled providers; `require()` is **removed/replaced** by explicit
  selection passed in by the caller (the route no longer auto-picks first-match).
- Standardize `search` → **`symbol_search`**, make it non-optional for
  **symbol-based** providers, and add the `class` distinction so ECB (FX) is
  exempt ([types.ts](services/providers/src/providers/types.ts)).
- Enrich `SearchResultDto` with **MIC/exchange + currency + provider identifier**.
- Expose settings + capability/quality map via `/internal/*` for the web admin and
  for consumers resolving pacing.
- **Contract out:** capability list incl. `symbol_search`; provider classes;
  per-provider pacing/quality; routes take an explicit provider, no first-match.

### P2 — Instruments service (instrument-coupled mappings; drop the watch machinery)

**Status (2026-06-16): additive parts landed.** Done: migration `019`
(`instruments.provider_selection` + backfill = yahoo for all selectable
capabilities on every existing instrument); new `selection` module (service +
repo + routes + unit tests) enforcing the `quotes`=`chart` pairing and
selectable-capability validation; `GET`/`PUT /instruments/:id/providers`;
internal `GET /internal/refresh-plan?capability=` (listings resolved to provider +
provider symbol) and `GET /internal/listings/all` (full active-catalog sweep);
exchange `PATCH /exchanges/:id` (name/timezone/session/holidays). **Deferred to the
P3 cutover:** deleting `watch_interests` + the watch event machinery — the running
market service still consumes `/internal/watch-set` and the `instruments.watch.*`
deltas, so the table/module stay until P3 stops reading them (matches the
cross-package migration order below).

- Migration: create `instruments.provider_selection` (`instrument_id`,
  `capability`, `provider`) with the `quotes`=`chart` same-provider constraint.
- **Delete `watch_interests` and its event machinery**: the
  `position.opened/closed` → `watch.activated/deactivated` mapping
  ([watch-service.ts](services/instruments/src/modules/watch/application/watch-service.ts)),
  the active filter ([watch-repository.ts](services/instruments/src/modules/watch/infrastructure/watch-repository.ts)),
  and the outbox deltas. Replace with **"all active listings"** exposure for the
  refresh sweep.
- Per-provider symbol resolution: keep `listing_provider_identifiers`; provide an
  endpoint to resolve "for instrument X capability C → provider + provider symbol".
- Add exchange **update/CRUD** ([catalog-service.ts:65](services/instruments/src/modules/catalog/application/catalog-service.ts#L65)
  only has create); pre-fill exchange from the enriched `symbol_search`.
- **Contract out:** "all listings" feed; per-(instrument × capability) provider +
  symbol resolution; exchange CRUD.

### P3 — Market service (refresh scheduler rework + purge/rebuild)

**Status (2026-06-16): landed.** Done: providers `/internal/quotes` + `/internal/chart`
accept an explicit `provider` (validated against enabled providers + capability;
falls back to first-match) — this is the deferred P1 routing piece, done now that
P3 consumes it. Market `QuoteProvider`/`ProvidersClient` are provider-parameterized;
the `QuoteService` tags every stored quote with the provider it came from. The
refresh cycle now sweeps the **whole active catalog** via the instruments
`/internal/refresh-plan?capability=quotes` (no watch set), groups listings by their
selected quotes provider, fetches in batches sized to each provider's
`max_batch_size` (null ⇒ single-symbol, batch size 1 — sequential chunks throttle
it), and records the actual provider. New `InstrumentsRefreshPlanClient` +
`ProvidersClient.fetchProviderSettings`. Purge+rebuild: `repo.purgeListings` +
`POST /internal/quotes/rebuild` (requires `confirm`, rebuilds `[from, today]`).
Unit tests added for the grouping/pacing. **Deviation from the plan below:**
`watch_interests` is **not** dropped — fundamentals and events still consume the
watch set, so it stays until they also migrate to the all-listings sweep (a
follow-up). P3 only removed *market's* watch-set consumption. Pacing currently =
per-provider batch size + sequential chunks; `rate_limit_per_min` is carried in
settings but not yet enforced as an inter-request delay (refinement).

- Rework the refresh scheduler ([refresh-service.ts](services/market/src/modules/refresh/application/refresh-service.ts)):
  sweep **all listings**, **group by each listing's selected quotes provider**
  (not the hardcoded `'yahoo'` at [refresh-service.ts:44](services/market/src/modules/refresh/application/refresh-service.ts#L44)),
  **chunk per provider's `max_batch_size`**, and **throttle single-symbol
  providers** so a full-catalog sweep spreads across the interval rather than
  firing at once. Record the *actual* provider in refresh state.
- Route each capability fetch through the **selected** provider (resolved from P2),
  using that provider's symbol — no more single global provider.
- **Quotes/chart provider switch → purge + rebuild**: on selection change, delete
  the instrument's stored price history and rebuild it via the new provider's
  `chart` over **first-acquisition → today**. Guard with a confirmation flag.
- **Contract out:** none downstream; this is a consumer of P1/P2.

### P4 — Web (admin surfaces)

**Status (2026-06-16): backend fully ready; UI work recorded in
`documentation/frontend-todo.md`** ("Provider configuration & selection (admin)").
All backend gaps are now closed, so the frontend rework can be done in one pass —
no further backend round-trips expected. Gateway-exposed endpoints the UI consumes:
`GET`/`PUT /instruments/:id/providers`, `GET /instruments/provider-usage`,
`PATCH /exchanges/:id`, `GET /admin/providers` + `PATCH /admin/providers/:provider`
(`system:admin`), and `POST /quotes/rebuild` (`system:admin`, `confirm`).

- Admin provider screen: enable/disable toggle, pacing + quality fields
  (quality shown read-only as info), per-provider settings.
- Per-instrument provider **selection** UI (capability → provider), with the
  provider-symbol fields **pre-filled with the instrument symbol** and editable.
- **Prominent warning** on a quotes/chart provider switch (history purge/rebuild)
  and on disabling an in-use provider (lists affected instruments).
- Keep the existing exchange open/closed display; add exchange edit if desired.

### Cross-package migration order

1. P1 migration + seed (providers DB) — behavior-preserving. ✅
2. P2 migration: add `provider_selection` (backfill = yahoo for every instrument).
   ✅ — note `watch_interests` is **not** dropped here.
3. P3 deploy reads selection/pacing; the market scheduler is flipped over to the
   all-catalog sweep and stops consuming the watch set. ✅
4. ✅ Fundamentals + events migrated off the watch set; watch module +
   `/internal/watch-set` removed; migration `020` drops `watch_interests`.
5. P4 ships the admin UI last (the backend already enforces the rules).
