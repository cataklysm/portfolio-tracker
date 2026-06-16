# Prompt / Specification: Self-Hosted Portfolio Intelligence Platform

> **How to use this document:** You can hand it in full to an AI coding agent (e.g. Claude Code) or use it as the technical specification/README for the repo. It is deliberately implementation-agnostic enough that the implementer can make sensible detail decisions, while being precise about the things that matter to you.

---

## 1. Project Goal

Build a **self-hosted, multi-user portfolio intelligence platform** for retail
investors that goes beyond pure price tracking. Existing tools (e.g. Portfolio
Performance) focus almost exclusively on the numbers around prices. This
application should bring **position management, market data, fundamentals,
valuation, price assessment, and price-relevant events (earnings, news,
economic data) together in one place**, so that no research across countless
websites is needed anymore.

The application is built in **TypeScript on Node.js** and sliced into **micro-services**. The default reporting currency is EUR, but users may hold and transact through broker accounts in different currencies; portfolio totals are displayed in the user's configured reporting currency. TypeScript is mandatory across all services and the frontend (no plain JavaScript).

Real-time is **not** required. A slight delay (e.g. 15-minute delayed quotes) is explicitly acceptable and should be used deliberately to conserve API limits.

---

## 2. Functional Requirements

### 2.1 Position & Transaction Management
- A user may own multiple portfolios. A portfolio is an explicit domain entity,
  not an implicit one-to-one extension of a user.
- Users manually create their first portfolio. If no portfolio exists, the
  portfolio section displays a portfolio-creation form rather than creating a
  default portfolio automatically.
- Users can manually order, archive, unarchive, and permanently delete
  portfolios. Permanent deletion cascades to all contained positions and
  their transactions, portfolio-owned cash flows, transfer records,
  corporate-action application records, and derived accounting records. It
  does not delete global instrument data or user-owned instrument insights,
  and requires a clear destructive-action warning and explicit user
  confirmation that historical performance will be affected.
- Archived portfolios are inaccessible for normal portfolio use and excluded
  from all combined metrics, asset cards, allocation views, and performance
  calculations. They display an **archived** badge in portfolio management and
  can be unarchived by the user.
- Every position belongs to exactly one portfolio. The same instrument may be
  held in multiple portfolios owned by the same user, with one logical position
  per exchange-specific listing within each portfolio.
- Only active/open holdings can be moved between the user's portfolios. A
  position may move as a whole together with its authoritative transaction and
  corporate-action history. For FIFO/LIFO positions, the user may alternatively
  move a selected subset of **fully open buy lots** to a same-listing position
  in another owned portfolio; each selected lot moves intact with its original
  transaction ID, quantity, cost basis, and acquisition date. Splitting and
  moving only part of one open buy lot is deferred because it requires an
  explicit authoritative lot-split/provenance model and must not silently
  mutate the original buy transaction. Transfers create linked internal
  `transfer_out` and `transfer_in` records at the transfer timestamp so
  historical portfolio attribution is preserved. These internal transfers are
  excluded from combined all-portfolios performance because no money entered or
  left the user's total holdings. Moves trigger validation and recalculation of
  all affected portfolio metrics.
- Dividend receipts received before a position move remain attributed to the
  portfolio that received them. Future dividends are attributed to the
  destination portfolio. Deposits and withdrawals never move between
  portfolios.
- A position can only be sold from the portfolio in which it currently exists.
- **Multiple buys per listing/position** (partial buys at different prices and times).
- **Fractional shares are first-class:** quantities are stored consistently as exact decimal values (no integer constraint), since savings plans and crypto regularly produce fractions. Data type/precision see §9.
- **Savings plans** without a dedicated engine: each execution is just another (fractional) buy lot with date, price, fee; optionally flagged as "savings plan" to group them in reporting.
- Per transaction: date, quantity, execution price, **broker fees**, trade currency, and optionally the FX rate at booking time. Fees belong to that individual buy or sell action.
- Transactions and cash flows preserve an explicit **tax-relevant value date**
  used for historical currency conversion. For trades this normally defaults to
  the settlement/value date; for dividends it normally defaults to the
  payment/value date. A broker-provided tax-relevant date takes precedence
  because the applicable date may differ by broker or jurisdiction.
- User-entered buy and sell transactions are the authoritative trade records.
  FIFO/LIFO lot-consumption allocations and average-cost realization snapshots
  are derived, reproducible accounting records rather than replacements for the
  original transactions.
- Every transaction, corporate-action application, and position transfer has
  an `effective_at` timestamp. Transactions and corporate-action applications
  use it to order the position ledger; transfers use it to preserve historical
  portfolio attribution. Corporate actions effective before market opening are
  ordered before trades on that date; trades and transfers use their execution
  time; a stable creation sequence is the final tie-breaker. When date-only
  entries on the same day could change the result, the user must explicitly
  order them.
- Sells / partial sells with a configurable per-user realization-accounting method. Supported methods are **FIFO**, **LIFO**, and **average cost**.
- A new sell command is rejected when it exceeds the currently owned quantity.
  Historical edits may temporarily create this condition, in which case the
  position becomes invalid as described below. Short selling, put/call
  contracts, and other derivatives are out of scope.
- A partial sell is a normal sell action. The selected accounting method determines which open buy lots are consumed and therefore the realized P&L; with FIFO, the oldest available quantities are consumed first.
- The user may change the accounting method at any time. Because all sell transactions remain stored, changing the method triggers a complete recalculation of historical realized P&L and remaining open cost basis.
- Position state is derived entirely from its ordered position ledger and
  cannot be set manually. The ledger consists of transactions plus active
  corporate-action applications such as applied splits. Positive remaining
  quantity means **open**, zero means **closed**, adding a new buy to a closed
  position means **reopened/open**, and an inconsistent ledger means
  **invalid**. The derived state may be materialized for efficient querying,
  but ledger entries remain its source of truth.
- Position transfers do not change the position's combined quantity or cost
  basis and therefore are not quantity-changing position-ledger entries. They
  change portfolio attribution from their effective timestamp onward.
- Users may correct or delete their own transactions when they entered
  something incorrectly. An immutable audit trail for ordinary transaction
  edits is not required.
- Editing or deleting any transaction validates the complete transaction
  and corporate-action application ledger. If the resulting ledger is valid,
  portfolio performs a complete
  position recalculation, including quantity, open/closed state, cost basis,
  realized P&L, and affected portfolio metrics.
- An edit or deletion that makes a later transaction invalid, such as a sell
  exceeding the available quantity at that point in history, is accepted but
  marks the position **invalid**. No derived recalculation runs while the
  ledger is invalid; recalculation resumes only after the user fixes the
  position ledger.
- While a position is invalid, aggregate portfolio metrics retain its last
  successfully calculated values. The invalid edit must not overwrite those
  values; a successful recalculation after repair replaces them.
- Transaction edits and deletions offer an undo action using the previous
  transaction snapshot held only in browser/session state. The backend does not
  persist this snapshot as an audit record. Clearing the relevant browser or
  session data removes the undo option. Undo uses the normal validated
  portfolio command and may fail when subsequent changes make restoration
  invalid.
- Supported asset classes: **equities**, **funds** (including ETFs), and
  **crypto (BTC spot)**. Keep the architecture generic enough that further
  crypto/asset types can be added later. The instrument catalog additionally
  supports **index** as a non-holdable reference asset type for benchmark
  series; index listings cannot be used to create portfolio positions.
- Watchlist for not-yet-held instruments/listings (for entry evaluation).
- Positions and transactions are entered manually initially. CSV and JSON
  import are planned extension points for a later version.
- Portfolio owns actual user cash flows. V1 supports manually entered dividend
  receipts, deposits, and withdrawals.
- Every cash flow belongs to exactly one portfolio. Deposits and withdrawals
  require a portfolio ID. Dividend receipts require a position ID and store a
  snapshot of the position's portfolio ID at receipt time so later position
  moves do not rewrite historical attribution.
- A dividend receipt is separate from the objective dividend corporate action
  stored by events. Events may later suggest a prefilled receipt, but the user
  must explicitly confirm it; a corporate action never automatically creates a
  portfolio receipt.
- Dividend receipts store position ID, snapshotted portfolio ID, optional
  corporate-action ID, gross amount, withholding tax, fees, net amount,
  currency, payment date, tax-relevant value date, and optional note.

### 2.2 Price & Value Calculation
- Current day price per position, **absolute and percentage** (daily change).
- Realized P&L is calculated from consumed lots according to the selected accounting method. Unrealized P&L for open quantities uses the latest available market price.
- Performance **since purchase**, absolute and percentage — at lot level and aggregated across all lots of a security.
- Dividends are displayed separately and are not included in realized or unrealized P&L.
- Total portfolio value, daily change, overall performance, realized P&L, unrealized P&L, and dividends.
- Metrics can be calculated for one selected portfolio or aggregated across all
  portfolios owned by the user.
- Values in different transaction/market currencies are converted for portfolio totals and displayed in the user's configured reporting currency. A separate FX-effect analysis is not required.
- Historical realized P&L and dividends are converted using the official daily
  FX rate for their tax-relevant value date.
- The initial official FX source is the **European Central Bank (ECB) reference
  rates**. If the ECB publishes no rate for the tax-relevant date, use the most
  recent previously available ECB rate. This normally means Friday's rate for a
  weekend and the preceding publication day's rate for a public holiday.
- Daily-change calculations follow the timezone and trading session of the exchange on which the instrument was bought; each supported exchange therefore requires trading-session metadata.

The domain distinguishes an underlying **instrument** from its
exchange-specific **listings**:
- An instrument represents the underlying economic asset or company.
- A listing represents that instrument traded on a specific exchange/venue
  with its own symbol, currency, provider identifiers, and active state.
- An exchange stores its ISO 10383 MIC, timezone, regular trading session, and
  holiday calendar.
- Positions and quotes reference the exact listing.
- Fundamentals, earnings, corporate actions, and general company news normally
  reference the underlying instrument.
- Each instrument may define a primary listing to assist provider resolution,
  but the primary listing never determines the price used for another listing's
  position.
- Combined portfolio views may aggregate holdings by instrument, while
  accounting, pricing, and listing details remain listing-specific.
- For crypto, a listing represents a tradable market pair on a venue, such as
  BTC-EUR on Kraken.

The platform supports multiple complementary performance metrics. Each metric
must be clearly labeled with its meaning, period, calculation basis, and whether
it is annualized:

- **Core values:** current value, invested capital/open cost basis, realized
  P&L, unrealized P&L, dividends, fees, total P&L, and daily change.
- **Return metrics:** simple return, total return, money-weighted return/XIRR,
  time-weighted return, annualized return/CAGR, and income return.
- **Income views:** yield on cost, trailing-twelve-month dividend yield, and
  annual dividend income.
- **Risk and comparison metrics:** benchmark-relative return, beta,
  correlation, annualized tracking error, volatility, maximum drawdown, Sharpe
  ratio, best/worst day or month, and closed-position win rate. Additional
  benchmark-relative risk measures beyond beta/correlation/tracking error are a
  deferred follow-up rather than an implicit V1 requirement.

Core values, simple return, total return, and XIRR are required for the initial
portfolio reporting implementation. Time-weighted, income, risk, and comparison
metrics may be delivered incrementally, but remain supported product
requirements. The UI exposes the underlying values and does not present a
selected headline metric as the only definition of performance.

**Total-return percentage** uses total contributed capital as its denominator:

```text
total return =
  (current value + gross sell proceeds + dividends + returned capital
   - total contributed capital - fees)
  / total contributed capital
```

`total contributed capital` is the gross purchase consideration contributed by
the user, excluding fees. Buy and sell fees are subtracted exactly once through
the separate `fees` term. This definition remains valid after partial sells and
returned capital; a return-of-capital receipt reduces open cost basis but does
not rewrite historical contributed capital. Deposits and withdrawals are used
as external cash flows for money-weighted/XIRR and time-weighted calculations
but do not change this purchase-based total-return denominator.

Initial benchmark options are **MSCI World**, **S&P 500**, **DAX**, and
**NASDAQ-100**. Initial comparison periods are **YTD**, **1Y**, **3Y**, **5Y**,
**since inception**, and a **custom period**. Benchmark identifiers and periods
must be extensible so users can select additional benchmarks and period options
in later versions.

The initial benchmarks are exposed through a curated catalog owned by the
instruments service. Each catalog entry has a stable key and resolves directly
to a seeded index listing with provider mappings; runtime symbol lookup is not
used because symbols are not globally unique and provider identifiers differ.
The portfolio service stores only the selected `listing_id`. The normal
instrument/listing search remains available as a fallback for benchmarks
outside the curated set. Index instruments are reference assets and cannot be
held as portfolio positions; users who hold an index-tracking product select
the corresponding fund/ETF listing instead.

Each portfolio may define an optional preferred benchmark. The combined
all-portfolios view uses a separate preferred benchmark configured per user and
stored by authentication as `user_preferences.combined_benchmark`. It resolves
to a benchmark listing independently of portfolio-level preferences and does
not derive or blend a benchmark from the included portfolios.

The Sharpe ratio uses the **Euro short-term rate (€STR)** as its initial default
risk-free rate. The risk-free-rate source must remain configurable for future
reporting currencies and user preferences.

### 2.3 Fundamentals
- Metrics per instrument/company: **P/E**, P/B, P/S, dividend yield, market cap, EPS, revenue/earnings growth, debt, etc.
- Fundamentals contain objective company and financial-statement data only. Estimates, forecasts, fair values, and target zones belong to insights.

### 2.4 Insights & Price Assessment
Treat estimates honestly and in layers rather than as a single "magic" forecast:
- **Intrinsic value / fair value:** Important — intrinsic value is not a retrievable fact but a model output. Implement it transparently, not as a black box. Recommended:
  - A simple, traceable **DCF model** with adjustable assumptions (growth, discount rate, terminal growth), and/or
  - Display of an **analyst fair value / consensus** if a data source provides it.
  - Clearly label both sources (method + date) so the user knows where the number comes from.
- **Analyst fair values and price targets** are global instrument-level records
  when available from a provider.
- **Own DCF models and target ranges** are user-owned and normally belong to
  the underlying instrument, so they survive position moves, closure, deletion,
  and holdings across multiple portfolios. A target may optionally reference a
  specific listing when listing currency or listing-specific pricing matters.
  Users can manually maintain versioned short/medium/long-term target zones
  based on their own assessment.
- Optional Elliott Wave estimates and scenarios, clearly labeled as estimates rather than facts.
- Optional: derivable technical markers (moving averages, 52-week high/low, simple Fibonacci retracements based on existing price history).
- Clearly separate what is **third-party opinion**, what is **model**, and what is **own assessment**.

### 2.5 Events & Context
Events are modeled **relationally and separated by type** (no generic catch-all table), so they can be filtered by criteria and grouped by time period. Raw provider payloads may additionally be archived as a JSONB column; all query-relevant fields belong in real columns.

- **Earnings** as a dedicated entity, cleanly displayable by quarters and years. Fiscal year and quarter are stored **separately from the period-end date**, since fiscal years often differ from the calendar year. Fields include: fiscal year, fiscal quarter, period end, report date, EPS estimate/actual, revenue estimate/actual, derived surprise; upcoming dates + history (beat/miss).
- **Corporate actions** as a dedicated concept (splits, reverse splits,
  dividends, buybacks, spin-offs, return of capital, **capital
  increases/dilution**). The action is an **objective market fact** and exists
  independently of whether the user holds the security.
  - *Capital increase:* new share count, subscription price, share count before/after, derived **dilution ratio**. Relevant for explaining price movements and for all per-share metrics (EPS, P/E) as well as the DCF (diluted share count).
  - *Splits / reverse splits:* see interaction in §2.6.
- **News** per instrument as a relational entity (filterable), ideally with a sentiment tag.
- **Macro/economic calendar** (ECB/Fed rate decisions, inflation, labor market, etc.) as market context.
- Events reference instruments rather than portfolio positions. The frontend
  composes events with the user's positions/listings so relevant events are
  visible directly on held securities without creating cross-service database
  ownership.

### 2.6 Applying Corporate Actions to Positions
Strictly separate the **fact** (the corporate action in the market) from the
**application to the user's specific position** (e.g. 10 shares at cost X → 40
shares at cost X/4 for 4:1).

- The events/notifications flow informs the frontend that a relevant corporate
  action exists. The frontend displays the event and any available context or
  insights; the user decides when to apply it.
- The user applies a supported corporate action **deliberately via a frontend
  interaction** — only possible if a position exists in the affected security.
  Events returns the displayed immutable corporate-action version together with
  a short-lived signed application token. The frontend sends that token,
  position ID, and action-specific application choices to portfolio. Events
  does not call portfolio or execute the change, and portfolio does not
  synchronously call events while applying it.
- The signed application token contains the corporate-action ID and version,
  instrument ID, action type, effective date, all objective action-specific
  values, source, and expiration. Portfolio verifies the events-service
  signature, verifies that the position's listing belongs to the signed
  instrument, and applies exactly the action version the user confirmed.
  Expired tokens require the frontend to reload the action.
- Corporate-action versions are immutable. Provider corrections create a new
  version while older versions remain identifiable. The frontend warns when a
  newer version exists before application.
- **Idempotent:** an active-application unique constraint for position and
  corporate action prevents double application and serves as an **audit
  trail**. Reversed records remain preserved. A corrected action version can be
  applied only after the previous application is reversed.
- **Reversible rather than destructive:** the authoritative application record
  preserves the complete signed action snapshot, action-specific applied values
  and overrides, effective date, actor, applied timestamp, and token
  signature/hash. Applying it rebuilds derived quantities, cost bases,
  realization allocations, and position state from the action's effective
  point onward. It does not mutate authoritative buy/sell transactions or
  create synthetic trades.
- Reversal marks the application record as reversed and performs the same
  deterministic rebuild without that application. If reversal makes the
  remaining ledger inconsistent, the normal invalid-position rules apply until
  the user repairs the history.
- Jurisdiction-specific application policy is selected from the user's primary
  tax residence effective on the corporate action date. It is never inferred
  from UI locale, reporting currency, or listing venue. If the tax residence is
  missing or the relevant policy is unsupported, the application is rejected
  rather than silently applying a default policy.

**Splits / reverse splits**

- **Reverse splits — fractional shares:** since fractional shares are supported, the **default is to keep fractions** (e.g. 10 shares → 3.33 at 1:3). Alternatively selectable on application: **cash settlement** of the remainder, recorded as an authoritative cash-in-lieu ledger entry linked to the application rather than as a synthetic user sell. Both paths are supported.

**Return of capital**

- The objective event stores the return-of-capital amount **per share** and its
  currency. On application, portfolio calculates the position-specific total
  from the quantity held at the effective date. A user may override that total
  from a broker statement; the application record preserves both the objective
  per-share value and the applied total together with its source.
- Return of capital reduces the remaining open cost basis without changing
  quantity and is not income or a synthetic sale. The explicitly confirmed
  application records the received amount as a linked authoritative
  `return_of_capital` cash flow so reporting includes the distribution without
  classifying it as dividend income or an external contribution. For the
  initial DE policy, cost basis may be reduced only to zero. An application
  whose amount exceeds the remaining basis is rejected with a dedicated error
  until an explicit excess-return realization type is supported. The user must
  not record the excess as a sale because no shares were disposed of.

**Spin-offs**

- The objective spin-off fact contains the distributed-quantity ratio and,
  when supplied by the issuer/provider, the basis-allocation ratio. Portfolio
  uses that authoritative allocation ratio first; if it is unavailable, the
  user must provide an explicit allocation override, which is preserved with
  its source in the application audit record.
- The spun-off instrument and selected listing must already exist before the
  portfolio application command runs. The frontend may search or create them
  through the instruments service before applying the action; portfolio never
  creates instruments or listings.
- Distributed quantity is derived from the objective ratio. The default is
  `keep_fractional`; alternatively, `cash_settlement` removes the undelivered
  fractional quantity and records a linked authoritative cash-in-lieu entry.
- The application requires an explicit treatment:
  `tax_neutral_spinoff` or `taxable_distribution`. Under a tax-neutral
  spin-off, each open parent lot creates a corresponding child lot carrying
  the parent's acquisition date and its allocated portion of cost basis. Under
  a taxable distribution, the child lot uses the actual booking date and the
  applicable recognized value as cost basis. The initial narrow
  implementation may support only `tax_neutral_spinoff` and must reject other
  treatments rather than guess.

### 2.7 Notifications (optional, v2)
- Threshold alerts (price reaches target zone, upcoming earnings in X days, significant daily move).

---

## 3. Non-Functional Requirements
- **User isolation:** one application instance supports one or more users.
  User-owned data is strictly isolated by `user_id`; personal use is simply an
  instance with one user.
- **Performance:** delayed quotes acceptable; UI response times < 300 ms against the cache.
- **API conservation:** aggressive caching; only actually held/watched symbols are actively refreshed.
- **Security:** no plaintext secrets, token validation in every service, rate limiting at the gateway.
- **Observability:** structured logs, health endpoints per service, basic metrics.
- **Portability:** fully runnable via `docker-compose` on a single host.

---

## 4. Architecture

### 4.1 Guiding Principle
Slice the application into **independently deployable services** that by default
**run together in a single-host Compose environment**, but can later be
deployed and scaled individually across multiple containers or hosts through an
appropriate container orchestrator. The scaled deployment remains
orchestrator-neutral; Docker Swarm, Kubernetes, Nomad, or another suitable
platform may be selected when multi-host deployment is actually required.
Communication:
- **Synchronous** via HTTP/JSON behind an API gateway.
- **Asynchronous** (data refresh, events) via **Redis Streams** as the default event bus.
- Redis is a required dependency. Services that depend on Redis perform a
  startup connectivity check and fail fast with a clear error such as
  `Redis unavailable` when it cannot be reached.

The architecture separates **logical service ownership** from **physical deployment**:
- Each service owns one bounded context, its write operations, and its persistence model.
- Services must be designed as if their databases were physically separate: no cross-service SQL joins, no cross-service foreign keys, and no direct writes to another service's tables.
- For personal/small deployments, all services may share one PostgreSQL server and may run together on one host. This is an operational simplification, not permission to bypass service boundaries.
- For larger deployments, services and their databases can be moved to separate containers, hosts, or PostgreSQL instances by changing deployment configuration rather than application architecture.

> Note for the implementer: for the expected load (retail investor, few users) a modular monolith would be functionally sufficient. Since the owner deliberately wants horizontal scalability of individual components, the services should be **physically separable but lightweight**. Avoid distributed complexity that adds no value (no service mesh, no dedicated query/BFF service by default, no over-engineering).

#### Deployment Profiles
1. **Personal/default:** one Compose command starts the frontend, services, Redis, and one PostgreSQL database. Logical service ownership is preserved inside the shared database.
2. **All-in-one packaging (optional):** multiple service processes may be packaged into one container for especially simple personal installations, but they remain separate processes/modules with the same HTTP/event contracts and database ownership rules.
3. **Scaled:** an external container orchestrator runs each service on its own
   container/host and may point it to its own PostgreSQL database or instance.
   Independently scalable workers such as market refresh may have multiple
   replicas.

One image per service remains the canonical deployment artifact. An optional all-in-one image is a packaging convenience, not a separate architecture.

### 4.2 Service Cut
| Service | Responsibility |
|---|---|
| **gateway** | Routing, edge token verification, rate limiting |
| **authentication** | Central internal token authority; external OIDC (Authentik) + local auth; first-start setup and user management |
| **instruments** | Shared instrument, exchange-specific listing, exchange/MIC, and provider-identifier master data |
| **portfolio** | User portfolios, positions, authoritative transactions, internal transfers, corporate-action applications, derived realization allocations, cash flows, fees, realization accounting, portfolio-level preferences, and user watchlists |
| **market** | Quotes, official daily FX rates, consolidated refresh-interest projection, scheduler + cache; obtains missing rates on demand and encapsulates external market-data APIs behind provider adapters |
| **fundamentals** | Objective company and financial-statement metrics such as P/E, EPS, revenue, debt, and growth |
| **events** | Earnings, corporate actions, news, macro calendar as separate entities; maps events to instruments and publishes relevant event facts |
| **insights** | Fair-value models, analyst estimates, own target zones, Elliott Wave estimates, and technical markers |
| **notifications** (v2) | Alerts |
| **frontend** | Next.js UI and default server-side composition of data from multiple services |

The frontend performs the initial dashboard/detail composition. Do **not** introduce a dedicated query/BFF service unless measured latency, availability, or caching requirements justify it later.

Shared infrastructure: **PostgreSQL** for persistent data (one shared database by default, optionally separate databases or PostgreSQL instances per service; flexible parts such as raw event payloads via JSONB) and **Redis** for cache and Redis Streams as the default event bus.

#### Internal Service Architecture And Navigability

Every backend service uses a pragmatic **feature-first, ports-and-adapters**
structure. The goal is to make ownership, public interfaces, use cases, and
infrastructure implementations easy to locate without creating empty
architectural layers for trivial behavior.

Organize meaningful business capabilities under `src/modules/<feature>/`.
Within a feature, introduce only the layers that the feature needs:

```text
services/<service>/
├── src/
│   ├── app.ts
│   ├── server.ts
│   ├── config/
│   ├── platform/
│   │   ├── database/
│   │   ├── redis/
│   │   ├── observability/
│   │   └── authentication/
│   └── modules/
│       └── <feature>/
│           ├── domain/
│           ├── application/
│           ├── infrastructure/
│           ├── http/
│           └── index.ts
├── migrations/
├── README.md
└── package.json
```

- `domain/` contains framework-independent entities, value objects, business
  rules, calculations, and domain errors.
- `application/` contains explicit commands, queries, and use cases. Interfaces
  required by a use case, such as repositories or external-service clients,
  are declared beside the consuming use case as **ports**.
- `infrastructure/` contains adapters implementing those ports, such as Kysely
  repositories, Redis publishers/consumers, provider clients, and service HTTP
  clients.
- `http/` contains Fastify plugins, TypeBox/JSON Schema contracts, request
  parsing, authorization hooks, and response mapping. HTTP handlers remain
  thin: they invoke an application use case and map its result; they do not
  contain SQL or substantial business logic.
- `platform/` contains service-wide technical capabilities shared by multiple
  modules. It must not become a location for business-domain behavior.
- `app.ts` is the service composition root. It constructs adapters, wires them
  to use cases, and registers encapsulated Fastify plugins.
- `server.ts` only manages process startup, readiness, graceful shutdown, and
  fatal-error handling.
- A module's `index.ts` is its deliberate public API. Other modules must not
  deep-import that module's internal files.

Dependency direction is mandatory:

```text
HTTP/adapters -> application use cases -> domain
Infrastructure adapters -> application/domain ports
Domain -> no HTTP framework, database, Redis, provider SDK, environment, or
          other infrastructure imports
```

Use Fastify plugin encapsulation to register each feature's routes, schemas,
hooks, and dependencies within the narrowest applicable scope. A service may
not import another service's internal source modules; cross-service interaction
uses versioned HTTP/event contracts only.

Navigation and maintainability rules:

- Prefer one primary exported concept per file and names that describe a use
  case or domain concept, such as `create-position.ts` or
  `position-repository.ts`.
- Avoid broad dumping-ground files or directories named `helpers`, `utils`,
  `common`, `types`, `interfaces`, or `services`. Shared code must have a clear
  owner and purpose.
- A source file should normally remain below roughly **200–300 lines**. A
  larger file requires a clear cohesion-based reason and must not combine HTTP,
  SQL, business rules, and DTO mapping.
- Keep database row types and persistence mapping in infrastructure adapters;
  transport DTOs and schemas in `http/`; domain types in `domain/`.
- Cross-service HTTP and event schemas live in dedicated versioned contract
  packages. Shared packages expose only deliberate public entry points through
  package `exports`; internal files are not public API.
- Use TypeScript project references and dependency-boundary lint rules where
  useful to make invalid dependency directions fail in CI.
- Tests mirror the module structure and live beside or immediately under the
  behavior they verify. Domain calculations receive focused unit tests; use
  cases receive port-based tests; infrastructure adapters receive
  Testcontainers integration tests; HTTP contracts receive route/contract
  tests.
- Every service has a concise `README.md` describing its owned capabilities,
  modules, public HTTP contracts, published/consumed events, persistence
  ownership, external dependencies, and local run/test commands.
- Architectural tests or lint rules reject forbidden imports, including domain
  imports from Fastify, Kysely/PostgreSQL, Redis, provider SDKs, or another
  service's source tree.

Do not apply these layers mechanically to tiny technical endpoints such as a
simple liveness route. The structure exists to preserve cohesion and
navigability as business features grow, not to create ceremony.

Redis Streams is an internal backend communication mechanism. The frontend does
not connect to Redis or query streams directly; it queries service HTTP APIs.
User-visible domain events and notifications are persisted by their owning
service in PostgreSQL and exposed through those APIs. Redis Streams messages
trigger processing and propagation but are not the sole durable record of
business facts.

Integration events required for cross-service correctness use a
**transactional outbox**. The producing service writes its owned business state
and an outbox record in the same PostgreSQL transaction. A lightweight
service-owned publisher worker sends pending outbox records to Redis Streams and
marks them published. Delivery is at least once, so consumers must be
idempotent.

The outbox is required for events whose loss would leave another service in an
incorrect or permanently stale state, such as position lifecycle, watchlist
interest, instrument/listing changes, corporate actions, and successfully
stored provider-data updates. It is not required for disposable cache
invalidation, health events, metrics, or logs.

The default Redis deployment enables durable persistence using **AOF** and a
persistent volume, so normal Redis/container restarts preserve stream data.
Redis data may still be lost after storage failure or deliberate reset; durable
domain state remains recoverable from PostgreSQL, and stream retention may
remove old transport messages after consumers have processed them.

#### Redis Streams Delivery Policy
- Each consuming service/use case has its own consumer group. Consumers
  acknowledge entries manually with `XACK` only after successful processing.
- Consumers claim stale pending entries left behind by crashed consumers and
  process them using the same idempotency rules.
- Errors are classified before retry:
  - **Transient errors** such as network timeouts, temporary dependency
    failures, and rate limits use non-blocking retries.
  - **Permanent errors** such as invalid schemas, unsupported event versions,
    and malformed payloads bypass retries and go directly to a dead-letter
    stream.
- Transient failures use exponential backoff with jitter and a default maximum
  of **5 attempts**. Retry limits and maximum retry age are configurable.
- Retries are non-blocking: failed entries are scheduled through retry streams
  so one poison event does not stop later entries from being processed.
- After retries are exhausted, the entry is written to a dead-letter stream.
  DLQ entries preserve the exact original event payload and append sanitized
  error context: original stream, original entry ID, consumer group, consumer,
  attempt count, error classification, exception/error details, and failure
  timestamp.
- DLQs are separated by source stream/service and error classification so
  malformed data does not mix with transient operational failures.
- Default source-stream retention is **7 days**. Default DLQ retention is
  **30 days** and must always be longer than source-stream retention. Both are
  configurable to local storage constraints.
- DLQ depth, retry volume, pending-entry age, and exhausted retries are exposed
  as metrics and trigger alerts.
- Delivery is at least once. Every event has a stable event ID for
  deduplication. Events that update an aggregate include an aggregate ID and
  monotonically increasing aggregate version so consumers can reject
  duplicates and stale/out-of-order updates.

#### Cross-Service HTTP Contracts
- HTTP API versions are selected through `X-API-Version` rather than URL path
  prefixes. The header contains an integer major version, for example
  `X-API-Version: 1`.
- During early development, a missing version header resolves to the current
  stable version. A configurable strict mode rejects missing headers once
  external clients consume the API. Unsupported versions return
  `406 Not Acceptable`. Responses include the resolved `X-API-Version`.
- Error responses use RFC 9457-style Problem Details JSON with content type
  `application/problem+json`.
- Every error response requires `type`, `title`, `status`, `code`, and
  `request_id`. Optional fields are `detail`, `instance`, and `errors`.
  Validation entries in `errors` contain `field`, `code`, and `message`.
- Error `code` values are stable and machine-readable. Responses never expose
  stack traces, SQL errors, secrets, or other internal implementation details.
- Operations that modify server state, transfer funds, or trigger actions with
  real-world consequences require idempotency keys so clients can safely retry
  after network interruptions.
- Synchronous service calls use short configurable timeouts within **1–5
  seconds** and limited, delay-bounded retries of **1–3 attempts**.
- Synchronous requests may only be retried when they are definitively safe to
  repeat: read-only operations, or state-changing operations protected by a
  valid idempotency key.
- Public gateway exposure versus internal-only access is decided per endpoint
  based on its use case and documented in that service's API contract.
- Endpoints required by the frontend, authentication flows, user-triggered
  commands, and user-visible reads are public through the gateway. Provider
  ingestion, schedulers, outbox publishing, retry/DLQ administration,
  reconciliation, internal callbacks, metrics, and readiness endpoints are
  internal-only unless explicitly documented otherwise.
- Every endpoint contract declares `exposure: public | internal` and
  `auth: user | admin | service`.

#### Redis Streams Event Contract
Redis Streams entries store one JSON event-envelope value with these required
fields:

```json
{
  "event_id": "01J...",
  "event_type": "portfolio.position.opened",
  "event_version": 1,
  "occurred_at": "2026-06-12T08:30:00.000Z",
  "producer": "portfolio",
  "aggregate": {
    "type": "position",
    "id": "position-id",
    "version": 3
  },
  "correlation_id": "01J...",
  "payload": {
    "portfolio_id": "portfolio-id",
    "listing_id": "listing-id"
  }
}
```

Optional envelope fields are `user_id`, `actor`, and `causation_id`.
`actor`, when present, contains a type and ID. Event schemas are stored and
versioned in a shared contracts package.

Event compatibility rules:
- Event names are immutable and `event_version` is an integer.
- Additive optional fields remain compatible and do not require a new version.
- Removing or renaming fields, changing field types, or changing semantics
  requires a new event version.
- Consumers explicitly declare supported versions. Unsupported versions are
  permanent errors and go directly to the DLQ.
- For breaking migrations, deploy consumers that support old and new versions
  before producers publish the new version. Producers may publish both versions
  during the compatibility window. Remove the old version only after all
  consumers migrate.
- Consumer contract tests validate supported event schemas in CI.

### 4.3 Tech Stack

Use the following concrete stack consistently across the project:

- **Runtime and language:** the current Node.js LTS release with TypeScript in
  strict mode across all services and the frontend; no plain JavaScript.
- **Backend HTTP:** Fastify. Define request and response contracts with
  TypeBox/JSON Schema, validate them at runtime, and generate OpenAPI
  specifications from the same schemas.
- **Frontend:** self-hosted Next.js App Router running on Node.js. Use it for the
  card-based UI and default server-side composition of service data.
- **Persistent storage:** PostgreSQL. The default shared-database deployment
  uses separate service-owned schemas and database roles; scaled deployments
  may use separate databases or PostgreSQL instances.
- **Database access and migrations:** Kysely with the `pg` driver and
  service-owned forward-only migrations. Keep complex financial queries
  explicit rather than hiding them behind an active-record ORM.
- **Exact application arithmetic:** `decimal.js` for quantities, monetary
  amounts, rates, and calculated metrics. Never perform financial arithmetic
  with JavaScript `number`.
- **Cache and asynchronous messaging:** Redis using Redis Streams and the
  transactional-outbox rules defined above. Use `node-redis` consistently
  across services.
- **Authentication:** `openid-client` for Authentik/OIDC, `jose` for JWT/JWKS
  operations, and Argon2id for local-password hashing.
- **Testing:** Vitest for unit and service tests, Testcontainers for integration
  tests against real PostgreSQL and Redis instances, and Playwright for
  end-to-end browser workflows.
- **Observability:** OpenTelemetry instrumentation, Prometheus-compatible
  metrics, and structured JSON logs.
- **Build and repository tooling:** pnpm workspaces, `tsc`, `tsx` for local
  development, ESLint, and Prettier.
- **Containerization:** one canonical image per service and one
  `docker-compose.yml` for single-host personal/default deployment. Optional
  Compose profiles may select packaging variants, while multi-host scaling
  requires an external container orchestrator.

#### Version Policy

- At initial implementation and each deliberate dependency-upgrade cycle, use
  the current Node.js LTS release and the latest stable mutually compatible
  versions of the selected packages.
- Do not use prerelease, beta, release-candidate, or nightly package versions
  unless explicitly approved for a specific requirement.
- Declare supported runtime/package version ranges in project manifests, commit
  the pnpm lockfile, and build containers from the locked dependency graph so
  development, CI, and deployments are reproducible.
- Pin the Node.js LTS major version in the repository and container base images.
  Moving to a newer LTS major or newer dependency set is an explicit tested
  upgrade, not an automatic deployment-time change.

---

## 5. Data Sources

This is the most important and most delicate part of the project. The desired data (quotes, fundamentals, news, earnings, macro) comes from external APIs with varying licenses, costs, and rate limits.

**Architectural requirement:** every external provider is encapsulated behind an **abstract provider interface** (adapter pattern), so providers are swappable without changing business logic. This lets you start with free tiers and upgrade later.

### 5.1 V1 Providers

The first vertical slice deliberately uses only two external providers:

| Capability | V1 provider |
|---|---|
| Stock, fund, and crypto discovery, delayed quotes, and price history | Yahoo Finance |
| Official daily FX reference rates | European Central Bank (ECB) |

Yahoo Finance is an unofficial integration whose availability, terms, and
response formats may change. It must remain isolated behind its provider
adapter, and Yahoo-specific identifiers or response structures must not leak
into business logic. Verify its suitability and terms at implementation and
deployment time.

The ECB adapter obtains official daily rates and applies the previously
specified last-available-rate fallback for weekends, public holidays, and
other non-publication dates.

V1 does not require external fundamentals, analyst estimates, news, earnings,
or broader macro-data integrations. The relevant service boundaries and
provider interfaces should still allow these capabilities to be added without
changing existing domain contracts.

### 5.2 V2 Provider Plan

V2 plans adapters for the following providers. Exact capability mapping,
fallback order, licensing, pricing, rate limits, and free-tier availability
must be verified when each adapter is implemented because they change
frequently.

| Provider | Planned capability |
|---|---|
| CoinGecko | Dedicated crypto market data |
| Alpha Vantage | Fundamentals and earnings data |
| Finnhub | Company news and market events |
| Financial Modeling Prep | Analyst targets, corporate actions, and expanded fundamentals |
| FRED | US macroeconomic data |

The V2 adapters are optional and independently configurable. No V2 provider is
a required runtime dependency when its capability is disabled. Comprehensive
fundamentals, analyst estimates, and news may require a paid provider tier.

### 5.3 Refresh And Freshness Policy

Only held or watched listings are actively refreshed. Refresh work is
deduplicated by listing and provider capability across users, so multiple
interested users do not cause duplicate provider requests. Default intervals
are globally configurable:

| Data | Default refresh |
|---|---|
| Held stock listing | Every 15 minutes while its exchange is open |
| Watched stock listing | Every 30 minutes while its exchange is open |
| Stock closing price | Once after the exchange closes |
| Held crypto listing | Every 15 minutes continuously |
| Watched crypto listing | Every 30 minutes continuously |
| Historical prices | Nightly reconciliation |
| ECB FX rates | Daily after publication and on demand when a required rate is missing |

Portfolio owns user watchlists and publishes listing-interest changes for
watchlist items and open positions through its transactional outbox to Redis
Streams. Each event includes a stable interest ID, listing ID, interest type
(`open_position` or `watchlist`), active state, and aggregate version.

Market consumes these events idempotently into its own materialized
refresh-interest projection. It consolidates all active interests into one
unique listing set; a listing remains eligible for refresh while at least one
position or watchlist interest exists. Market does not query portfolio storage
or Redis while scheduling each refresh.

Refresh requests are further deduplicated by provider, capability, and provider
listing identifier. Where a provider supports multi-symbol requests, market
batches listings and chunks requests according to that provider's limits.
Portfolio exposes an internal reconciliation snapshot/API so market can rebuild
or repair its refresh-interest projection after data loss or detected drift.

Every normalized quote response includes `price`, `currency`, `provider`,
`provider_timestamp`, `retrieved_at`, and `freshness_status`, where status is
`fresh`, `stale`, or `unavailable`. The frontend always displays the quote
timestamp and visibly marks stale or unavailable data.

Default stale thresholds are:
- A stock quote is stale after 30 minutes while its exchange is open.
- While an exchange is closed, a stock quote is stale when no closing price
  exists for the latest completed trading session.
- A crypto quote is stale after 30 minutes.
- An FX rate is stale only when the expected ECB publication and the
  last-available-rate fallback both fail.

Stale stored data remains usable for portfolio calculations. Portfolio reads
always use stored normalized data and never synchronously depend on Yahoo,
ECB, or another external provider.

### 5.4 Provider Resolution And Failure Handling

Provider identifiers are explicitly mapped to listings through
`listing_provider_identifiers`. Provider search results are suggestions only;
the user confirms the listing, exchange/venue, and currency before creating a
position.

Instrument discovery follows this service-owned flow:
1. The frontend sends a normalized search request to instruments.
2. Instruments calls market's internal provider-discovery API.
3. Market owns the Yahoo adapter and returns normalized suggestions without
   exposing Yahoo-specific response structures to instruments or the frontend.
4. Instruments checks existing instruments, listings, exchanges, and provider
   mappings and presents the normalized result for user confirmation.
5. After confirmation, instruments atomically creates or returns the existing
   records.

Duplicate creation is prevented with atomic upserts and stable unique
constraints: instrument identifier such as ISIN where available, listing
exchange MIC plus symbol, and provider plus provider-specific identifier.
Concurrent confirmations of the same result return the same existing records.

V1 has no automatic quote-provider fallback because Yahoo Finance is its only
quote provider. If Yahoo or ECB is temporarily unavailable, the market service
continues serving the last known normalized data and marks affected values
stale or unavailable as appropriate.

V2 provider priority and fallback order are configured separately per
capability. Fallback occurs only when the preferred provider fails or has no
data. Conflicting provider values are never silently merged, and every
normalized record preserves its provider and provider timestamp.

Provider calls use bounded exponential-backoff retries with jitter and a
circuit breaker. Provider health, last successful refresh, failure count, and
refresh latency are exposed as operational metrics.

### 5.5 Manual Valuations

Users may manually create unsupported instruments/listings and enter valuations
when no provider coverage exists. Manual valuations are user-owned, include
an effective timestamp and currency, and are stored separately from provider
quotes. They never overwrite imported provider records.

Use of a manual valuation as the active valuation source must be selected
explicitly. Positions and totals using manual valuations display a visible
manual-valuation badge.

### 5.6 Market Data Retention

Retention defaults are configurable and must comply with provider licensing:

| Data | Default retention |
|---|---|
| Latest normalized quote | Indefinitely |
| Daily closing prices | Indefinitely |
| ECB FX rates | Indefinitely |
| Intraday quotes | 90 days |
| Refresh execution metadata | 90 days |
| Successful raw provider payloads | Disabled by default; 7 days when enabled |
| Failed or unparseable provider payloads | 30 days |

---

## 6. Authentication And User Management

### 6.1 Pluggable Authentication
Authentication is designed to be **method-agnostic**. The
**authentication service is the single internal token authority**: regardless
of login method, the application issues its **own internal token/session** after
successful authentication, which all downstream services validate via the
authentication service's JWKS. Downstream services do not know the login
method.

Supported methods (configurable individually or simultaneously):
- **External OIDC (e.g. Authentik):** Authorization Code Flow with PKCE; after
  successful login the external identity is exchanged for an internal
  token/session through the edge authentication flow. This does not require a
  dedicated query/BFF service.
- **Internal/local authentication:** for operators without an external IdP. Local user store with a **proven library** (password hashing via **argon2id**), rate limiting/lockout, secure password reset. Conscious tradeoff: local auth increases the application's security responsibility (credential storage) — see §9.

- Internal access tokens are short-lived JWTs with a default lifetime of **15
  minutes**. Required claims are `sub` (user/service ID), `role`, `scopes`,
  `sid` (session ID for users), `iss`, `aud`, `iat`, `exp`, and `jti`.
- Roles provide broad administration while scopes grant service capabilities.
  Initial scopes include:
  - `profile:read`, `profile:write`
  - `portfolio:read`, `portfolio:write`
  - `instruments:read`, `instruments:write`
  - `market:read`, `fundamentals:read`, `events:read`
  - `insights:read`, `insights:write`
  - `users:read`, `users:write`, `system:admin`
- Every service enforces both the required scope and user resource
  ownership. A scope never grants access to another user's portfolio.
- Roles are `user` and `admin`.
- Admins manage application accounts and settings but do not automatically see or
  edit another user's portfolios.
- User-initiated synchronous calls propagate the user token or a short-lived
  delegated token. Background workers use service credentials with narrowly
  scoped service tokens and cannot impersonate users unless explicitly
  delegated.

### 6.2 Sessions, Recovery, And Setup
- Each browser/device has its own revocable session ID.
- Refresh tokens are opaque random tokens with a default lifetime of **30
  days**. Only refresh-token hashes are stored.
- Refresh tokens rotate on every use. Reuse detection revokes the entire
  affected session.
- Users can list and revoke their sessions. Logout revokes the current session.
  Password changes and successful password resets revoke all sessions; disabling
  a user also revokes all sessions.
- Browser refresh tokens use `HttpOnly`, `Secure`, and `SameSite=Lax` cookies.
  `SameSite=Strict` may be used when compatible with configured OIDC flows.
- Local password-reset tokens are high-entropy, single-use, stored only as
  hashes, and expire after **30–60 minutes**. Issuing a new token invalidates
  previous reset tokens. Reset requests are rate-limited and do not reveal
  whether an email exists.
- Password-reset delivery uses a pluggable notification adapter. Personal
  deployments also provide an admin/CLI reset flow.
- First-start HTTP setup requires a high-entropy one-time bootstrap token,
  works only before the initial admin exists, is rate-limited, and is
  permanently disabled after successful initialization. CLI bootstrap remains
  available.

### 6.3 Multi-User Model
- One application instance supports one or more users. There are no tenants,
  tenant memberships, tenant switching, or single-/multi-tenant operating
  modes.
- Personal use requires no separate architecture or immutable mode selection;
  it is simply an instance where only one user account exists.
- First-start setup selects active authentication method(s) and creates the
  initial admin. Application-level configuration may be changed later through
  explicit admin settings where supported.
- Public registration is disabled by default. Admins issue time-limited,
  single-use invitations containing email, role, expiry, and a hashed
  invitation token.
- Admins can invite users, revoke invitations, disable/reactivate users, change
  `user`/`admin` roles, revoke sessions, and manage application settings.
- The final active admin cannot be disabled, deleted, or demoted.
- Disabling is the normal reversible user-removal action. It immediately
  revokes all sessions and refresh tokens, prevents login, and preserves all
  user-owned data.
- Permanent user deletion is a separate explicit administrative operation with
  a destructive-action warning and confirmation. It cascade-deletes private
  user-owned portfolios, positions, transactions, transfer records,
  corporate-action applications, derived accounting records, cash flows,
  watchlists, insights, manual valuations, sessions, and credentials while
  preserving shared instruments, provider market data, fundamentals, and
  events. The final active admin cannot be permanently deleted.
- User isolation is enforced through mandatory application-level ownership
  checks on every user-owned resource. Global instrument data and
  provider-derived market data are shared; user-owned market records such as
  manual valuations remain filtered by user ownership. PostgreSQL Row-Level
  Security is optional defense-in-depth for later hardening, not a V1
  requirement.

---

## 7. Data Model (sketch)

**Persistence:** plain PostgreSQL to start. **TimescaleDB is deliberately not required yet** — with few users, a few dozen symbols, and delayed snapshots the quote table stays uncritical for a long time. Until then a **BRIN index** on the time column suffices. The later switch to TimescaleDB should be kept open, though (see design rules below).

Each service owns its tables and migrations. The default development/personal deployment uses **one PostgreSQL database** for the simplest possible setup. Separate databases on the same PostgreSQL server and separate PostgreSQL instances are optional deployment choices. Each service uses its own connection setting, which points to the shared database by default and may point to separate persistence in scaled deployments:

```text
AUTH_DATABASE_URL
INSTRUMENTS_DATABASE_URL
PORTFOLIO_DATABASE_URL
MARKET_DATABASE_URL
FUNDAMENTALS_DATABASE_URL
EVENTS_DATABASE_URL
INSIGHTS_DATABASE_URL
```

These URLs target the same database by default, but may target separate databases or PostgreSQL instances in scaled deployments. Service code must behave the same in both cases.

**Service persistence rules:**
1. Only the owning service writes its tables.
2. No cross-service SQL joins or transactions.
3. No database foreign keys across service ownership boundaries; store stable external IDs instead.
4. Cross-service reads and commands use HTTP APIs; propagation and background workflows use versioned events.
5. Consumers must be idempotent because integration-event delivery is at least
   once.
6. When an integration event is required for cross-service correctness, the
   producing service must write it to its service-owned transactional outbox in
   the same transaction as the business-state change.

**Initial table ownership:**
- **authentication:** `instance_config`, `users`, `invitations`,
  `local_credentials`, `refresh_tokens`, `user_preferences`, `tax_residencies`
- **instruments:** `instruments`, `listings`, `exchanges`,
  `listing_provider_identifiers`, `benchmark_catalog`
- **portfolio:** `portfolios`, `positions`, `transactions`,
  `realization_allocations`, `average_cost_realizations`, `position_transfers`,
  `cash_flows`, `position_corporate_action_applications`, `watchlist_items`
- **market:** `price_quotes`, `manual_valuations`, `fx_rates`,
  `data_refresh_state`, `refresh_interests`
- **fundamentals:** `fundamentals`
- **events:** `earnings`, `corporate_actions`, `news`, `macro_events`
- **insights:** `fair_value_estimates`, `price_targets`

For example, `portfolio.listing_id` is a stable reference to an
instruments-service listing identifier, while `events.instrument_id` is a
stable reference to its underlying instrument. These are not cross-service
database foreign keys. Applying a corporate action is an explicit portfolio
command initiated by the user through the frontend; the events service never
initiates or applies portfolio changes.

Core tables (details extensible):
- `instance_config` (**singleton**: active auth methods and application-level
  settings; initialized at first start)
- `users` (mapped to external OIDC subject *or* local account, role, active
  state)
- `invitations` (email, role, expiry, hashed single-use token, invited_by)
- `local_credentials` (user_id, argon2id hash, reset-token fields) — only when local auth is active
- `instruments` (name, asset type: equity/fund/crypto/index,
  ISIN/underlying identifiers, optional primary listing; index instruments are
  reference-only and cannot back portfolio positions)
- `exchanges` (ISO 10383 MIC, name, timezone, regular trading session, holiday calendar)
- `listings` (instrument_id, exchange_id/venue, symbol, listing currency, active state)
- `listing_provider_identifiers` (listing_id, provider, provider-specific symbol/identifier)
- `benchmark_catalog` (stable key, label, region, listing_id, active state) —
  instruments-owned curated benchmark entries that resolve directly to seeded
  index listings; initial keys represent MSCI World, S&P 500, DAX, and
  NASDAQ-100
- `user_preferences` (user_id, reporting currency, preferred combined-view
  headline metric, `combined_benchmark` resolving to a benchmark listing)
- `tax_residencies` (user_id, ISO country code, valid_from, optional
  valid_until, primary flag, confirmed_at) — authentication-owned,
  effective-dated source for selecting jurisdiction-specific labels and
  supported accounting policies; never inferred from locale, currency, or
  listing venue
- `portfolios` (user_id, name, manual sort order, archived state,
  preferred headline metric, optional preferred benchmark)
- `positions` (portfolio_id ↔ listing, derived open/closed/invalid state,
  last-valid calculated values, unique per portfolio/listing; one instrument
  may appear through multiple listings)
- `transactions` (position_id, buy/sell, effective_at, stable creation
  sequence, **quantity as `NUMERIC`/fractional-capable**, price,
  action-specific fee, currency, optional booking FX, tax-relevant value date,
  optional savings-plan flag) — authoritative user-entered trade records
- `realization_allocations` (sell_transaction_id, buy_transaction_id, quantity,
  accounting_method, calculation_version) — derived and rebuildable FIFO/LIFO
  consumption records
- `average_cost_realizations` (sell_transaction_id, average_cost_basis,
  quantity, calculation_version) — derived and rebuildable average-cost
  realization snapshots
- `position_transfers` (position_id, source_portfolio_id,
  destination_portfolio_id, transfer kind, optional selected fully-open buy-lot
  transaction IDs, effective_at, stable creation sequence) — authoritative
  internal transfers representing linked transfer-out and transfer-in
  attribution entries; excluded from combined all-portfolios external cash
  flows; splitting and moving only part of one buy lot remains deferred
- `cash_flows` (user_id, portfolio_id, optional position_id, optional
  corporate_action_id, optional corporate_action_application_id, type:
  dividend/deposit/withdrawal/cash_in_lieu/return_of_capital, gross_amount,
  withholding_tax, fee, net_amount, currency, payment_date, tax-relevant value
  date, note) — portfolio ID is required and is snapshotted for
  position-linked receipts; return-of-capital receipts are linked to their
  confirmed application and excluded from dividend income and external cash
  flows
- `price_quotes` (listing_id, time, price, currency, provider,
  provider_timestamp, retrieved_at, freshness_status) — normalized
  cache/history; store the **raw price** (see §9)
- `manual_valuations` (user_id, listing_id, effective_at, price, currency,
  created_by) — separate from provider quotes; active use is explicit
- `fx_rates`
- `fundamentals` (instrument_id, metrics, date, source)
- `fair_value_estimates` (instrument_id, optional user_id, method: DCF/analyst,
  value, assumptions, date) — analyst records are global; user models are
  private
- `price_targets` (instrument_id, optional listing_id, optional user_id,
  horizon short/medium/long, target zone low/high, source:
  own/analyst/technical) — analyst targets are global; own targets are
  user-owned and survive position lifecycle changes
- `earnings` (instrument_id, fiscal_year, fiscal_quarter, period_end_date, report date, eps_est/eps_actual, revenue_est/revenue_actual, surprise) — fiscal year/quarter separate from period end
- `corporate_actions` (stable action ID, immutable version, instrument_id, type:
  split/reverse_split/dividend/buyback/spinoff/return_of_capital/capital_increase,
  ex-date, type-specific fields; for return of capital: amount per share and
  currency; for spin-off: child instrument identifier, distributed-quantity
  ratio, optional basis-allocation ratio; for capital increase: new shares,
  subscription price, shares before/after, dilution ratio; optional raw payload
  as JSONB) — **unique (action ID, version)**
- `position_corporate_action_applications` (position_id, corporate_action_id,
  corporate_action_version, signed_action_snapshot, token_signature_hash,
  action-specific applied values and override provenance, effective_at, stable
  creation sequence, optional fractional_handling, optional spin-off treatment
  and child listing ID, applied_by, applied_at, reversed_at) — authoritative
  position-ledger records that trigger deterministic rebuilds of derived
  position/accounting state; preserve all records for audit and enforce **unique
  (position_id, corporate_action_id) where reversed_at is null** so only one
  active application exists
- `news` (instrument_id, time, source, headline, URL, sentiment, optional raw payload as JSONB) — relational, filterable
- `macro_events` (type, time, region, description)
- `watchlist_items` (user_id, listing_id, created_at) — owned by
  portfolio; user-level interest rather than portfolio membership
- `refresh_interests` (interest_id, listing_id, interest_type, active,
  aggregate_version, updated_at) — market-owned materialized projection used
  for consolidated refresh scheduling

**Design rules for `price_quotes` (so the Timescale migration stays ~free later):**
1. A `timestamptz NOT NULL` column as the future partitioning axis.
2. Every unique/primary-key index **must include the time column**.
3. **No foreign keys from other tables *into* `price_quotes`** (hypertables don't support that); reference listings/instruments instead.

> **Concrete implementation:** the existing migrations and development seeds are the starting point, but must be updated to reflect the service ownership and domain decisions in this specification. The default migration flow applies all service-owned migrations to one database; scaled deployments can apply the same ownership-specific migrations to separate databases. Seeds must use the same contracts and remain valid for the default shared-database setup.

---

## 8. UI/UX
- **Modern, card-based dashboard** as the central element (explicitly requested by the owner).
- In a selected-portfolio view, display one card per position. In the combined
  all-portfolios view, aggregate holdings of the same instrument into one card
  as described below.
- Selected-portfolio position cards display current price + daily %,
  performance since purchase (€ and %), and a mini sparkline. P/E, fair-value
  badges, and next earnings dates appear when those later-stage data
  capabilities are available; they are not required for the Yahoo/ECB-only V1
  vertical slice. Combined cards follow the aggregation rules below.
- Detail view per instrument/listing: authoritative transactions, corporate
  action applications, calculated lot allocations, and available metrics.
  Calculated lot allocations are read-only derived results.
  Fair-value calculation with editable assumptions, own + analyst target zones,
  news, and event timeline are added as their later-stage capabilities become
  available.
- Open positions are listed by default. Closed positions remain available, carry a clear **closed** badge, and continue to contribute their realized P&L and dividends to historical portfolio performance.
- Invalid positions display a prominent error state, such as an exclamation
  badge, with the invalid transaction and reason identified. Transaction
  editing remains available so the user can repair the history.
- The default portfolio-section view combines metrics and assets from all
  portfolios owned by the user. Selecting a portfolio filters all displayed
  metrics and assets to that portfolio.
- In the combined view, holdings of the same security across multiple
  portfolios are aggregated into one asset card. The card displays all
  contributing portfolio badges; two or more portfolios therefore produce two
  or more badges.
- A combined instrument card displays aggregate quantity, reporting-currency
  market value, realized and unrealized P&L, dividends, and a value-weighted
  daily percentage change. When its contributing positions use multiple
  listings or currencies, it displays separate listing-specific price rows
  rather than implying that the instrument has one current market price.
- When no portfolio exists, the portfolio section displays a form to create the
  first portfolio.
- Archived portfolios are hidden from normal portfolio views and excluded from
  all combined metrics and assets. Portfolio management displays them with an
  **archived** badge and offers an unarchive action.
- Portfolio overview: total value, daily change, allocation, realized P&L, unrealized P&L, and dividends in the user's configured reporting currency.
- Performance views allow the user to inspect all supported metrics and select a preferred headline metric without hiding the underlying values.
- The preferred headline metric is configured per portfolio.
- The combined all-portfolios view uses a separate preferred headline metric
  configured per user.
- Responsive, dark-mode capable, clear separation between fact / model / own assessment in the presentation.

---

## 9. Risks / Design Decisions to Address Deliberately
The implementer should actively surface these rather than gloss over them:
1. **Data licenses & cost** determine the realistic feature scope — clarify early (see §5).
2. **Intrinsic value** is a model, not a fact — make method and assumptions transparent.
3. **Price targets** honestly separated by origin (own / analyst / technical), suggesting no pseudo-forecast.
4. **Rate limits** respected via scheduler + cache + "only refresh relevant symbols"; delayed data is intended.
5. **Currency conversion:** preserve original transaction/market currencies and
   convert portfolio totals into the user's configured reporting currency.
   Historical realized P&L and dividends use the official daily FX rate for the
   tax-relevant value date. The market service obtains missing required rates
   from ECB reference rates. If no rate is published for that date, it uses the
   most recent previously available ECB rate. Separate FX-effect analysis is
   deliberately out of scope.
6. **Split-adjusted price history (later stage):** `price_quotes` stores the **raw price** (what the market actually showed that day), so the past stays immutable and honest. After a split, raw-pre-split (e.g. 400) is not directly comparable to raw-post-split (100) — a naive chart would otherwise show a phantom crash. The adjustment is computed **for chart display** when needed, using `corporate_actions` as the adjustment factor. Deliberately **not** part of the first vertical slice, but an explicitly flagged later stage.
7. **Local authentication = increased security responsibility:** with local auth active, the application stores credentials itself. Only via proven libraries (argon2id), with rate limiting/lockout and secure reset. Prefer external OIDC where possible; local auth is the fallback for operators without an IdP.
8. **User isolation:** the application has no tenant layer. Every user-owned
   record is scoped directly by `user_id`, and mandatory authorization checks
   prevent access to another user's data. Optional RLS may be added later as
   defense-in-depth. Personal use is the same deployment with only one account.
9. **Exact decimal arithmetic:** quantities and monetary amounts consistently as `NUMERIC` (no `float`/`double`), to avoid rounding errors across many small savings-plan executions. Quantity scale generous (at least 8 decimal places — covers BTC down to satoshi and arbitrary fractions), uniform across all asset classes.

### 9.1 Operational Requirements

#### Health Endpoints

Every service exposes internal endpoints:
- `GET /health/live` confirms that the process and event loop are responsive.
  It does not check external dependencies.
- `GET /health/ready` confirms that the service can safely receive traffic by
  checking required PostgreSQL/Redis dependencies, required configuration and
  secrets, and compatible database schema version.
- `GET /health/startup` supports slow startup and migration orchestration.

External providers such as Yahoo Finance and ECB never affect service
readiness. Their failures are represented as degraded provider health and
operational metrics. Where practical, independently deployed background workers
have readiness separate from user-facing HTTP APIs.

#### Structured Logs

Services write structured JSON logs to stdout/stderr. Relevant entries include:
`timestamp`, `level`, `service`, `service_version`, `environment`, `message`,
`request_id`, `correlation_id`, `event_id`, `trace_id`, `user_id`,
`operation`, `duration_ms`, and `error_code`.

Only fields relevant to the entry are emitted. HTTP request logs include method,
route template, status, and duration. Errors include sanitized exception type
and stack trace. Logs never contain passwords, tokens, cookies, authorization
headers, secrets, complete provider payloads, or sensitive portfolio values by
default. Logs remain useful without requiring a centralized logging platform.

#### Metrics

Every service exposes internal Prometheus-compatible metrics for:
- HTTP request count, latency, and error count by route template/status.
- Process memory, CPU, uptime, and event-loop delay.
- PostgreSQL connection-pool usage and query failures.
- Redis connection failures and operation latency.
- Outbox pending count and oldest pending age.
- Redis consumer pending count, retries, DLQ depth, and oldest entry age.
- Background-job duration, success, and failure counts.
- Provider requests, rate limits, latency, circuit-breaker state, and last
  successful refresh.
- Invalid position count and failed recalculation count.

User IDs, listing IDs, and symbols are prohibited as metric labels
to prevent excessive label cardinality.

#### Backup And Restore

Personal deployments provide a scheduled backup container or script:
- Create a nightly PostgreSQL `pg_dump` in custom format.
- Retain seven daily and four weekly backups by default.
- Write backups to a configurable mounted directory and encrypt them when
  stored outside the host.
- Verify every backup using `pg_restore --list`.
- Document restoration and perform a test restore regularly.

Initial personal-deployment objectives are a **24-hour RPO** and **four-hour
RTO**. Scaled deployments may configure stricter objectives and PostgreSQL
point-in-time recovery.

PostgreSQL is the durable recovery source. Redis AOF supports normal restarts,
but Redis does not require backup for domain recovery. After Redis loss,
service-owned projections and streams are rebuilt or reconciled from
PostgreSQL.

#### Migrations And Recovery

Migrations are forward-only and service-owned:
- Back up PostgreSQL before production migrations.
- Apply migrations before starting the corresponding new service version.
- Use an advisory lock to prevent concurrent migration execution.
- Migrations are restartable or fail safely.
- Prefer expand-and-contract migrations for breaking changes.
- Do not automatically execute destructive down migrations.
- Recovery normally fixes the migration and rolls forward. Restore backup only
  when rolling forward is unsafe or impossible.
- A service remains unready when its schema version is incompatible.

#### Secret Management

Local development may use uncommitted `.env` files. A committed `.env.example`
contains placeholders only.

Deployed environments prefer mounted secret files or Docker/Compose secrets,
with environment variables supported as a fallback. Credentials are separate
per service and support rotation without rebuilding images. Signing keys are
mounted files with restricted permissions. Secrets never appear in databases,
container images, logs, or frontend bundles. A dedicated vault is optional for
scaled deployments and is not required for V1.

#### Retention

Retention defaults are configurable:

| Data | Default retention |
|---|---|
| Active refresh-token hashes | Until expiry or revocation |
| Expired/revoked refresh-token records | 30 days |
| Security/session events | 180 days |
| Corporate actions and earnings | Indefinitely |
| User-visible notifications | 90 days |
| News metadata | 1 year |
| Daily closing prices and FX rates | Indefinitely |
| Intraday quotes | 90 days |
| Successful raw provider payloads | Disabled by default; 7 days when enabled |
| Failed or unparseable provider payloads | 30 days |
| Application logs | 30 days |
| Operational metrics | 30 days |
| Redis source streams | 7 days |
| Redis DLQs | 30 days |

Retention cleanup jobs run periodically, delete in bounded batches, and expose
success/failure metrics. Provider-data retention remains subject to provider
licensing.

### 9.2 Deferred Decisions
Unresolved product and architecture decisions are tracked in
[`open-decisions.md`](open-decisions.md). They must not be chosen implicitly by
the implementer. When a decision is made, update both that decision record and
the relevant requirements in this specification.

Smaller explicitly deferred follow-ups include:
- **Single-lot transfer splitting:** moving a partial quantity from one open buy
  lot. This requires a durable lot-split/provenance model before implementation;
  moving whole fully-open lots is already supported.
- **Additional benchmark-relative risk metrics:** beta, correlation, and
  annualized tracking error form the current baseline. The later metric set
  beyond that baseline, such as information ratio, alpha, and
  upside/downside-capture measures, remains a product decision.

The combined all-portfolios benchmark is not deferred: it is an independent,
authentication-owned user preference stored as
`user_preferences.combined_benchmark`.

> This application is a tool for preparing information, not investment advice. Valuations and target zones are decision aids, not guarantees.

---

## 10. Desired Deliverables (for the implementer)
1. Repo structure as a pnpm mono-repo with `services/*`, `web/`, and
   purpose-specific `packages/*`. Every backend service follows the internal
   feature-first ports-and-adapters structure from §4.2 and includes its own
   service README.
2. `docker-compose.yml` (all services + one PostgreSQL database + Redis/Redis
   Streams) with single-host service scaling and the ability to point services
   to separate databases or PostgreSQL instances. Multi-host deployment remains
   an orchestrator-specific scaled profile outside the default Compose setup.
3. Provider adapter interfaces plus V1 Yahoo Finance and ECB implementations,
   configured through environment variables. V2 provider adapters remain
   independently addable and optional.
4. Updated service-owned database migrations and development seeds for the model from §7. The default migration/seed flow applies everything to one database; scaled deployments may apply the same ownership-specific migrations to separate databases or PostgreSQL instances.
5. **First-start setup**: choice of active auth method(s), creation of the
   initial admin, and initialization of `instance_config`. A reference
   implementation is included as `bootstrap.ts` (idempotent, transactional,
   advisory lock, argon2id), usable both as a CLI and from a setup endpoint of
   authentication. For development, `seed.sql` (DEV-only sample data) is
   provided.
6. Auth: **external OIDC against Authentik** (Code Flow + PKCE, JWT validation) **and** local authentication (argon2id), behind the authentication as the central token authority.
7. Runnable dashboard with card layout and at least one complete security detail view.
8. README with setup, required API keys/env variables, Authentik configuration,
   initial-admin creation, invitations, and user management.
9. Documented personal/default and scaled deployment profiles, including how service-specific database URLs point to one shared database by default or to separate databases/PostgreSQL instances optionally.
10. Internal health and Prometheus-compatible metrics endpoints, structured JSON
    logging, documented retention cleanup jobs, and operational tests.
11. A personal-deployment PostgreSQL backup/restore script or container with
    scheduling, retention, verification, and restoration documentation.
12. CI-enforced architecture checks covering forbidden dependency directions,
    cross-service source imports, package public APIs, type checking, contract
    tests, and representative module-boundary tests.

The **first vertical slice** is an initial subset of V1: first-start setup →
login (local or OIDC) → create a portfolio → add a position → delayed price +
daily % + performance since purchase visible in a card. Completing that slice
validates the architecture but does not constitute the complete V1 release.

The **complete V1** includes every capability explicitly marked as V1 in this
specification, including multiple portfolios, supported accounting-method
changes, manually entered dividends/deposits/withdrawals, corporate-action
application, and reporting. Extend fundamentals, events, and valuation
iteratively according to their stated scope.
