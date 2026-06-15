# Open Decisions

This document tracks unresolved product and architecture decisions for the
Portfolio Intelligence Platform. Decisions recorded here must not be chosen
implicitly by an implementer.

When a decision is made:
1. Update the relevant section of `prompt.md`.
2. Update migrations, seeds, contracts, and tests affected by the decision.
3. Move the item to the resolved-decisions section at the end of this document.

---

## 1. Portfolio Accounting Method

### Already Decided
- Supported methods are FIFO, LIFO, and average cost.
- The accounting method is configured per user and applies to that user's
  positions and transactions.
- The user may change the accounting method at any time.
- All sell transactions remain stored, allowing historical calculations to be
  reproduced.
- Changing the method triggers a complete recalculation of historical realized
  P&L and the remaining open cost basis.
- A sell cannot exceed the currently owned quantity.
- Short selling and derivatives are out of scope.
- The selected method determines which buy lots are consumed by a sell.

### Affects
Portfolio domain model, transaction validation, realized P&L, APIs, UI
settings, migrations, and accounting tests.

---

## 2. Performance Metrics

### Questions
- None.

### Already Decided
- All proposed performance metrics are valid and should be available.
- Core values are current value, invested capital/open cost basis, realized
  P&L, unrealized P&L, dividends, fees, total P&L, and daily change.
- Return metrics are simple return, total return, money-weighted return/XIRR,
  time-weighted return, annualized return/CAGR, and income return.
- Income views are yield on cost, trailing-twelve-month dividend yield, and
  annual dividend income.
- Risk and comparison metrics are benchmark-relative return, volatility,
  maximum drawdown, Sharpe ratio, best/worst day or month, and closed-position
  win rate.
- Core values, simple return, total return, and XIRR are required initially;
  the remaining metrics may be delivered incrementally.
- Each metric must be clearly labeled with its meaning, period, calculation
  basis, and whether it is annualized.
- Users can select a preferred headline metric, but all underlying values
  remain visible.
- The preferred headline metric is configured per portfolio.
- The combined all-portfolios view uses a separate preferred headline metric
  configured per user.
- Total-return percentage uses total contributed capital as its denominator:
  `(current value + gross sell proceeds + dividends - total contributed
  capital - fees) / total contributed capital`.
- Total contributed capital is gross purchase consideration excluding fees;
  fees are subtracted exactly once as a separate term.
- Initial benchmarks are MSCI World, S&P 500, DAX, and NASDAQ-100.
- Initial comparison periods are YTD, 1Y, 3Y, 5Y, since inception, and custom.
- Benchmark and comparison-period options must remain extensible.
- Each portfolio may define an optional preferred benchmark.
- The combined all-portfolios view uses a separate preferred benchmark
  configured per user and never derives or blends portfolio benchmarks.
- The Sharpe ratio uses €STR as the initial default risk-free rate, with a
  configurable source for future reporting currencies and preferences.
- Dividends are displayed separately from realized and unrealized P&L.
- Closed positions continue to contribute realized P&L and dividends to
  historical performance.

### Affects
Portfolio calculations, reporting APIs, dashboard cards, charts, and tests.

---

## 3. Multiple Portfolios And Combined Views

### Already Decided
- A user may own multiple portfolios.
- Users manually create their first portfolio; no default portfolio is created
  automatically.
- If no portfolio exists, the portfolio section displays a portfolio-creation
  form.
- Users can manually order portfolios.
- Portfolios can be archived, unarchived, or permanently deleted.
- Permanent portfolio deletion cascades to all contained positions and
  transactions.
- Permanent deletion requires a clear destructive-action warning and explicit
  user confirmation.
- Archived portfolios are inaccessible for normal portfolio use and excluded
  from all combined metrics, asset cards, allocation views, and performance
  calculations.
- Archived portfolios display an archived badge in portfolio management and
  can be unarchived.
- Every position belongs to exactly one portfolio.
- The same security may be held in multiple portfolios owned by the same user.
- There is one logical position per listing within each portfolio.
- Only active/open positions can be moved between the user's portfolios.
- A position moves as a whole together with all of its transactions;
  individual transactions cannot be moved independently.
- Moves trigger validation and recalculation of affected portfolio metrics.
- A position can only be sold from the portfolio in which it currently exists.
- The default portfolio-section view combines metrics and assets from all of
  the user's portfolios.
- Selecting a portfolio filters all displayed metrics and assets.
- In the combined view, holdings of the same security are aggregated into one
  asset card.
- Aggregated asset cards display every contributing portfolio as a badge.
- Positions and transactions are entered manually initially; CSV and JSON
  imports are planned extension points.

### Affects
Portfolio domain model, position uniqueness, APIs, migrations, seeds,
performance aggregation, dashboard navigation, cards, and tests.

---

## 4. Currency Conversion

### Already Decided
- Preserve original transaction and market currencies.
- Portfolio totals are displayed in the user's configured reporting currency.
- Current values use available market and FX data.
- Historical realized P&L and dividends use the official daily FX rate for
  their tax-relevant value date.
- Transactions and cash flows preserve an explicit tax-relevant value date.
- For trades, the tax-relevant date normally defaults to the settlement/value
  date.
- For dividends, the tax-relevant date normally defaults to the payment/value
  date.
- A broker-provided tax-relevant date takes precedence because the applicable
  date may differ by broker or jurisdiction.
- Market owns official daily FX rates and obtains missing required rates from
  an official source.
- The initial official FX source is the European Central Bank (ECB) reference
  rates.
- If the ECB publishes no rate for the tax-relevant date, use the most recent
  previously available ECB rate. This normally means Friday's rate for a
  weekend and the preceding publication day's rate for a public holiday.
- Separate FX-effect analysis is out of scope.

### Affects
Portfolio accounting, market FX history, transaction input, reporting, and
seed data.

---

## 5. Instruments And Exchange Listings

### Model
```text
Instrument
  -> Listing (symbol, exchange, currency, timezone, trading session)
  -> Listing

Position -> purchased Listing
```

### Already Decided
- The domain distinguishes an underlying instrument from exchange-specific
  listings and exchanges.
- Positions and quotes reference the exact purchased/traded listing.
- Listings belong to an instrument and carry symbol, exchange/venue, currency,
  provider identifiers, and active state.
- Exchanges use ISO 10383 MIC identifiers and own timezone, regular trading
  session, and holiday-calendar metadata.
- Fundamentals, earnings, corporate actions, and general company news normally
  reference the underlying instrument.
- Each instrument may define a primary listing to assist provider resolution;
  it does not control another listing's position price.
- Combined portfolio views may aggregate by instrument while accounting,
  pricing, and listing detail remain listing-specific.
- For crypto, a listing represents a tradable market pair on a venue.
- Daily-change calculations follow the timezone and trading session of the
  exchange on which the instrument was bought.
- Instruments owns shared security/instrument master data.

### Affects
Instruments, portfolio, market, fundamentals, events, schemas, provider symbol
mapping, and UI.

---

## 6. Redis Streams Availability

### Already Decided
- Redis Streams is the default event bus.
- Event consumers must be idempotent.
- Redis is a required dependency.
- Services that depend on Redis fail startup with a clear `Redis unavailable`
  error when connectivity checks fail.
- The frontend never connects to or queries Redis Streams directly; it queries
  service HTTP APIs.
- User-visible domain events and notifications are persisted in the owning
  service's PostgreSQL tables and exposed through service APIs.
- Redis Streams messages coordinate backend processing and are not the sole
  durable record of business facts.
- The default Redis deployment enables AOF persistence and uses a persistent
  volume so normal Redis/container restarts preserve streams.
- Stream messages may be retained only as long as operationally needed after
  consumers process them; durable business state remains in PostgreSQL.
- Integration events required for cross-service correctness must use a
  transactional outbox.
- The producing service writes business state and its outbox record in the same
  PostgreSQL transaction.
- Each producing service owns its outbox table and lightweight publisher
  worker; there is no dedicated outbox service.
- Outbox delivery is at least once, so consumers must be idempotent.
- Outboxes are not required for disposable cache invalidation, health events,
  metrics, or logs.
- Each consuming service/use case owns a consumer group.
- Consumers manually acknowledge entries only after successful processing and
  claim stale pending entries left by crashed consumers.
- Transient errors use non-blocking retries with exponential backoff and
  jitter. The default maximum is five attempts; retry limits and maximum retry
  age are configurable.
- Permanent errors such as invalid schemas, unsupported event versions, and
  malformed payloads bypass retries and go directly to a dead-letter stream.
- Retry streams prevent a poison event from blocking later entries.
- DLQ entries preserve the exact original payload and append sanitized Redis
  error context: original stream and entry ID, consumer group and consumer,
  attempt count, classification, error details, and failure timestamp.
- DLQs are separated by source stream/service and error classification.
- Default source-stream retention is seven days.
- Default DLQ retention is thirty days, must remain longer than source-stream
  retention, and is configurable.
- DLQ depth, retry volume, pending-entry age, and exhausted retries are
  monitored and alertable.
- Every event has a stable event ID for deduplication.
- Aggregate-changing events include aggregate ID and monotonically increasing
  aggregate version so consumers reject duplicate and stale/out-of-order
  updates.

### Affects
Service availability, outbox implementation, deployment health checks,
observability, and integration tests.

---

## 7. Cross-Service Contracts

### Already Decided
- HTTP APIs use header-based versioning rather than URL path versioning.
- The version header is `X-API-Version` and contains an integer major version.
- Missing headers default to the current stable version during early
  development. Configurable strict mode rejects missing headers when external
  clients consume the API.
- Unsupported versions return `406 Not Acceptable`; responses include the
  resolved `X-API-Version`.
- Error responses use RFC 9457-style Problem Details JSON with content type
  `application/problem+json`.
- Required error fields are `type`, `title`, `status`, `code`, and
  `request_id`. Optional fields are `detail`, `instance`, and `errors`.
- Validation error entries contain `field`, `code`, and `message`.
- Stable machine-readable error codes are required; internal implementation
  details are never exposed.
- Operations that modify server state, transfer funds, or trigger actions with
  real-world consequences require idempotency keys.
- Synchronous service calls use short configurable timeouts within one to five
  seconds.
- Synchronous retries are limited to one to three delay-bounded attempts.
- Requests are retried only when definitively safe to repeat: read-only
  operations or state-changing operations protected by an idempotency key.
- Public versus internal-only endpoint exposure is decided per use case and
  documented in each service contract.
- Every endpoint contract declares public/internal exposure and user/admin/
  service authentication.
- Frontend-required APIs, authentication flows, user commands, and user-visible
  reads are public. Ingestion, schedulers, outbox, retry/DLQ administration,
  reconciliation, internal callbacks, metrics, and readiness are internal by
  default.
- Redis entries store one JSON event envelope.
- Required event-envelope fields are `event_id`, `event_type`, `event_version`,
  `occurred_at`, `producer`, `aggregate`, `correlation_id`, and `payload`.
- Optional event-envelope fields are `user_id`, `actor`, and `causation_id`.
- Event names are immutable and event versions are integers.
- Additive optional event fields are backward compatible. Removed/renamed
  fields, changed types, and changed semantics require a new version.
- Consumers explicitly declare supported event versions; unsupported versions
  go directly to the DLQ.
- Breaking event changes use a compatibility window: deploy dual-version
  consumers first, then publish the new version, optionally dual-publish, and
  remove the old version only after consumers migrate.
- Event schemas live in a shared contracts package and consumer contract tests
  run in CI.

### Affects
All services, gateway, frontend composition, generated clients, observability,
and contract tests.

---

## 8. Identity And Authorization

### Already Decided
- Authentication is the central internal token authority.
- Downstream services validate internal tokens using authentication's JWKS.
- One application instance supports one or more users without a tenant layer.
- Personal use is the same application with only one user account.
- Access tokens are internal JWTs with a default lifetime of fifteen minutes.
- Required user-token claims are `sub`, `role`, `scopes`, `sid`, `iss`, `aud`,
  `iat`, `exp`, and `jti`.
- Roles are `user` and `admin`.
- Initial scopes cover profile, portfolio, instruments, market, fundamentals,
  events, insights, users, and system administration as specified in
  `prompt.md`.
- Every service enforces both scopes and user resource ownership.
- Admins manage application accounts and settings but do not automatically
  access another user's portfolios.
- User onboarding is invitation-only by default; public registration is
  disabled.
- Invitations are time-limited and single-use and contain email, role, expiry,
  and a hashed token.
- Admins can manage invitations, user activation, roles, sessions, and
  application settings.
- The final active admin cannot be disabled, deleted, or demoted.
- User isolation uses mandatory application-level ownership checks on
  user-owned data. PostgreSQL RLS is optional later defense-in-depth.
- Each browser/device owns a revocable session.
- Access tokens default to fifteen minutes; opaque refresh tokens default to
  thirty days and are stored only as hashes.
- Refresh tokens rotate on every use; reuse detection revokes the affected
  session.
- Logout revokes the current session. Password changes, successful resets, and
  disabled users revoke all sessions.
- Refresh-token cookies use `HttpOnly`, `Secure`, and `SameSite=Lax` by
  default.
- Local password-reset tokens are high-entropy, single-use, hashed, expire
  after thirty to sixty minutes, and use non-enumerating rate-limited flows.
- Password reset uses a pluggable notification adapter with an admin/CLI
  fallback for personal deployments.
- First-start HTTP setup requires a rate-limited one-time bootstrap token and
  is permanently disabled after initialization; CLI bootstrap remains
  available.
- User-initiated calls propagate user/delegated tokens. Background workers use
  narrowly scoped service tokens and cannot impersonate users without explicit
  delegation.

### Affects
Authentication, gateway, every service's authorization layer, database
policies, and security tests.

---

## 9. Market Data And Providers

### Questions
- None.

### Already Decided
- Providers are encapsulated behind adapters.
- Delayed data is acceptable.
- Only held or watched instruments are actively refreshed.
- V1 uses Yahoo Finance for stock and crypto discovery, quotes, and price
  history, and ECB reference rates for official daily FX rates.
- Yahoo Finance is treated as a replaceable, unofficial integration. Its
  availability, terms, and response formats must be verified during
  implementation, and failures must not leak Yahoo-specific concepts into the
  domain model.
- V2 plans provider adapters for CoinGecko, Alpha Vantage, Finnhub, Financial
  Modeling Prep, and FRED. Their exact capabilities and precedence remain
  configurable and must be verified against their terms, pricing, and limits
  when implemented.
- Default stock refresh intervals are 15 minutes for held listings and 30
  minutes for watched listings while their exchange is open, plus one
  post-close refresh. Crypto uses the same held/watched intervals continuously.
- Historical prices are reconciled nightly. ECB rates refresh daily after
  publication and on demand when a required rate is missing.
- Refresh intervals are globally configurable and requests are deduplicated by
  listing/provider capability across users.
- Normalized quote responses include provider and retrieval timestamps plus
  `fresh`, `stale`, or `unavailable` status. Stale data remains usable and is
  visibly marked.
- V1 has no automatic quote-provider fallback. Provider failure retains the
  last known normalized value and marks it stale.
- Provider identifiers are explicit listing mappings. Search results require
  user confirmation of listing, exchange, and currency.
- V2 provider priority and fallback are configured per capability. Conflicting
  provider values are never silently merged.
- User-owned manual valuations are stored separately and never overwrite
  provider records. Their use as the active valuation source is explicit and
  visibly marked.
- Daily closing prices, latest normalized quotes, and ECB FX rates are retained
  indefinitely. Intraday quotes and refresh metadata default to 90 days,
  successful raw payload retention defaults to disabled or 7 days when enabled,
  and failed/unparseable payloads default to 30 days. Retention is configurable
  and subject to provider licensing.
- Provider failures use bounded exponential-backoff retries and circuit
  breakers. Portfolio reads always use stored normalized data and never depend
  synchronously on external providers.

### Affects
Market, fundamentals, events, insights, provider contracts, scheduling, cache,
and operations.

---

## 10. Watchlist Ownership

### Questions
- None.

### Already Decided
- Portfolio owns user watchlists and their persistence. Watchlists are
  user-level interests and are not owned by insights.
- Portfolio publishes durable listing-interest changes through its
  transactional outbox to Redis Streams whenever a watchlist item is
  added/removed or a position starts/stops requiring market data.
- Each interest event contains a stable interest ID, listing ID, interest type
  (`open_position` or `watchlist`), active state, and aggregate version so
  market can process it idempotently and reject stale updates.
- Market consumes interest events into its own materialized refresh-interest
  projection. It does not query portfolio storage or Redis at refresh time.
- Market consolidates all active position and watchlist interests into one
  unique listing set. A listing remains active while at least one interest
  exists.
- Refresh work is deduplicated by provider, capability, and provider listing
  identifier. Market batches multiple listings into one provider request where
  supported and chunks requests according to provider limits.
- Portfolio exposes an internal reconciliation snapshot/API so market can
  rebuild or repair its interest projection after data loss or detected drift.

### Affects
Portfolio, market refresh scheduling, Redis event contracts, reconciliation,
and table ownership.

---

## 11. Editing And Deleting Transactions

### Questions
- None.

### Already Decided
- Users may correct or delete their own transactions.
- An immutable audit trail for ordinary transaction edits is not required.
- New sell commands cannot exceed the currently owned quantity. Historical
  edits may create an invalid ledger that must be repaired.
- Editing or deleting any transaction triggers validation of the complete
  position ledger, including active corporate-action applications, and, when
  valid, a complete position recalculation.
- An edit or deletion that makes later transactions invalid is accepted, but
  the position is marked invalid and no recalculation is performed.
- Invalid positions display a prominent error indicator, such as an
  exclamation badge. Derived recalculations remain paused until the user fixes
  the position ledger.
- Transaction edits and deletions provide an undo action. The previous
  transaction snapshot exists only in browser/session state and is not
  persisted as a backend audit record.
- Undo is unavailable after the relevant browser/session data is cleared. An
  undo request restores the snapshot through normal portfolio validation and
  may fail if subsequent changes make restoration invalid.
- Position state is derived entirely from the ordered position ledger,
  consisting of transactions and active corporate-action applications, and
  cannot be set manually: positive remaining quantity is open, zero is closed,
  a new buy after closure reopens the position, and an inconsistent ledger is
  invalid.
- When a position is invalid, aggregate portfolio metrics retain the position's
  last valid calculated values until the position ledger is fixed and a
  successful recalculation replaces them.

### Affects
Portfolio commands, recalculation logic, validation, UI, and tests.

---

## 12. Split Application Payload

### Questions
- None.

### Already Decided
- Events stores and displays the corporate-action fact.
- The user explicitly applies a split through the frontend.
- Events does not call portfolio or execute the change.
- Split application is idempotent and reversible.
- Events returns the displayed immutable corporate-action version together with
  a short-lived signed application token. The frontend sends that token,
  position ID, and user-selected fractional-share handling to portfolio.
- The signed token contains the corporate-action ID/version, instrument ID,
  action type, effective date, split ratio, source, and expiration. Portfolio
  verifies the events-service signature and applies the exact confirmed
  version without calling events synchronously.
- Corporate-action versions are immutable. Corrections create a new version;
  expired tokens require reloading, and the frontend warns when a newer version
  exists.
- The application record preserves the complete signed action snapshot,
  position/action IDs and version, applied ratio/effective date, fractional
  handling, affected lot IDs, exact before/after lot values, actor, applied
  timestamp, and token signature/hash.
- Direct reversal restores the exact previous lots only when no later
  transaction or corporate-action application affects the position. Otherwise
  reversal is rejected with the blocking changes identified.
- An active-application unique constraint prevents applying the same corporate
  action to the same position more than once concurrently while preserving
  reversed records. A corrected version can be applied only after the previous
  application is reversed.

### Affects
Events API, frontend, portfolio command contract, application records, and
tests.

---

## 13. Operational Requirements

### Questions
- None.

### Already Decided
- Every service exposes internal liveness, readiness, and startup endpoints.
  Liveness checks only the process; readiness checks required dependencies,
  configuration, secrets, and schema compatibility. External provider health
  never affects service readiness.
- Services emit structured JSON logs to stdout/stderr with service, request,
  correlation, event/trace, operation, duration, and sanitized error context.
  Secrets, credentials, authorization data, complete provider payloads, and
  sensitive portfolio data are not logged.
- Services expose internal Prometheus-compatible HTTP, process, dependency,
  outbox/stream, background-job, provider, and portfolio-recalculation metrics.
  High-cardinality user/listing/symbol labels are prohibited.
- Personal deployments create nightly PostgreSQL custom-format backups, retain
  seven daily and four weekly backups, verify backups, and document/test
  restoration. Initial objectives are 24-hour RPO and four-hour RTO.
- PostgreSQL is the durable recovery source. Redis is not required in backups;
  projections and streams are rebuilt/reconciled after Redis loss.
- Migrations are forward-only and service-owned, use an advisory lock, and
  prefer expand-and-contract changes. Backups precede production migrations;
  recovery normally rolls forward rather than running destructive down
  migrations.
- Local development may use uncommitted `.env` files with placeholder-only
  `.env.example`. Deployments prefer mounted/Docker secrets, use separate
  service credentials, support rotation, and never place secrets in images,
  logs, databases, or frontend bundles.
- Retention defaults are documented in the main specification. Cleanup jobs
  delete in bounded batches and expose success/failure metrics.

### Affects
All services, Compose deployment, documentation, and operational tests.

---

## 14. Portfolio Dividend Receipts And Cash Flows

### Questions
- None.

### Already Decided
- Events owns the objective dividend corporate-action fact; portfolio owns the
  user's actual dividend receipt.
- V1 dividend receipts are manually entered. Events may later suggest a
  prefilled receipt, but the user must confirm it; receipts are never created
  automatically from corporate actions.
- Dividend receipts include position ID, optional corporate-action ID, gross
  amount, withholding tax, fees, net amount, currency, payment date,
  tax-relevant value date, and optional note.
- Portfolio supports external deposit and withdrawal cash flows.
- Deposits and withdrawals are used by XIRR/TWR calculations but do not alter
  the purchase-based total-return denominator.

### Affects
Portfolio accounting, events/frontend composition, currency conversion,
performance metrics, schema, and tests.

---

## 15. Transaction And Realization Persistence

### Questions
- None.

### Already Decided
- User-entered buy and sell transactions are authoritative.
- FIFO/LIFO consumption is stored as derived, rebuildable realization
  allocations.
- Average-cost sells preserve derived, rebuildable average-cost realization
  snapshots.
- Changing the accounting method rebuilds derived realization records without
  replacing authoritative transactions.
- Transactions and corporate-action applications use an explicit `effective_at`
  timestamp.
- Corporate actions effective before market opening are ordered before trades
  on that date; trades use execution time; stable creation sequence is the
  final tie-breaker.
- When date-only same-day entries could change the result, the user must
  explicitly order them.

### Affects
Portfolio schema, accounting-method recalculation, split application,
transaction editing, and tests.

---

## 16. Insight Target Scope And Ownership

### Questions
- None.

### Already Decided
- Analyst fair values and price targets are global instrument-level records.
- System/provider technical estimates are global and may be listing-specific.
- User DCF models and own target zones are private user-owned records.
- User targets normally belong to the underlying instrument and may optionally
  reference a listing when listing currency or pricing matters.
- User targets survive position moves, closure, and deletion.

### Affects
Insights schema, user isolation, portfolio references, UI composition,
and deletion behavior.

---

## 17. Instrument Discovery And Creation Flow

### Questions
- None.

### Already Decided
- Frontend sends normalized discovery requests to instruments.
- Instruments calls market's internal provider-discovery API.
- Market owns Yahoo-specific integration and returns normalized suggestions.
- Instruments owns creation and updates of instruments, listings, exchanges,
  and provider mappings after user confirmation.
- Atomic upserts and unique constraints prevent duplicates during concurrent
  confirmations.
- Uniqueness uses stable instrument identifiers such as ISIN where available,
  exchange MIC plus symbol for listings, and provider plus provider identifier
  for mappings.

### Affects
Instruments and market service boundaries, Yahoo adapter contracts, frontend
flow, persistence, and concurrency tests.

---

## 18. User Lifecycle

### Questions
- None.

### Already Decided
- Disabling is the normal reversible user-removal action.
- Disabling immediately revokes sessions and refresh tokens, prevents login,
  and preserves all user-owned data.
- Permanent deletion is a separate explicit administrative operation requiring
  a destructive-action warning and confirmation.
- Permanent deletion cascade-deletes private user-owned data while preserving
  shared instruments, provider market data, fundamentals, and events.
- The final active admin cannot be disabled, deleted, or demoted.

### Affects
Authentication, all user-owned services, deletion workflows, and tests.

---

## Resolved Decisions

### 2026-06-15: Portfolio Pulse (Explainable Intelligence Score)
- `GET /reporting/intelligence?portfolio_id=&period=` returns a versioned
  (`v1`) portfolio-health score from a pure `computePortfolioPulse`.
- Component weights: **Structure 45% · Risk 30% · Data quality 25%**.
- Structure = `100·(1−HHI)` over instrument-level concentration; the **combined
  all-portfolios view aggregates identical instruments across portfolios** before
  computing weights/HHI (consistent with combined asset cards).
- Risk blends annualized volatility (cap 40%), downside volatility (cap 40%), and
  |max drawdown| (cap 50%) over the period TWR return series.
- Data quality = value-weighted price coverage (50%) + quote freshness (30%) +
  ledger validity (20%).
- Unavailable components (no holdings → no structure; <2 risk samples → no risk)
  are dropped and the remaining base weights renormalized; `confidence` =
  available-weight × priced-value coverage. With neither structure nor risk
  available the result is `insufficient_data` with a null score (never a silent
  healthy score). Status bands: ≥75 strong, ≥60 balanced, ≥40 fragile, else
  at_risk. `primary_driver` is the lowest-scoring available component.
- **Deferred:** user risk profiles adjusting risk thresholds.
- Not yet folded into `prompt.md` (it is a roadmap follow-up, not a §2 functional
  requirement); recorded here + in `backend-roadmap-pending.md`.

### 2026-06-12: Remaining Design Decisions
- Combined-view benchmark selection is configured per user and is not derived
  or blended from portfolio-level benchmarks.
- Portfolio owns manually confirmed dividend receipts, deposits, and
  withdrawals; objective dividend facts remain owned by events.
- Authoritative transactions are separate from rebuildable FIFO/LIFO
  allocations and average-cost realization snapshots.
- Position-ledger ordering uses `effective_at` plus a stable creation sequence,
  with explicit user ordering required for ambiguous date-only entries.
- Analyst insights are global instrument records; own DCF models and target
  zones are private user-owned instrument records with optional listing scope.
- Market owns Yahoo discovery integration; instruments owns confirmed master
  data creation using atomic upserts and uniqueness constraints.
- User disabling is reversible and preserves data; permanent deletion is a
  separate confirmed cascade of private data that preserves shared data.
- Reflected throughout `prompt.md`, especially sections 2, 4, 5, 6, and 7.

### 2026-06-12: Simplified Multi-User Model
- Remove tenants, tenant memberships, tenant switching, and immutable
  single-/multi-tenant operating modes.
- One application instance supports one or more directly owned user accounts;
  personal use is simply an instance with one account.
- User-owned records are scoped by `user_id` and protected through mandatory
  application ownership checks. PostgreSQL RLS is optional later
  defense-in-depth.
- Access tokens and event envelopes no longer contain tenant IDs.
- Public registration remains disabled by default; admins invite and manage
  users, and the final active admin cannot be disabled, deleted, or demoted.
- First-start setup configures authentication and creates the initial admin.
- Reflected throughout `prompt.md`, especially sections 1, 3, 4, 6, 7, 9, and
  10.

### 2026-06-12: Supported Portfolio Accounting Methods
- Support FIFO, LIFO, and average cost.
- Users may change the method at any time.
- Persisted sell transactions allow historical realized P&L and remaining open
  cost basis to be recalculated after a method change.
- The accounting method is configured per user.
- Reflected in `prompt.md` section 2.1.

### 2026-06-12: Supported Performance Metrics
- Support all core value, return, income, risk, and comparison metrics listed
  under decision 2.
- Core values, simple return, total return, and XIRR are required initially;
  other metrics may be delivered incrementally.
- Users may select a preferred headline metric while all underlying values
  remain visible.
- The preferred headline metric is configured per portfolio.
- The combined all-portfolios view uses a separate preferred headline metric
  configured per user.
- Total-return percentage uses total contributed capital as defined under
  decision 2.
- Initial benchmark options are MSCI World, S&P 500, DAX, and NASDAQ-100;
  initial periods are YTD, 1Y, 3Y, 5Y, since inception, and custom. Both remain
  extensible.
- The Sharpe ratio uses €STR as its initial default risk-free rate, with a
  configurable source.
- Combined-view benchmark selection remains open under decision 2.
- Reflected in `prompt.md` sections 2.2 and 8.

### 2026-06-12: Multiple Portfolios Per User
- A user may own multiple portfolios.
- Users manually create and order portfolios; no default portfolio is created.
- Portfolios can be archived/unarchived or permanently cascade-deleted after a
  clear warning and explicit confirmation.
- Archived portfolios are inaccessible for normal use and excluded from all
  combined views and calculations.
- Positions belong to a portfolio rather than directly representing a user's
  only portfolio.
- Only active positions can move between portfolios, and they move together
  with all transactions. Individual transactions cannot move independently.
- Positions can only be sold from their current portfolio.
- The default portfolio-section view combines all portfolios; selecting a
  portfolio filters metrics and assets.
- Combined holdings of the same security are aggregated into one asset card
  displaying every contributing portfolio badge.
- Initial entry is manual; CSV and JSON imports are future extension points.
- Reflected in `prompt.md` sections 2.1, 2.2, 4.2, 7, and 8.

### 2026-06-12: Historical Currency Conversion
- Historical realized P&L and dividends use official daily FX rates for their
  tax-relevant value date.
- Trades normally default to settlement/value date; dividends normally default
  to payment/value date. Broker-provided tax dates take precedence.
- Market owns FX rates and obtains missing required rates from an official
  source.
- The initial official source is ECB reference rates.
- Missing publication dates use the most recent previously available ECB rate.
- Reflected in `prompt.md` sections 2.1, 2.2, 4.2, and 9.

### 2026-06-12: Instrument, Listing, And Exchange Model
- Distinguish underlying instruments from exchange-specific listings and
  exchanges.
- Positions and quotes reference listings.
- Fundamentals and most events reference instruments.
- Exchanges use MIC identifiers and include timezone, trading-session, and
  holiday metadata.
- Combined views may aggregate by instrument while accounting remains
  listing-specific.
- Crypto listings represent market pairs on venues.
- Reflected in `prompt.md` sections 2.1, 2.2, 4.2, and 7.

### 2026-06-12: Redis Dependency And Durability
- Redis is required; dependent services fail startup with a clear error when
  Redis is unavailable.
- Redis Streams is internal backend infrastructure and is never queried
  directly by the frontend.
- User-visible events and notifications are persisted in PostgreSQL and exposed
  through service APIs.
- Default Redis deployment uses AOF persistence and a persistent volume so
  normal restarts preserve streams.
- Integration events required for cross-service correctness use service-owned
  transactional outboxes with at-least-once delivery.
- Consumers use manual acknowledgements, stale-pending-entry claiming,
  non-blocking exponential-backoff retries, and classified DLQs.
- Defaults are five retry attempts, seven-day source retention, and thirty-day
  DLQ retention.
- Stable event IDs and aggregate versions handle duplicates and stale or
  out-of-order updates.
- Reflected in `prompt.md` sections 4.1 and 4.2.

### 2026-06-12: Cross-Service HTTP Contract Principles
- HTTP API versioning is header-based.
- Services return errors as JSON using a shared structured schema.
- State-changing and real-world-consequence operations require idempotency
  keys.
- Synchronous calls use one-to-five-second timeouts and one-to-three
  delay-bounded retries.
- Retries are allowed only for definitively repeatable requests.
- Endpoint exposure is selected per use case and documented per service.
- `X-API-Version`, Problem Details JSON, endpoint exposure/auth declarations,
  the Redis event envelope, and breaking-change rollout rules are standardized
  under decision 7.
- Reflected in `prompt.md` section 4.

### 2026-06-12: Identity And Authorization Model
- Adopt the internal JWT claims, roles, scopes, session, refresh-token,
  invitation, bootstrap, reset, service-token, and user-isolation rules under
  decision 8.
- Admin account management does not imply access to users' portfolios.
- User-owned data uses mandatory ownership checks; PostgreSQL RLS is optional
  later defense-in-depth.
- Reflected in `prompt.md` section 6.

### 2026-06-12: V1 And V2 Data Providers
- V1 uses Yahoo Finance for stock and crypto discovery, quotes, and price
  history.
- V1 uses ECB reference rates for official daily FX rates.
- Yahoo Finance remains isolated behind a provider adapter because it is an
  unofficial and replaceable integration.
- CoinGecko, Alpha Vantage, Finnhub, Financial Modeling Prep, and FRED are
  planned V2 provider integrations; exact capability mapping is selected when
  each integration is implemented.
- Reflected in `prompt.md` sections 5 and 10.

### 2026-06-12: Market Data Refresh, Resolution, And Retention
- Adopt the configurable held/watched stock and crypto refresh schedules,
  post-close stock refresh, nightly reconciliation, and daily/on-demand ECB
  refresh policy under decision 9.
- Normalized quotes expose provider/retrieval timestamps and explicit
  freshness status. Stale stored values remain usable and are visibly marked.
- Provider listing identifiers are explicit and users confirm provider search
  results before position creation.
- V1 retains stale values without automatic provider fallback. V2 precedence
  and fallback are configured per capability without silently merging values.
- Manual valuations are user-owned, separate from provider records,
  explicitly selected, and visibly marked.
- Retain daily closes, latest normalized quotes, and FX rates indefinitely;
  intraday quotes and refresh metadata default to 90 days; successful raw
  payloads default to disabled or 7 days; failed/unparseable payloads default
  to 30 days.
- Provider failures use bounded retries and circuit breakers, while portfolio
  reads never synchronously depend on providers.
- Reflected in `prompt.md` sections 5 and 7.

### 2026-06-12: Watchlist Ownership And Market Interest Projection
- Portfolio owns user watchlists.
- Portfolio publishes durable open-position and watchlist interest changes
  through its transactional outbox to Redis Streams.
- Market maintains its own idempotent materialized interest projection and
  consolidates all interests into one unique listing set.
- Market deduplicates refreshes by provider/capability/provider identifier and
  batches or chunks provider requests where supported.
- Portfolio provides an internal reconciliation snapshot/API so market can
  rebuild or repair its projection.
- Reflected in `prompt.md` sections 4, 5, and 7.

### 2026-06-12: Transaction Editing, Invalid Positions, And Undo
- Every transaction edit or deletion validates the complete position ledger and
  triggers a complete position recalculation when valid.
- If the change makes later ledger entries invalid, the change is accepted, the
  position is prominently marked invalid, and derived recalculations pause
  until the history is fixed.
- Undo snapshots for edits and deletions exist only in browser/session state
  and are not backend audit records. Clearing that state removes undo.
- Undo restores data through normal validated portfolio commands and may fail
  after conflicting subsequent changes.
- Position state is derived entirely from the ordered position ledger
  containing transactions and active corporate-action applications, and cannot
  be set manually.
- Invalid positions retain their last valid values in aggregate portfolio
  metrics until a successful recalculation replaces them.
- Reflected in `prompt.md` sections 2.1 and 8.

### 2026-06-12: Signed Split Application Contract
- Events returns an immutable corporate-action version and short-lived signed
  application token to the frontend.
- Portfolio verifies and applies the exact signed version without synchronously
  calling events.
- Corrections create new immutable action versions, and expired tokens require
  reloading.
- Application records preserve the signed action snapshot and exact lot values
  before and after application.
- Direct reversal is allowed only when no later position transaction or action
  application would be affected.
- More than one active application of the same corporate action to the same
  position is prevented; corrected versions require reversing the previous
  application, while reversed records remain preserved.
- Reflected in `prompt.md` sections 2.6 and 7.

### 2026-06-12: Operational Requirements
- Adopt the health endpoint, structured logging, Prometheus-compatible metrics,
  backup/restore, forward-only migration, secret-management, and retention
  defaults under decision 13.
- External providers never affect readiness, and PostgreSQL remains the durable
  recovery source.
- Personal deployments default to nightly verified PostgreSQL backups, seven
  daily and four weekly copies, a 24-hour RPO, and a four-hour RTO.
- Redis is reconciled or rebuilt after loss rather than treated as a required
  backup source.
- Reflected in `prompt.md` sections 9.1 and 10.
