# Missing Features For The Adaptive Analyst Dashboard

## Purpose

This document compares the proposed **Adaptive Analyst** dashboard against the
currently implemented services, public APIs, database schema, and frontend
contracts.

The target dashboard contains:

- A combined or selected-portfolio header with current value, daily change,
  invested capital, and total return.
- A historical portfolio-performance chart with period selection and benchmark
  comparison.
- A portfolio-intelligence rail containing concentration, biggest mover,
  dividend income, allocation, and later risk insights.
- Holdings grouped by equities, crypto, and funds, with current values, returns,
  and mini sparklines.
- Allocation and cross-portfolio activity views.
- A small watchlist view, global instrument search, market-session status,
  light/dark mode, and a global add-transaction action.

The planned events service is a known future dependency. News, earnings,
corporate-action suggestions, macro events, and the event timeline are listed
as deferred dependencies rather than unexpected gaps.

## Executive Summary

The current platform can already render a useful current-state holdings
dashboard. It has portfolios, positions, transactions, latest quotes, listing
price series, FX rates, watchlist items, fundamentals, fair values, and price
targets.

The main gap is not raw market data. It is the absence of portfolio-level
reporting read models and APIs. The frontend currently downloads individual
positions and calculates a few totals itself. That is insufficient for
historical portfolio performance, mathematically correct aggregate returns,
combined holdings, dividends, benchmark comparison, or risk metrics.

Before the full dashboard is built, the highest-priority work is:

1. Correct the current portfolio accounting/reporting semantics.
2. Add portfolio summary, historical series, and combined-holdings reporting.
3. Implement portfolio cash-flow and dividend APIs.
4. Support `fund` consistently across service and frontend contracts.
5. Add benchmark, activity-feed, and dashboard-oriented batch reads.

## What Is Already Available

| Dashboard requirement | Current source | Current status |
| --- | --- | --- |
| Portfolio selector | `GET /portfolios` | Available |
| Selected-portfolio positions | `GET /positions?portfolio_id=...` | Available |
| Combined positions from active portfolios | `GET /positions` | Available as separate positions |
| Current price and current position value | Portfolio position view enriched by market quotes | Available |
| Open cost basis, realized P&L, unrealized P&L, fees, simple return, total return | Position performance calculation | Available per position, with correctness limitations below |
| Listing price history | `GET /quotes/:listingId/series` | Available per listing, maximum 365 points |
| Watchlist with latest quote | `GET /watchlist` | Available |
| Instrument catalog search | `GET /instruments/search` | Available for confirmed catalog instruments |
| Exchange timezone and regular session | `GET /exchanges` | Available |
| Fundamentals | `GET /fundamentals` | Available |
| Fair values and price targets | Insights APIs | Available |
| Events, news, earnings, macro calendar | Planned events service | Deferred as expected |

The current dashboard can derive current allocation percentages, a basic
largest-position concentration warning, and percentage-based top movers from
the existing position response. These are suitable as temporary frontend
calculations, but should eventually come from the same reporting snapshot as
the headline totals.

## P0: Correctness And Domain Blockers

These issues should be addressed before treating the dashboard totals as an
authoritative portfolio report.

### 1. No Portfolio-Level Reporting Calculation

The portfolio service returns performance per position. The frontend sums
selected monetary fields in `PortfolioSummary`, but there is no authoritative
portfolio-level calculation for:

- Current value.
- Invested capital.
- Daily change amount and percentage.
- Realized, unrealized, dividend, fee, and total P&L.
- Total return.
- XIRR.
- The configured preferred headline metric.

Aggregate percentages must be calculated from their underlying cash amounts and
denominators. They cannot be produced by summing or averaging position
percentages without explicit weighting rules.

**Needed:** a portfolio-owned reporting use case that returns one internally
consistent snapshot for a selected portfolio or the combined active-portfolios
view.

### 2. Combined Holdings Are Not Aggregated By Instrument

`GET /positions` returns one position per portfolio/listing. The combined
dashboard currently renders those positions separately.

The product specification requires the combined view to aggregate the same
underlying instrument across portfolios while retaining:

- Contributing portfolio badges.
- Listing-specific price rows when multiple listings or currencies contribute.
- Aggregate quantity, market value, realized/unrealized P&L, dividends, and
  value-weighted daily movement.

**Needed:** an instrument-grouped combined-holdings read model in the portfolio
service. Accounting must remain listing-specific before the results are
aggregated.

### 3. Historical FX Rules Are Not Applied To Realized Amounts

The current position view converts open cost basis, realized P&L, and fees with
the latest available FX conversion. The specification requires historical
realized P&L, fees, and dividends to use the official daily FX rate for their
tax-relevant value date, falling back to the most recent preceding ECB rate.

Transactions contain `booking_fx_rate` and `tax_relevant_value_date`, and the
market service stores historical FX rates, but the position calculation does
not use them.

**Needed:** historical conversion during ledger realization and portfolio
reporting, with explicit tests for weekends, holidays, partial sells, and mixed
currencies.

### 4. Daily Change Is Not A Reliable Prior-Close Calculation

The market quote repository defines `previous` as the second-most-recent stored
quote. That point is not guaranteed to be the prior trading-session close. It
may be another intraday tick.

The current dashboard also estimates absolute daily movement by multiplying
current value by the percentage change. Exact daily P&L should be based on
quantity multiplied by the difference between latest price and the appropriate
prior close, converted to reporting currency.

**Needed:** market-level prior-close semantics based on listing exchange,
timezone, trading session, and holiday calendar; then expose exact daily
change amount and percentage through portfolio reporting.

### 5. Dividends And Other Cash Flows Have No Service Implementation

The database contains `portfolio.cash_flows`, but the portfolio service has no
cash-flow repository mapping, application module, or public endpoints.
Consequently, the dashboard cannot report:

- Received dividends.
- Annual or trailing-twelve-month dividend income.
- Yield on cost or income return.
- Deposits and withdrawals.
- Correct total return including dividends.
- XIRR or time-weighted returns using external cash flows.
- Cash-flow items in recent activity.

**Needed:** portfolio-owned CRUD/read APIs for dividends, deposits,
withdrawals, and cash-in-lieu, plus integration into reporting calculations.
The future events service may suggest objective dividend facts, but user
receipt confirmation remains owned by portfolio.

### 6. `fund` Is In The Database But Rejected By Implemented Contracts

The database allows `equity`, `fund`, and `crypto`, and the development seed
contains funds. However, the instruments domain, portfolio listing summaries,
watchlist views, frontend types, and manual add-position form only support
`equity | crypto`.

**Needed:** add `fund` to all service contracts, validation, frontend types,
filters, visual themes, formatting behavior, tests, and discovery/create flows.

### 7. Derived Accounting Records Are Schema-Only

The schema contains realization allocations, average-cost realization
snapshots, position transfers, and corporate-action applications. The current
portfolio service does not expose or persist these through implemented modules.

This does not block a first visual dashboard, but it blocks a complete,
auditable reporting implementation and correct historical reconstruction after
transfers or corporate actions.

## P1: Missing Dashboard Read Models And APIs

### Portfolio Summary Snapshot

Add a portfolio reporting response for either a selected portfolio or all
active portfolios. It should include:

- Snapshot timestamp, reporting currency, quote freshness, and completeness.
- Current value and invested capital.
- Daily change amount and percentage.
- Realized P&L, unrealized P&L, dividends, fees, and total P&L.
- Simple return, total return, and XIRR.
- Preferred headline metric and preferred benchmark.
- Counts of open, closed, invalid, stale, and unavailable positions.

This response should be authoritative and shared by the header, allocation
view, and intelligence rail.

### Historical Portfolio Performance Series

The market service provides price history per listing, but no service rebuilds
the portfolio's value through time.

The chart needs a portfolio-owned historical series that replays:

- Buys and sells.
- Position closures and reopened positions.
- Historical listing prices.
- Historical FX rates.
- Dividends, deposits, and withdrawals.
- Transfers and applied corporate actions when those modules are implemented.

It should support at least `1W`, `1M`, `YTD`, `1Y`, and `ALL`, with extensible
periods and downsampling. Each point should distinguish market value,
contributed capital, cumulative P&L, and return so the UI does not infer one
from another.

### Benchmark Catalog, Series, And Comparison

Preferred benchmark columns already exist in the database, but:

- Portfolio list responses omit `preferred_benchmark`.
- User profile responses omit `combined_benchmark`.
- No endpoint updates a portfolio's headline metric or benchmark.
- No benchmark catalog or market-series mapping exists.
- No portfolio-versus-benchmark calculation exists.

**Needed:** benchmark identifiers and listing mappings, benchmark history,
preference read/write contracts, and period-relative comparison calculations.
Initial benchmarks are MSCI World, S&P 500, DAX, and NASDAQ-100.

### Allocation Breakdown

Current holding allocation by market value can be derived in the frontend, but
the full allocation tab needs a reporting breakdown by:

- Instrument.
- Asset type.
- Portfolio.
- Currency.
- Optionally geography, sector, or industry when reliable classification data
  is introduced.

Allocation responses should be based on the same snapshot and completeness
rules as the portfolio summary.

### Portfolio Intelligence Metrics

The proposed right rail needs the following calculations:

| Intelligence item | Current feasibility | Missing work |
| --- | --- | --- |
| Largest-position concentration | Derivable from current position values | Server-side reporting value and configurable warning thresholds |
| Biggest daily mover | Partially derivable from daily percentage | Correct prior-close semantics, absolute impact, and grouped-instrument handling |
| Dividend income | Not available | Cash-flow service and income aggregation |
| Asset allocation | Derivable at a basic level | Authoritative grouped reporting response |
| Volatility, drawdown, Sharpe, best/worst period | Not available | Historical portfolio return series and risk calculator |
| Benchmark-relative return | Not available | Benchmark data and comparison calculator |
| Closed-position win rate | Not available | Portfolio-level realization aggregation |

### Cross-Portfolio Activity Feed

Transactions are only returned inside one position detail response. There is no
user- or portfolio-level recent activity endpoint.

**Needed:** a chronological, paginated portfolio activity read model containing
buys, sells, dividends, deposits, withdrawals, transfers, and applied/reversed
corporate actions. Future events/news should remain a separate feed unless the
frontend deliberately combines them.

### Holdings Dashboard Read

The current position list is a reasonable base, but the grouped holdings table
would benefit from one dashboard-oriented response containing:

- Combined instrument groups and contributing portfolios.
- Listing-specific prices and currencies.
- Allocation and absolute daily impact.
- Short price series or precomputed sparkline points.
- Relevant freshness and invalid-state details.
- Optional fair-value/target summary without one request per instrument.

Without this response, the frontend must issue many per-listing and
per-instrument requests to render sparklines and insights.

### Watchlist Dashboard Read

The current watchlist response includes the latest price and daily percentage,
but not sparkline data, fair-value summary, next event, or target distance.
A dashboard widget would otherwise require multiple calls per row.

## P2: Supporting Information And Product Polish

### Global Search And Add Transaction

Catalog search exists, but it only searches already confirmed instruments. The
provider-backed discovery flow is internal and is not composed into a complete
public frontend workflow.

The global add-transaction control also needs a workflow that can search
positions/listings and then create a buy or sell without first navigating to a
position detail page.

### Market Session Status

Exchange regular hours and timezones are available. A reliable `Open`,
`Pre-market`, `Closed`, or `Holiday` indicator is not.

Missing pieces include:

- Holiday-calendar evaluation.
- Explicit session-state calculation.
- Listing exchange information in the position summary.
- Defined behavior for crypto venues that trade continuously.

### Asset Logos And Classification Metadata

There is no logo/image source or stable asset metadata for sector, industry,
country, or fund category. Logos are visual polish; classification metadata is
required before allocation can be broken down beyond asset type, portfolio,
and currency.

### Theme Preference

The frontend is currently dark-only and hardcodes slate colors. Light/dark mode
can initially be implemented entirely in the frontend with semantic design
tokens and local storage.

If theme should follow the user across devices, add a theme preference to the
authentication profile contract and persistence.

## Known Events-Service Dependency

The events schema already describes earnings, corporate actions, news, and
macro events, but the service is not implemented yet, as expected.

Once implemented, the dashboard can add:

- Upcoming earnings and dividend dates.
- Corporate-action alerts and application workflows.
- Instrument news and sentiment.
- Macro calendar items.
- An event timeline in position details.

The portfolio dashboard should not block its initial reporting implementation
on the events service. Its data contracts should leave clear extension points
for upcoming events and event-linked activity.

## Recommended Service Ownership

The existing architecture states that the frontend performs dashboard
composition and that a dedicated query/BFF service should not be introduced
without measured need. The missing capabilities should therefore remain with
their owning services:

| Capability | Owning service |
| --- | --- |
| Portfolio summary, historical performance, allocation, combined holdings, activity, income, and risk metrics | `portfolio` |
| Historical quotes, prior close, benchmark price series, FX rates, and session-derived market facts | `market` |
| Instrument/listing/fund support, exchange metadata, and future classifications | `instruments` |
| User combined benchmark, headline metric, and optional cross-device theme preference | `authentication` |
| Portfolio preferred benchmark and preferred headline metric | `portfolio` |
| Earnings, corporate actions, news, and macro calendar | future `events` |
| Fair-value and price-target summaries | `insights` |

The frontend can compose these public APIs in parallel. Dashboard-oriented
batch endpoints should be added where the alternative creates N+1 requests or
risks inconsistent snapshots.

## Recommended Implementation Order

### Phase 1: Reliable Current-State Dashboard

1. Add consistent `fund` support.
2. Correct prior-close and daily-change calculations.
3. Apply historical FX rules to realized amounts and fees.
4. Implement cash-flow/dividend APIs.
5. Add authoritative portfolio summary and combined-holdings reporting.
6. Add grouped allocation and top-mover values from the same snapshot.

### Phase 2: Historical And Comparative Dashboard

1. Implement historical portfolio reconstruction and period series.
2. Implement XIRR and period-based total returns.
3. Expose and update portfolio/user benchmark preferences.
4. Add benchmark catalog, series, and relative-return calculations.
5. Add the cross-portfolio activity feed.

### Phase 3: Intelligence And Enrichment

1. Add volatility, drawdown, Sharpe, best/worst period, and win-rate metrics.
2. Add dividend-income views and projections.
3. Add batched holdings/watchlist sparklines and insight summaries.
4. Integrate the future events service.
5. Add classifications, logos, session status, and cross-device theme
   preference where useful.

## Minimum Backend Contract Before Building The Full Visual Design

The Adaptive Analyst dashboard can be implemented without placeholders once
the frontend can obtain, for a selected or combined portfolio scope:

1. One authoritative current summary snapshot.
2. One grouped holdings response.
3. One allocation/intelligence response derived from that snapshot.
4. One period-based historical portfolio series.
5. One paginated activity response.
6. Watchlist rows with batched short series.
7. Benchmark preferences and optional benchmark comparison.

Until those contracts exist, the visual design can still be introduced
incrementally, but the performance chart, dividend income, benchmark
comparison, activity tab, and advanced intelligence panels would require
placeholders or potentially incorrect frontend-derived values.
