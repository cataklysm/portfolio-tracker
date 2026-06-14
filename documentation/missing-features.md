# Missing Features For The Portfolio Tracker

## Purpose

This document records the remaining gaps between the current services/web UI and
the intended full-featured financial dashboard. It reflects the repository state
as of June 14, 2026.

The platform now provides a strong current-state portfolio view. The largest
remaining gaps are reliable multi-broker consolidation and reconciliation,
historical portfolio performance, cross-portfolio activity, benchmark
comparison, advanced risk analytics, and auditable transaction-level P&L
attribution.

## Implemented Since The Original Audit

The following items previously listed as missing are now implemented.

| Capability | Current implementation |
| --- | --- |
| Authoritative portfolio summary | `GET /reporting/summary`, selected or combined portfolio scope |
| Consolidated holdings by instrument | `GET /reporting/holdings`, including contributing portfolios and listing rows |
| Allocation and basic intelligence | `GET /reporting/allocation`, by instrument, asset type, portfolio, and currency |
| Reporting web UI | `/reports`, backed by the portfolio reporting endpoints |
| Cash-flow CRUD | Portfolio-owned dividend, deposit, withdrawal, and cash-in-lieu endpoints |
| Dividends in reporting | Summary and consolidated holdings include historically converted received dividends |
| Historical FX for realized values | Realized P&L, transaction fees, and reporting dividends use tax-relevant value-date FX |
| Exact daily-change arithmetic | Position performance uses held quantity multiplied by latest-versus-prior-day price |
| Transaction-level P&L attribution | `GET /positions/:id` transactions carry a `performance` object: per-sell realized P&L (value-date FX) and per-buy open-lot unrealized P&L (FIFO/LIFO, latest FX); average-cost buy remainders are null |
| Recorded broker tax + after-tax P&L | `portfolio.tax_events` ledger (`/tax-events` CRUD, per-component withheld/refunded, optional links), effective-dated tax residence (`/tax-residency`, auth-owned), and `GET /reporting/tax` reconciling gross realized P&L with net actual tax; web tax centre + residence settings |
| Persisted realization allocations | Each recalculation writes FIFO/LIFO lot consumption + average-cost realizations to the audit tables (versioned, atomic replace); `GET /positions/:id/allocations` |
| `fund` support | Supported by instruments, portfolio contracts, frontend contracts, and dashboard grouping |
| Events service | Earnings, corporate actions, news, refresh workflows, and web pages are implemented |
| Notifications service | Inbox, asset-scoped rules, alert evaluation, header badge, settings, and asset-detail UI |
| Asset detail enrichment | Fundamentals, fair values, price targets, events, news, alerts, and selectable price-chart periods |
| Theme support | Light/dark theme toggle using frontend persistence |
| Global holdings search | Header search navigates to existing position details |

## Current Authoritative Reporting Contracts

The portfolio service owns the current reporting snapshot:

- `GET /reporting/summary`
  - Current value, invested capital, daily change, realized/unrealized P&L,
    dividends, fees, total P&L, returns, completeness, and state counts.
- `GET /reporting/holdings`
  - Instrument-grouped holdings across portfolios, listing rows, market value,
    cost basis, P&L, dividends, daily impact, and weights.
- `GET /reporting/allocation`
  - Allocation by instrument, asset type, portfolio, and currency, plus largest
    concentration and top mover.

The dashboard still derives some values from raw positions for its interactive
holding rows. The `/reports` page uses the authoritative reporting endpoints.
The dashboard should progressively consume these report contracts where doing
so removes duplicate calculations or avoids disagreement.

## P0: Transaction-Level Realized And Unrealized P&L

> **Status: implemented 2026-06-14 (derive-on-read).** The realization engine now
> retains transaction identity and emits a per-transaction attribution
> (`byTransaction`): per-sell realized P&L / consumed cost / consumed quantity,
> and per-buy remaining quantity / remaining cost basis for FIFO/LIFO (null under
> average cost). `GET /positions/:id` returns a nested `performance` object per
> transaction (realized in value-date FX, open-lot unrealized in latest FX), and
> the web transaction table shows Realized and Unrealized P&L columns in the
> reporting currency. Persisting derived allocations (`realization_allocations`,
> `average_cost_realizations`) and the after-tax extension below remain open.

### Current State

The position accounting engine already calculates:

- Position-level realized P&L under FIFO, LIFO, or average-cost accounting.
- Position-level open quantity and open cost basis.
- Position-level unrealized P&L using the latest price.
- Historical reporting-currency conversion for each sell's realized P&L.
- Historical reporting-currency conversion for each transaction fee.

However, `GET /positions/:id` returns raw transactions without P&L attribution:

```text
id, side, effective_at, quantity, price, fee, currency,
tax_relevant_value_date, savings_plan, note
```

The realization engine emits sell P&L events tagged only with currency and value
date. It does not retain the originating transaction ID. Open lots also do not
retain their buy transaction IDs. Therefore the web table cannot reliably map
position-level values back to individual rows.

### Correct Column Semantics

#### Realized P&L

- Applies to sell transactions only.
- Equals sell proceeds minus sell fee minus the cost basis consumed by that
  sell under the selected accounting method.
- Should be blank for buy transactions, not zero.
- Should be returned in both transaction currency and reporting currency.
- Reporting-currency realized P&L must use the sell transaction's
  `tax_relevant_value_date`.
- Dividends remain separate cash flows and must not be included in a sell row's
  realized P&L.

#### Unrealized P&L

- Applies only to remaining open buy-lot quantity.
- Should be blank for sell transactions and fully consumed buy lots.
- Under FIFO/LIFO, it can be attributed authoritatively to each remaining buy
  lot because lot identity is meaningful.
- Under average-cost accounting, cost basis is pooled. A per-buy unrealized P&L
  is not inherently authoritative. The UI should either:
  1. Show unrealized P&L only at position level, which is recommended; or
  2. Explicitly label a proportional per-buy allocation as informational.

The recommended first implementation is:

- Realized P&L column on sell rows for all accounting methods.
- Remaining quantity and unrealized P&L on buy rows only for FIFO/LIFO.
- Blank per-transaction unrealized P&L under average-cost accounting, with the
  authoritative total remaining in the position snapshot.
- Recompute all row attribution when the user's accounting method changes.

### Recommended Backend Contract

Extend each transaction returned by `GET /positions/:id` with a nested derived
object:

```json
{
  "performance": {
    "remaining_quantity": "5.00000000",
    "consumed_cost_basis": "1005.00",
    "realized_pnl": "490.00",
    "realized_pnl_reporting": "392.00",
    "unrealized_pnl": "147.50",
    "unrealized_pnl_reporting": "136.30",
    "attribution": "fifo"
  }
}
```

Fields that do not apply should be `null`. Returning `null` lets the frontend
render an empty cell, matching the current transaction-table convention.

### Required Accounting Changes

1. Add transaction identity to the realization input and derived output.
   - `LedgerTransaction` needs an optional/required transaction ID.
   - `DatedAmount` or a new sell-realization record needs `transactionId`.
2. Return per-sell results from `computeRealization`.
   - Realized P&L.
   - Consumed cost basis.
   - Consumed quantity.
   - Accounting method.
3. Preserve open-lot ownership for FIFO/LIFO.
   - `OpenLot` needs the originating buy transaction ID.
   - Return remaining quantity and remaining cost basis by buy transaction.
4. Compute lot-level unrealized P&L when a latest price exists.
   - Latest value minus remaining lot cost.
   - Convert open values using latest FX, consistent with position-level
     unrealized P&L.
5. Join the derived results into `PositionDetail.transactions`.
6. Extend `TransactionView` and add the two columns to `TransactionsTable`.

### Required Frontend Changes

- Add `performance` to `TransactionView`.
- Pass the position reporting currency to `TransactionsTable`; the table
  currently receives only the listing/transaction currency.
- Add `Realized P&L` and `Unrealized P&L` columns with reporting currency shown
  in the header or values.
- Render `null` as an empty cell, not a dash or zero.
- Use positive/negative semantic colors.
- Keep the native-currency value and accounting method available in a tooltip or
  row details if the main cells display reporting-currency values.
- Increase the table minimum width and preserve horizontal scrolling so the note
  column is not compressed.
- Explain in the column tooltip that unrealized P&L is unavailable per
  transaction under average-cost accounting.

### Derive On Read Versus Persist

**Derive on read first:** recommended for the initial feature.

- Reuses the current deterministic ledger replay.
- Avoids migration and recalculation-version complexity.
- Guarantees the row values use the user's current accounting method.
- Is acceptable for a single position detail response.

**Persist derived allocations later:** recommended for audit/export workflows.

- The schema already contains `portfolio.realization_allocations` and
  `portfolio.average_cost_realizations`.
- These tables are not currently populated by the portfolio service.
- Persistence requires replacing derived rows after every transaction
  create/edit/delete and tracking `calculation_version`.

### Required Tests

- Multiple sells on the same date, proving transaction ID rather than date is
  used for attribution.
- FIFO and LIFO partial-lot consumption.
- One sell consuming multiple buy lots.
- Average-cost realized P&L.
- Buy and sell fee treatment.
- Historical FX conversion on sell rows.
- Latest-FX conversion on open-lot unrealized P&L.
- Fully consumed buy lots and closed positions.
- Invalid ledgers after transaction edits.
- Reconciliation:
  - Sum of transaction realized P&L equals position realized P&L.
  - Sum of open-lot unrealized P&L equals position unrealized P&L for FIFO/LIFO.

### Estimated Scope

This is a medium-sized portfolio-service change, not a frontend-only column
addition. The accounting changes are localized, but they affect a core
financial calculation and require thorough tests before exposing the values.

## P0: Recorded Broker Tax And After-Tax P&L

> **Status: implemented 2026-06-14 (v1).** `portfolio.tax_events` records actual
> broker-booked tax per component (capital income / solidarity / church / foreign
> withholding / generic), direction (withheld/refunded), currency, booking date,
> and optional links to a transaction / cash flow / position / portfolio
> (`/tax-events` CRUD). Effective-dated tax residence lives in the authentication
> service (`GET`/`POST /tax-residency`) and controls labels only — never
> calculation. `GET /reporting/tax` reconciles gross realized P&L (from the
> authoritative summary) with net actual tax at booking-date FX into
> `realized_pnl_after_actual_tax`, with `actual_complete`/`actual_partial`/
> `unavailable` status; gross fields are unchanged. Web: a tax centre on `/reports`
> (after-tax metrics, per-component breakdown, event CRUD) and a tax-residence card
> in settings. Tax events linked to a transaction are joined onto that row in
> `GET /positions/:id` (shown under the note), and the current residence is exposed
> on `/me`. **Deferred:** broker-account/statement links (columns exist, unused) and
> statement import.

### Current State

The current platform stores `withholding_tax` only for dividend and
cash-in-lieu cash flows. Trade transactions do not store broker-withheld tax or
tax refunds. Existing realized and unrealized P&L are therefore gross pre-tax
values.

This is correct for the existing fields, but insufficient for after-tax
reporting.

### Required Semantic Separation

Gross realized P&L must remain an accounting value independent of tax:

```text
gross realized P&L = sell proceeds - fees - consumed cost basis
```

Tax must be exposed as separate information. The product should distinguish:

- **Gross realized P&L:** authoritative trade result before tax.
- **Actually withheld/refunded tax:** entered manually or imported from the
  broker's booking/statement.
- **Net realized P&L after actual tax:** gross realized P&L minus attributable
  actual tax, when attribution is known.

Unrealized P&L has no deducted tax and should remain a gross value. The system
should not estimate hypothetical tax on unrealized gains.

### Scope

The system should not reproduce German tax calculation rules. The broker is the
source of truth for deducted/refunded tax and already accounts for applicable
exemption orders, loss pots, fund rules, foreign-tax credits, church tax, and
later corrections.

The tracker only records what happened and calculates after-tax reporting from
those actual bookings. A zero recorded tax means no tax was recorded as
deducted; it must not imply that no tax liability exists outside the tracker.

Tax behavior must be selected from the user's country of **tax residence**, not
from citizenship, locale, currency, or broker country. A US citizen may have
additional US filing obligations while residing elsewhere, and a user can have
more than one tax residence. The initial product can require one primary tax
residence while keeping the contract extensible to multiple jurisdictions.

Tax residency must not cause the tracker to calculate local tax automatically.
It should control jurisdiction-specific labels, supported statement-import
mappings, disclosures, and whether a recorded-tax feature is applicable.

### Required Data Model

Add explicit tax records instead of adding one ambiguous tax amount directly to
P&L:

- Effective-dated user tax residency:
  - ISO country/jurisdiction code.
  - Valid-from and optional valid-until dates.
  - Primary-residence flag.
  - User-confirmed timestamp.
- Capital income tax withheld/refunded.
- Solidarity surcharge withheld/refunded.
- Church tax withheld/refunded.
- Foreign withholding tax.
- Generic broker tax or correction when the component breakdown is unavailable.
- Source, booking date, currency, note, and optional links to transaction, cash
  flow, position, portfolio, broker/account, and imported statement.

One tax event may relate to a transaction, dividend, year-end broker correction,
or several earlier events. Links must therefore be optional and must not assume
every tax amount belongs to exactly one sell.

Broker/account identity is useful for imports and reconciliation, but tax
profiles, loss pots, exemption-order balances, and tax-policy engines are out of
scope.

Tax residency belongs to the authentication/user-profile service. Tax events
and after-tax reporting remain owned by the portfolio service.

### Required Reporting Contracts

Keep existing gross fields and add separate tax reporting:

- `actual_tax_withheld`
- `actual_tax_refunded`
- `net_actual_tax`
- `realized_pnl_after_actual_tax`
- Tax completeness/status:
  - `actual_complete`
  - `actual_partial`
  - `unavailable`

The report must reconcile gross P&L, actual tax events, and net-after-tax values
without changing the meaning of the existing gross realized/unrealized fields.

### Required Web Changes

- Ask for the user's primary country of tax residence during setup or before
  enabling tax reporting.
- Allow tax residence to be reviewed and changed in settings with an effective
  date.
- Do not infer tax residence from browser locale, reporting currency,
  citizenship, or broker.
- Show gross P&L and after-tax P&L as separate values.
- Label recorded broker tax visibly.
- Add a tax summary/report page with:
  - Tax withheld and refunded.
  - Component breakdown where supplied by the broker.
  - Unlinked broker tax corrections.
- Show transaction-level actual tax only when an imported/manual tax event is
  explicitly linked to that transaction.
- Provide a tax-event/correction workflow and statement-import path.
- Explain that recorded tax is broker-reported information and not a tax
  liability calculation.

### Required Tests

- Missing tax residence and explicit setup prompt.
- Effective-dated tax-residence changes.
- A US citizen/resident configuration never receiving German-specific labels
  merely because a German broker or EUR reporting currency is used.
- Sell with linked withheld tax.
- Sell with zero recorded tax.
- Later broker tax refund/correction.
- Tax event linked to a dividend cash flow.
- Unlinked year-end or broker-level correction.
- Multiple tax components and currencies.
- Reconciliation of gross P&L, tax events, refunds, and after-tax P&L.

### Recommended Delivery Order

1. Add broker/account identity and actual tax-event ledger.
2. Add effective-dated user tax residency.
3. Allow manual entry/import of broker-withheld taxes and refunds.
4. Add gross-versus-actual-after-tax reporting.

## P1: Remaining Core Dashboard Features

### Historical Portfolio Performance Series

There is still no portfolio-owned historical performance endpoint. The market
service stores listing price history, but no service reconstructs portfolio
value and return through time.

Required inputs and behavior:

- Buys, sells, position closures, and reopened positions.
- Historical prices and historical FX.
- Deposits, withdrawals, dividends, and cash-in-lieu.
- Transfers and applied corporate actions once implemented.
- Periods such as `1W`, `1M`, `YTD`, `1Y`, and `ALL`.
- Market value, contributed capital, cumulative P&L, and return per point.
- XIRR and preferably time-weighted return.

This endpoint is required before the dashboard's main chart can represent
portfolio performance rather than an individual asset price or current snapshot.

### Cross-Portfolio Activity Feed

Transactions are available only inside a position detail response. Cash flows
are available only under an individual portfolio. There is no chronological,
paginated user/portfolio activity endpoint combining:

- Buys and sells.
- Dividends, deposits, withdrawals, and cash-in-lieu.
- Transfers.
- Applied/reversed corporate actions.

The dashboard Activity tab remains a placeholder until this read model exists.

### Benchmark Comparison

Benchmark preference columns exist in the database, but the product still lacks:

- Public preference read/write support for portfolio and combined benchmarks.
- A benchmark catalog and listing mappings.
- Benchmark historical series.
- Period-relative portfolio-versus-benchmark calculations.

### Cash-Flow Web UI

Cash-flow CRUD and reporting integration exist in the portfolio service, but
there is no frontend workflow to create, edit, inspect, or delete dividends,
deposits, withdrawals, or cash-in-lieu.

### Consistent Reporting Snapshot

Summary, holdings, and allocation endpoints each calculate their own response.
They are internally correct, but separate requests can observe slightly
different quote or cash-flow states.

For strict report consistency, add either:

- A combined reporting endpoint returning summary, holdings, and allocation
  under one snapshot timestamp; or
- A snapshot/version identifier shared across report reads.

## P2: Accounting And Portfolio Operations

### Derived Accounting Persistence

> **Status: implemented 2026-06-14.** Every recalculation now persists the derived
> allocations into `portfolio.realization_allocations` (FIFO/LIFO lot consumption)
> and `portfolio.average_cost_realizations`, stamped with the position's
> `calculation_version` and replaced atomically on each mutation.
> `GET /positions/:id/allocations` exposes the current snapshot. Remaining:
> correction/change history (Phase A-2 in [backend-roadmap.md](backend-roadmap.md)).

The schema contained these records but the service previously derived accounting
only in memory. Persistence gives durable audit trails, tax exports, and explains
exactly which buy lots a sell consumed without replaying the current ledger.

### Position Transfers

The schema contains `portfolio.position_transfers`, but there is no implemented
service module or frontend workflow.

### Corporate-Action Application

The events service exposes objective corporate actions, and the schema contains
position corporate-action applications. There is no signed apply/reverse
workflow that changes portfolio accounting.

### Market Prior-Close And Session Semantics

The market service now avoids using an intraday tick as the previous close by
selecting an earlier UTC calendar day. It is not yet exchange-timezone,
session-calendar, or holiday aware.

Remaining work:

- Exchange-local prior session close.
- Holiday calendars.
- Explicit open/pre-market/closed/holiday state.
- Defined continuous-session behavior for crypto.

## P3: Intelligence And Enrichment

### Advanced Risk Analytics

Still missing:

- Volatility.
- Maximum drawdown.
- Sharpe/Sortino ratios.
- Best/worst periods.
- Closed-position win rate.
- Benchmark-relative risk and return.

These depend primarily on the historical portfolio series and auditable
realization data.

### Allocation Classification

Allocation by instrument, asset type, portfolio, and currency is implemented.
Sector, industry, geography, and fund-category allocation require reliable
classification metadata.

### Holdings And Watchlist Batch Enrichment

The dashboard and watchlist would benefit from batched reads containing short
sparklines, event summaries, fair-value/target summaries, and freshness data.
Without these, richer rows require N+1 requests.

### Automatic DCF Intrinsic Value

The insights service can currently calculate and store a transparent DCF
intrinsic value, but only after a user manually enters every assumption.
Automatic DCF calculation should run when sufficient reliable information is
available.

#### Current Inputs

The DCF model requires:

- Base annual free cash flow.
- Projection growth rate.
- Projection years.
- Discount rate/WACC.
- Terminal growth rate.
- Diluted shares outstanding.
- Net debt.

Fundamentals currently exposes typed `shares_outstanding`, `net_debt`,
`revenue_growth`, and `earnings_growth`. It does not expose free cash flow as a
typed field. Provider raw payloads may contain free-cash-flow data, but relying
on untyped provider-specific fields would make automatic calculations fragile.

Growth, discount rate, projection horizon, and terminal growth are assumptions,
not objective facts. Automatic calculation therefore needs a documented,
versioned assumption policy rather than silently treating provider data as
certain.

#### Missing Data Inventory

The following DCF-relevant information is not currently collected as a typed,
normalized input:

| Input | Current status | Required source/use |
| --- | --- | --- |
| Free cash flow | Not typed or normalized | Required base DCF cash flow; collect TTM and annual values with currency and period |
| Historical free cash flow | Not exposed through the fundamentals contract | Needed to estimate sustainable growth and detect volatility/outliers |
| Operating cash flow and capital expenditure | Not typed | Useful for deriving and validating free cash flow |
| Cash and cash equivalents | Not typed | Needed if net debt must be derived rather than trusted directly |
| Total debt and debt maturity/cost | Only aggregate net debt is typed | Needed for transparent net-debt validation and a future WACC calculation |
| Effective/cash tax rate | Not typed | Needed for after-tax cost of debt and normalized cash-flow assumptions |
| Beta | Not collected | Needed for a CAPM-based cost of equity |
| Risk-free rate | Not collected | Needed for CAPM/WACC; should come from a versioned market/macro reference series |
| Equity risk premium | Not collected | Needed for CAPM/WACC; should be a versioned valuation-policy input |
| Cost of debt / credit spread | Not collected | Needed for WACC when debt is material |
| Debt/equity capital weights | Not stored as DCF inputs | Can be derived from market capitalization and debt when both are reliable |
| Historical revenue and earnings series | Only latest normalized values are served | Useful as fallback evidence for growth assumptions, not a substitute for FCF |
| Fiscal-period metadata | Not consistently exposed with normalized fundamentals | Needed to distinguish annual, quarterly, and TTM inputs |
| Sector/industry classification | Not collected | Useful for eligibility rules and sector-specific assumption policies |
| Country/region | Not collected | Useful for currency, tax, risk-free-rate, and equity-risk-premium selection |

Some of these values may exist inside provider `raw_payload`, but automatic DCF
must not depend directly on unstable provider-specific field names. Required
inputs should be normalized, typed, dated, and covered by provider mapping
tests.

Not every missing item is required for the first automatic DCF version. A
minimal defensible version requires typed recent free cash flow, shares
outstanding, net debt, currency, and a transparent versioned default-assumption
policy. A full WACC-driven model requires the additional market, debt, tax, and
classification inputs listed above.

#### Eligibility Rules

Generate an automatic DCF only when:

- The instrument type is suitable for DCF valuation. Ordinary operating
  companies are eligible; crypto assets and most funds are not.
- Currency is known and consistent across cash flow, debt, and output value.
- Positive diluted shares outstanding are available.
- A recent, positive free-cash-flow figure is available.
- Net debt is available or an explicit zero/default policy is allowed.
- The selected growth and discount assumptions pass the DCF model's validation.
- The fundamentals snapshot is within an accepted freshness window.

When eligibility is not met, no automatic value should be produced. The UI
should explain which required inputs are missing.

#### Required Fundamentals Changes

- Add typed free-cash-flow fields, including effective date and currency.
- Prefer trailing-twelve-month or latest annual free cash flow, with the chosen
  basis explicitly identified.
- Preserve enough history to derive a capped multi-year FCF growth rate where
  possible.
- Include the normalized DCF-relevant values in
  `fundamentals.snapshot.updated`, or expose an internal batch read for the
  insights service.

#### Required Insights Changes

- Consume `fundamentals.snapshot.updated` events and evaluate DCF eligibility.
- Introduce a versioned automatic-assumption policy, for example:
  - Growth derived from historical FCF/revenue/earnings growth and capped to a
    conservative range.
  - A configurable projection horizon.
  - Discount rate from a documented default or later a proper WACC model.
  - Terminal growth capped below the discount rate.
- Store the exact source fundamentals, assumption policy version, assumptions,
  computation breakdown, and calculation timestamp with every result.
- Recalculate when relevant fundamentals or policy versions change.
- Make refresh idempotent: replace or supersede the current automatic result
  instead of appending duplicates on every event.
- Never overwrite or delete a user's manually created DCF.

The current database contract permits `dcf` records only when `user_id` is set.
A global system-generated DCF therefore requires a schema/contract change. The
recommended distinction is:

- `dcf`: user-owned manual model.
- `auto_dcf`: system-generated model with `user_id = NULL`.
- `analyst`: provider analyst mean target.

#### Required Web Changes

- Display automatic DCF separately from user DCF and analyst value.
- Label it clearly as a model estimate, including its effective date and policy
  version.
- Show the source fundamentals and full assumption breakdown.
- Explain why automatic DCF is unavailable when required information is
  missing.
- Allow a user to use the automatic assumptions as a starting point for a
  separate editable personal DCF.
- Show stale or incomplete automatic estimates as such rather than presenting
  them as current intrinsic value.

#### Required Tests

- Eligible and ineligible instruments.
- Missing, zero, negative, stale, and currency-mismatched inputs.
- Assumption caps and `discount_rate > terminal_growth`.
- Idempotent recalculation on repeated fundamentals events.
- Policy-version changes creating a newly traceable result.
- Manual user DCF values remaining untouched.
- Automatic DCF records exposing reproducible inputs and breakdowns.

### Asset Logos

There is no stable logo/image source for instruments.

### Macro Events

Earnings, corporate actions, and news are implemented. Macro-event storage
exists in the schema, but there is no macro-event service API or web calendar.

### Cross-Device Theme Preference

Light/dark mode is implemented with frontend persistence. A user-profile theme
preference is still needed only if theme choice should follow the user across
devices.

## Universal Tracker Expansion Gaps

The features above complete the currently designed dashboard. The following
capabilities are additionally needed before the product can serve as a
trustworthy universal tracker instead of primarily a manually maintained
portfolio viewer.

### P0: Broker Accounts, Imports, And Reconciliation

Positions and transactions are currently entered manually. CSV and JSON imports
are planned extension points, but there is no implemented broker-account model,
import workflow, or reconciliation process.

Add:

- Broker and account records separate from user-defined portfolios, including
  account name, broker, base currency, account type, and optional external ID.
- Broker-specific statement adapters plus a configurable generic CSV importer.
- Import preview with validation, instrument matching, and explicit confirmation
  before financial records are changed.
- Import batches with source file hash, source record IDs, parser version,
  imported-at timestamp, warnings, and errors.
- Idempotent re-import and duplicate detection.
- Safe rollback of an import batch without deleting unrelated manual changes.
- A reconciliation view comparing tracker holdings, transactions, cash, taxes,
  fees, and dividends against a broker statement or connection.
- A discrepancy queue for unresolved instruments, missing bookings, quantity
  differences, and cash differences.

Direct broker APIs can follow after statement imports. Imports are the more
portable first implementation because broker API availability and licensing
vary significantly.

### P0: Cash Balances And Complete Account Value

Deposits, withdrawals, dividends, and cash-in-lieu are stored as cash flows, but
the tracker does not maintain an authoritative cash balance per broker account
and currency. Consequently, portfolio value does not necessarily represent the
complete account value.

Add:

- A per-account, per-currency cash ledger and current balance.
- Trade settlement and cash-flow effects with clear booking/value dates.
- Optional manual cash-balance adjustments with a reason and audit record.
- Reconciliation against broker-reported cash.
- Separate invested value, available cash, and complete account net value.

### P0: Source Provenance, Audit Trail, And Corrections

Financial records need to explain where they came from and how they changed.
The current domain supports idempotency and some reversible operations, but
transactions, cash flows, taxes, and manual valuations do not share a complete
user-visible provenance and correction model.

Add:

- Source metadata on every financial booking: manual, import batch, broker API,
  provider, or generated corporate action.
- Immutable change history recording who changed what, when, and why.
- Correction/reversal workflows instead of silent destructive edits where
  financial history would otherwise become ambiguous.
- Drill-down from every report total to its contributing source records.
- Data-quality status and visible completeness warnings for missing prices, FX,
  unclassified instruments, unresolved imports, and stale provider data.

This foundation is also required for dependable tax exports, reconciliation,
and support investigations.

### P1: Instrument Identity And Lifecycle

The instrument catalog supports ISINs, listings, and provider identifiers, but a
universal tracker must also survive real-world identity changes and imperfect
provider coverage.

Add:

- Additional identifiers where available, such as FIGI, CUSIP, and SEDOL.
- User-assisted resolution and duplicate-instrument merge workflows.
- Symbol, exchange, ISIN, and provider-identifier history.
- Delisting and inactive-listing handling without losing portfolio history.
- Mergers, acquisitions, spin-offs, rights issues, tender offers, and return of
  capital in addition to existing split/dividend workflows.
- Explicit provider fallback and a visible active valuation source.
- Full web/API support for existing user-owned manual valuations when no
  reliable market quote exists.

### P1: Targets, Rebalancing, And Goals

The tracker shows current allocation but cannot define the intended allocation
or help the user act on drift.

Add:

- Target allocations by portfolio, asset type, instrument, tag, or custom
  group.
- Drift thresholds and allocation-drift alerts.
- Rebalancing suggestions using new contributions first, with optional
  buy-only, minimum-trade, exclusion, and cash-reserve constraints.
- Goal tracking with target amount, target date, and progress.
- Position-size and concentration limits.

Recommendations must remain clearly separated from authoritative accounting
data and must show the assumptions used.

### P1: Income Forecasting And Dividend Intelligence

Reporting includes received dividends, but it does not yet provide a complete
income-planning view.

Add:

- Upcoming ex-dividend and payment calendar.
- Expected dividend income by month and year, with confidence/source labels.
- Trailing income, dividend growth, yield on cost, and payout history.
- Dividend increase, cut, suspension, and missed-payment alerts.
- Reconciliation of expected dividends against actual broker cash flows.

### P1: FX Attribution And Performance Explainability

Historical FX conversion is implemented for important realized values, but
users cannot see how much return came from the asset versus currency movement.

Add:

- Investment return and FX return attribution.
- Local-currency and reporting-currency performance side by side.
- Contribution-to-return by holding, asset type, portfolio, and currency.
- A report drill-down that reconciles start value, external cash flows,
  investment return, FX return, fees, taxes, income, and end value.

### P1: Alerts, Digests, And Delivery Channels

The notifications service currently supports an in-app inbox and rules for
price, daily move, earnings lead time, cost-basis move, and target zones.

Add:

- Rules for allocation drift, concentration, dividend changes, corporate
  actions, stale/missing data, import failures, and reconciliation differences.
- Daily and weekly portfolio digests with a concise "what changed" summary.
- Optional email, push, and webhook delivery with per-rule channel selection.
- Quiet hours, timezone-aware schedules, delivery history, and retry status.

### P2: Organization, Saved Views, And Household Tracking

As the number of holdings grows, a single watchlist and fixed dashboard become
insufficient.

Add:

- Multiple named watchlists.
- User-defined tags, strategies, sectors, and custom groups.
- Saved filters, table layouts, report views, and dashboard preferences.
- Investment thesis, conviction, review date, and notes per holding.
- Optional household/shared views with explicit read or edit permissions.
- A "changed since last visit" view across holdings and watchlists.

### P2: Broader Asset Coverage

The current instrument model supports `equity`, `fund`, and `crypto`. This is
enough for the product's current focus, but not for a complete net-worth or
all-asset tracker.

Potential later extensions include:

- Cash-equivalent instruments and money-market products.
- Bonds and other fixed-income securities, including coupons and maturity.
- Options and other derivatives with contract metadata and expiration.
- Commodities, private assets, real estate, employee equity, and liabilities
  using manual valuations where market data is unavailable.

Each asset class needs its own correct accounting and reporting semantics.
Adding generic labels without those semantics would make totals misleading.

### P2: Export, Portability, And External Integrations

Add:

- CSV and JSON export for transactions, cash flows, taxes, holdings, lots, and
  report results.
- Annual statements and accountant-oriented realized-gain/tax exports.
- Complete per-user data export and documented restore/import workflow.
- Read-only integration endpoints and scoped API tokens for external tools.
- Optional read-only shareable reports with explicit expiration and revocation.

Deployment-level database backups remain necessary, but they do not replace
user-level data portability.

### P2: Mobile, Accessibility, And Localization

Add:

- Installable responsive PWA behavior for quick portfolio checks and alerts.
- Accessible keyboard navigation, focus handling, chart alternatives, and
  contrast verification.
- Complete locale-aware date/number formatting and timezone handling.
- Clear support for different reporting currencies and account currencies
  throughout imports, forms, and reports.

## Recommended Implementation Order

### Phase 1: Trustworthy Consolidation And Explainable Transactions

1. Add broker accounts, import batches, source provenance, and reconciliation.
2. Add authoritative account cash balances.
3. Add per-sell realized P&L attribution to the realization engine.
4. Add FIFO/LIFO open-lot unrealized attribution.
5. Extend position-detail transaction contracts and the transaction table.
6. Add actual tax-event tracking and effective-dated user tax residency.
7. Add gross-versus-after-tax reporting.
8. Add cash-flow management UI.
9. Persist realization allocations and correction history for audit/export.

### Phase 2: Historical And Comparative Reporting

1. Build the historical portfolio performance series.
2. Add XIRR and time-weighted returns.
3. Add a paginated cross-portfolio activity feed.
4. Add benchmark preferences, catalog, series, and comparison.
5. Add a consistent combined reporting snapshot/version.

### Phase 3: Operations And Intelligence

1. Implement transfers and corporate-action apply/reverse workflows.
2. Add typed DCF fundamentals and automatic intrinsic-value calculation.
3. Add risk analytics and closed-position win rate.
4. Add session-aware prior-close and market-session status.
5. Add classifications, logos, macro events, and batched enrichment reads.

### Phase 4: Universal Portfolio Workflows

1. Add target allocations, drift alerts, rebalancing, and goals.
2. Add income forecasting and dividend reconciliation.
3. Add instrument lifecycle workflows and FX return attribution.
4. Add richer alerts, digests, and external delivery channels.
5. Add saved views, tags, exports, portability, and integrations.
6. Extend asset classes only where correct accounting semantics are defined.

## Recommended Service Ownership

| Capability | Owning service |
| --- | --- |
| Broker accounts, imports, reconciliation, cash ledger, transaction-level P&L attribution, tax-event ledger, after-tax reporting, cash flows, activity, transfers, targets, and portfolio history | `portfolio` |
| Historical quotes, prior close, benchmark prices, FX, market sessions, and manual valuations | `market` |
| Instrument identity/lifecycle, classifications, listings, exchanges, and asset metadata | `instruments` |
| Typed free cash flow and other objective DCF input facts | `fundamentals` |
| User-wide preferences, tax residency, combined benchmark, and optional theme | `authentication` |
| Earnings, corporate actions, news, and future macro calendar | `events` |
| Manual/automatic DCF models, fair values, and price targets | `insights` |
| Alert rules, notification inbox, digests, and external delivery channels | `notifications` |

The frontend should compose these public APIs in parallel. Dashboard-oriented
batch endpoints are appropriate when composition otherwise creates N+1 reads or
inconsistent financial snapshots.
