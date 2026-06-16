# Reports Page Roadmap

Working notes for improving the reports page incrementally. This records the
current assessment and target direction so individual points can be discussed and
implemented one at a time. It is intentionally not a locked implementation plan.

## Current Assessment

The reports page is technically coherent, but its product purpose is unclear. It
currently combines several different workflows into one long page:

- Current portfolio overview and holdings
- Allocation and concentration
- Risk analytics
- Benchmark comparison and configuration
- Tax estimates
- Recorded broker-tax reporting and tax-event editing
- Portfolio tax configuration
- Tax terminology glossary

This makes the page feel like a collection of available reporting features rather
than a focused analytical workspace.

## Main Problems

### 1. Reporting, configuration, and data entry are mixed

A report should primarily answer questions. The current page also changes
configuration and financial records:

- ~~Benchmark selection changes portfolio configuration.~~ Moved to the dedicated
  portfolio settings page; the dashboard performance chart now shows the saved
  benchmark comparison.
- Portfolio tax configuration changes calculation behavior.
- Recorded tax events can be created, edited, and deleted.

Possible direction:

- Benchmark configuration belongs to portfolio settings; benchmark performance is
  shown beside portfolio performance on the dashboard.
- Move portfolio tax configuration to Settings.
- Move tax-event management to Activity or a dedicated Tax workspace.

### 2. The opening sections duplicate the dashboard

The reports page repeats current value, P&L, today's movement, invested capital,
holdings, allocation, largest holding, top mover, and data quality.

Possible direction:

- Dashboard remains the unified current-state overview.
- Reports focuses on historical analysis, comparisons, reconciliation, and
  exportable information.

### 3. The main report has no reporting period

The main snapshot is current-state only. Only benchmark comparison currently has
a period selector. This makes figures such as realized P&L, dividends, fees, and
income ambiguous.

Questions to resolve:

- Which metrics should be lifetime, calendar-year, tax-year, or user-selected?
- Should one period selector control the full analytical report?
- Which current-state metrics still belong in Reports?

### 4. The page has no strong information hierarchy

Performance, risk, benchmark, tax estimate, recorded tax, tax configuration, and
the glossary are rendered sequentially. Users must scroll through unrelated
sections to reach the information they need.

Possible direction:

- Introduce report categories or tabs.
- Keep one clear primary question per category.
- Show configuration and explanations only where needed.

### 5. Independent sections depend on the snapshot rendering successfully

The page currently renders the entire report body only when summary, holdings,
and allocation are all available. Risk, tax, and benchmark data may be available
independently but are hidden when the snapshot is incomplete.

Possible direction:

- Give each report section its own loading, unavailable, and partial-data state.
- Avoid one failed endpoint suppressing unrelated analysis.

## Candidate Target Structure

This is a discussion starting point, not a final decision.

### Performance

- Period selector
- Historical portfolio performance
- Realized and unrealized return
- Income and fees
- Benchmark comparison

### Risk

- Volatility
- Drawdown
- Sharpe and Sortino
- Concentration
- Closed-position win rate

### Tax

- Estimated tax
- Recorded broker tax
- Estimate-versus-recorded reconciliation
- Tax-year grouping

Tax configuration and tax-event editing should probably not live directly in the
report view.

### Export

- Holdings export
- Transactions export
- Performance report export
- Tax report export

No export workflow currently exists; its exact scope and formats remain open.

## Incremental Work List

Work through these separately so product decisions can be made before each
implementation:

- [ ] Decide what the Reports page is primarily for.
- [ ] Decide which dashboard-duplicate sections to remove.
- [ ] Define reporting periods and metric semantics.
- [ ] Decide the top-level report navigation structure.
- [ ] Separate report reading from configuration and data entry.
- [ ] Define the Performance report.
- [ ] Define the Risk report.
- [ ] Define the Tax report and reconciliation model.
- [ ] Decide whether an Export report/workspace is needed.
- [ ] Make report sections fail independently.
- [ ] Rework the visual hierarchy after the information architecture is agreed.

## Existing Components and Data

Useful existing pieces that can be reorganized rather than discarded:

- `ReportsOverview`: current snapshot summary, holdings, and allocation.
- `RiskPanel`: volatility, drawdown, Sharpe, Sortino, and win rate.
- Dashboard `PerformanceChart`: portfolio performance with the saved benchmark
  comparison.
- `TaxEstimatePanel`: calculated tax estimates.
- `TaxCenter`: recorded broker tax and tax-event management.
- `PortfolioTaxConfigCard`: per-portfolio tax-rule configuration.
- `TaxGlossary`: explanations for tax terminology.

Relevant endpoints already available:

- `GET /reporting/snapshot`
- `GET /reporting/performance`
- `GET /reporting/risk`
- `GET /reporting/benchmark`
- `GET /reporting/tax`
- `GET /reporting/tax/estimate`
- `GET /tax-events`
