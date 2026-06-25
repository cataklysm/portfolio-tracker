import Link from "next/link"
import { AppBadge } from "@/design/components/AppBadge"
import { PageShell } from "@/application/shell/PageShell"
import { MetricBar, MetricBarItem, type MetricBarTone } from "@/design/components/MetricBar"
import { AppIcon } from "@/design/icons/AppIcon"
import { AssetBackButton } from "@/features/asset-detail/components/AssetBackButton"
import { AssetPriceChart, type AssetTradeMarker } from "@/features/asset-detail/components/AssetPriceChart"
import { AssetTransactionsTable } from "@/features/asset-detail/components/AssetTransactionsTable"
import { EventsSection, NewsSection } from "@/features/events/components/EventsSection"
import { FundamentalsSection } from "@/features/fundamentals/components/FundamentalsSection"
import { FairValueSection } from "@/features/insights/components/FairValueSection"
import { PriceTargetsSection } from "@/features/insights/components/PriceTargetsSection"
import { AssetAlerts } from "@/features/notifications/components/AssetAlerts"
import { AddTransactionModal } from "@/features/positions/components/AddTransactionModal"
import { CorporateActionsManager } from "@/features/positions/components/CorporateActionsManager"
import { DeletePositionButton } from "@/features/positions/components/DeletePositionButton"
import { TransferPositionControl } from "@/features/positions/components/TransferPositionControl"
import { fmtCompact, fmtCurrency, fmtPct, fmtPrice, fmtQty, num } from "@/lib/format"
import { getTranslations } from "@/lib/i18n"
import type { AppBadgeTone } from "@/design/components/AppBadge"
import type { AssetDetailModel, AssetPositionContext, AttentionItem, QuoteStatus } from "@/features/asset-detail/model/asset-detail-model"
import type { Quote, TransactionView } from "@/lib/types"

interface AssetDetailWorkspaceProperties {
  model: AssetDetailModel
  returnHref?: string
}

export function AssetDetailWorkspace({ model, returnHref }: AssetDetailWorkspaceProperties) {
  const translations = getTranslations()
  const primaryPosition = model.positions[0]?.position ?? null
  const listing = primaryPosition?.listing ?? model.listing
  const listingCurrency = listing?.currency ?? primaryPosition?.performance.listing_currency ?? model.reportingCurrency
  const assetType = listing?.asset_type ?? "equity"
  const instrumentId = listing?.instrument_id ?? null
  const currentPrice = num(primaryPosition?.performance.current_price ?? model.quote?.latest ?? null) ?? lastChartPrice(model)
  const dailyChange = dailyChangeFromPositionOrQuote(primaryPosition?.performance.daily_change_pct ?? null, model.quote)
  const isDailyUp = dailyChange !== null && dailyChange >= 0
  const aggregate = model.aggregate
  const hasPositions = model.positions.length > 0
  const quoteStatus = model.quoteStatus
  const tradeMarkers = buildTradeMarkers(model.positions)

  return (
    <PageShell kind="workspace" maxWidth={1680}>
      <AssetHeader
        assetType={assetType}
        currentPrice={currentPrice}
        dailyChange={dailyChange}
        isDailyUp={isDailyUp}
        listingCurrency={listingCurrency}
        locale={model.locale}
        name={listing?.name ?? model.listingId}
        quoteStatus={quoteStatus}
        returnHref={returnHref}
        model={model}
        symbol={listing?.symbol ?? model.listingId}
      />

      <MetricBar className="grid gap-px bg-[var(--app-border)] sm:grid-cols-2 xl:grid-cols-6">
        <AssetMetric icon={<AppIcon name="value" />} label="Market value" primary sub={hasPositions ? `${model.positions.length} position${model.positions.length === 1 ? "" : "s"}` : "No open position"} tone="accent" value={aggregate.currentValue !== null ? fmtCurrency(model.locale, aggregate.currentValue, model.reportingCurrency) : "-"} />
        <AssetMetric icon={<AppIcon name="list" />} label="Quantity" sub={hasPositions ? "Across visible positions" : "Watchlist only"} value={fmtQty(model.locale, aggregate.quantity, assetType)} />
        <AssetMetric icon={<AppIcon name="calculator" />} label="Cost basis" sub={aggregate.cost !== null && aggregate.quantity > 0 ? `${fmtPrice(model.locale, aggregate.cost / aggregate.quantity, model.reportingCurrency, assetType)} avg` : "No cost basis"} value={aggregate.cost !== null ? fmtCurrency(model.locale, aggregate.cost, model.reportingCurrency) : "-"} />
        <AssetMetric icon={<AppIcon name={aggregate.unrealized !== null && aggregate.unrealized < 0 ? "trendDown" : "trendUp"} />} label="Unrealized P&L" sub={aggregate.totalReturnPct !== null ? fmtPct(aggregate.totalReturnPct) : "No cost basis"} tone={toneFromNumber(aggregate.unrealized)} value={aggregate.unrealized !== null ? signedCurrency(model.locale, aggregate.unrealized, model.reportingCurrency) : "-"} />
        <AssetMetric icon={<AppIcon name="target" />} label="Target zones" sub={model.priceTargets.length === 1 ? "1 configured zone" : `${model.priceTargets.length} configured zones`} tone={model.priceTargets.length > 0 ? "accent" : "neutral"} value={model.priceTargets.length} />
        <AssetMetric icon={<AppIcon name="alert" />} label="Alerts" sub={`${model.notificationData.notifications.length} recent notifications`} tone={model.notificationData.rules.length > 0 ? "warning" : "neutral"} value={model.notificationData.rules.length} />
      </MetricBar>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-3">
          <Panel className="min-w-0 overflow-hidden" padding={false}>
            <AssetPriceChart currency={listingCurrency} dailyData={model.dailyChartSeries} dailyPositive={isDailyUp} data={model.chartSeries} locale={model.locale} targetZones={model.priceTargets} tradeMarkers={tradeMarkers} />
          </Panel>

          <Panel title={hasPositions ? "Positions across portfolios" : "Portfolio positions"} subtitle={hasPositions ? `${model.positions.length} portfolio${model.positions.length === 1 ? "" : "s"}` : "No position exists yet; this asset can still be analysed from the watchlist."} padding={false}>
            {hasPositions ? <PositionsTable contexts={model.positions} currency={model.reportingCurrency} locale={model.locale} assetType={assetType} /> : <EmptyPanelText>No portfolio position currently holds this asset.</EmptyPanelText>}
          </Panel>

          {model.positions.map((context) => (
            <Panel
              action={<AddTransactionModal currency={listingCurrency} positionId={context.position.id} />}
              key={context.position.id}
              padding={false}
              subtitle={`${context.portfolioName} - ${formatAccountingMethod(context.position.transactions[0]?.performance.attribution)}`}
              title="Transactions"
            >
              <AssetTransactionsTable
                allocations={context.allocations}
                assetType={assetType}
                currency={listingCurrency}
                locale={model.locale}
                portfolioId={context.position.portfolio_id}
                positionId={context.position.id}
                realizations={context.realizations}
                reportingCurrency={model.reportingCurrency}
                transactions={context.position.transactions}
              />
            </Panel>
          ))}

          {instrumentId ? (
            <>
              <Panel title="Research">
                <div className="grid gap-3 xl:grid-cols-3">
                  <ResearchTile title={translations("positionDetail.fundamentals")}>
                    <FundamentalsSection currency={listingCurrency} data={model.fundamentals} density="compact" emptyReason={model.sections.fundamentals.reason} locale={model.locale} />
                  </ResearchTile>
                  <ResearchTile title={translations("positionDetail.fairValue")}>
                    <FairValueSection currentPrice={currentPrice} currency={listingCurrency} detailContext={model.detailContext} instrumentId={instrumentId} items={model.fairValues} />
                  </ResearchTile>
                  <ResearchTile title={translations("positionDetail.priceTargets")}>
                    <PriceTargetsSection availableCurrencies={model.availableCurrencies} currentPrice={currentPrice} currency={listingCurrency} detailContext={model.detailContext} instrumentId={instrumentId} items={model.priceTargets} listingId={model.listingId} />
                  </ResearchTile>
                </div>
              </Panel>

              <Panel title={translations("events.newsTitle")}>
                <NewsSection emptyReason={model.sections.news.reason} locale={model.locale} news={model.events.news} />
              </Panel>

              <Panel title={translations("positionDetail.events")}>
                <EventsSection corporateActions={model.events.corporateActions} currency={listingCurrency} earnings={model.events.earnings} emptyReason={model.sections.events.reason} locale={model.locale} />
              </Panel>
            </>
          ) : null}
        </div>

        <aside className="space-y-3">
          <AssetSnapshotPanel
            assetType={assetType}
            currentPrice={currentPrice}
            dailyChange={dailyChange}
            listingCurrency={listingCurrency}
            locale={model.locale}
            model={model}
          />

          {instrumentId ? (
            <Panel action={<span className="text-[10px] font-semibold text-[var(--app-accent)]">View all</span>} title="Alerts & zones">
              <AssetAlerts
                currency={listingCurrency}
                currentPrice={currentPrice}
                detailContext={model.detailContext}
                instrumentId={instrumentId}
                listingId={model.listingId}
                locale={model.locale}
                notifications={model.notificationData.notifications}
                notificationPreviewLimit={3}
                rules={model.notificationData.rules}
                symbol={listing?.symbol ?? model.listingId}
              />
            </Panel>
          ) : null}

          <UpcomingEventsPanel currency={listingCurrency} locale={model.locale} model={model} />
          <DataQualityPanel locale={model.locale} model={model} />

          {model.positions.length > 0 ? <ActionsPanel model={model} /> : null}

          <Panel title={hasPositions ? "Position snapshot" : "Asset facts"} padding={false}>
            <FactRow label="Quantity" value={fmtQty(model.locale, aggregate.quantity, assetType)} />
            <FactRow label="Cost basis" value={aggregate.cost !== null ? fmtCurrency(model.locale, aggregate.cost, model.reportingCurrency) : "-"} />
            <FactRow label="Average cost" value={aggregate.cost !== null && aggregate.quantity > 0 ? fmtPrice(model.locale, aggregate.cost / aggregate.quantity, model.reportingCurrency, assetType) : "-"} />
            <FactRow label="Total fees" value={aggregate.fees !== null ? fmtCurrency(model.locale, aggregate.fees, model.reportingCurrency) : "-"} />
            <FactRow label="After-tax realized P&L" tone={factToneFromNumber(aggregate.afterTaxRealized)} value={aggregate.afterTaxRealized !== null ? signedCurrency(model.locale, aggregate.afterTaxRealized, model.reportingCurrency) : "-"} />
            <FactRow label="Transactions" value={String(aggregate.txCount)} />
            <FactRow label="Quote status" tone={quoteStatus.tone === "positive" ? "positive" : quoteStatus.tone === "neutral" ? undefined : "warning"} value={quoteStatus.label} />
          </Panel>

          {model.positions.map((context) => (
            <Panel key={context.position.id} title={`Corporate actions - ${context.portfolioName}`}>
              <p className="mb-3 text-[10.5px] leading-4 text-[var(--app-text-muted)]">Apply splits or reverse splits to restate this holding's share count while preserving cost basis.</p>
              <CorporateActionsManager applied={context.appliedCorporateActions} available={model.events.corporateActions} locale={model.locale} positionId={context.position.id} />
            </Panel>
          ))}
        </aside>
      </div>
    </PageShell>
  )
}

function AssetHeader({
  assetType,
  currentPrice,
  dailyChange,
  isDailyUp,
  listingCurrency,
  locale,
  model,
  name,
  quoteStatus,
  returnHref,
  symbol,
}: {
  assetType: string
  currentPrice: number | null
  dailyChange: number | null
  isDailyUp: boolean
  listingCurrency: string
  locale: string
  model: AssetDetailModel
  name: string
  quoteStatus: QuoteStatus
  returnHref?: string
  symbol: string
}) {
  const fallbackHref = returnHref ?? fallbackHrefForScope(model)

  return (
    <header className="app-panel overflow-hidden rounded-lg">
      <div className="grid gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-start">
        <div className="flex min-w-0 items-start gap-3">
          <AssetBackButton fallbackHref={fallbackHref} />
          <div className="min-w-0">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <h1 className="truncate text-[18px] font-extrabold leading-tight text-[var(--app-text)]">{name}</h1>
              <span className="text-[11px] font-semibold tabular-nums text-[var(--app-text-muted)]">{symbol}</span>
              <span className="text-[11px] font-semibold tabular-nums text-[var(--app-text-muted)]">{listingCurrency}</span>
              <AppBadge kind="category" label={assetType} tone="neutral" />
              <AppBadge kind="status" label={quoteStatus.label} tone={badgeToneFromQuote(quoteStatus.tone)} />
            </div>
            <ScopeTabs model={model} />
          </div>
        </div>
        <div className="justify-self-start text-left lg:justify-self-end lg:text-right">
          <p className="text-[22px] font-extrabold leading-none tabular-nums text-[var(--app-text)]">
            {currentPrice !== null ? fmtPrice(locale, currentPrice, listingCurrency, assetType) : "-"}
          </p>
          <p className={`mt-2 text-[12px] font-extrabold tabular-nums ${dailyChange === null ? "text-[var(--app-text-faint)]" : isDailyUp ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
            {dailyChange === null ? "Daily movement unavailable" : `${fmtPct(dailyChange)} today`}
          </p>
        </div>
      </div>
    </header>
  )
}

function fallbackHrefForScope(model: AssetDetailModel): string {
  if (model.scope.kind === "watchlist") return "/watchlist"
  if (model.scope.portfolioId) return `/dashboard?portfolio=${encodeURIComponent(model.scope.portfolioId)}`
  return "/dashboard"
}

function ScopeTabs({ model }: { model: AssetDetailModel }) {
  const tabs = [
    { active: model.scope.kind === "all", href: `/assets/${model.listingId}`, label: "All portfolios" },
    ...model.positions.map((context) => ({
      active: model.scope.portfolioId === context.position.portfolio_id || (model.scope.kind === "position" && model.positions.length === 1 && model.positions[0]?.position.portfolio_id === context.position.portfolio_id),
      href: `/assets/${model.listingId}?portfolio=${context.position.portfolio_id}`,
      label: context.portfolioName,
    })),
    { active: model.scope.kind === "watchlist", href: "/watchlist", label: "Watchlist" },
  ]
  const seen = new Set<string>()
  const uniqueTabs = tabs.filter((tab) => {
    const key = tab.href
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })

  return (
    <div className="mt-3 flex min-w-0 items-center gap-2">
      <span className="hidden shrink-0 text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)] sm:inline">Scope</span>
      <div className="flex min-w-0 overflow-hidden rounded-md border border-[var(--app-border)]">
        {uniqueTabs.map((tab) => (
          <Link
            className={`min-w-28 truncate border-l border-[var(--app-border)] px-4 py-2 text-center text-[11px] font-semibold first:border-l-0 ${tab.active ? "bg-[var(--app-accent)] text-white" : "bg-[var(--app-surface-inset)] text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}`}
            href={tab.href}
            key={tab.href}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

function buildTradeMarkers(contexts: AssetPositionContext[]): AssetTradeMarker[] {
  return contexts.flatMap((context) => context.position.transactions.map((transaction) => tradeMarkerFromTransaction(context, transaction)).filter((marker): marker is AssetTradeMarker => marker !== null))
}

function tradeMarkerFromTransaction(context: AssetPositionContext, transaction: TransactionView): AssetTradeMarker | null {
  const price = num(transaction.price)
  if (price === null) return null

  return {
    id: `${context.position.id}:${transaction.id}`,
    portfolioName: context.portfolioName,
    price,
    quantity: num(transaction.quantity),
    side: transaction.side,
    time: transaction.effective_at,
  }
}

function AssetSnapshotPanel({
  assetType,
  currentPrice,
  dailyChange,
  listingCurrency,
  locale,
  model,
}: {
  assetType: string
  currentPrice: number | null
  dailyChange: number | null
  listingCurrency: string
  locale: string
  model: AssetDetailModel
}) {
  const range = chartRange(model.dailyChartSeries)
  const fundamentals = model.fundamentals
  const marketCap = num(fundamentals?.market_cap ?? null)
  const shares = num(fundamentals?.shares_outstanding ?? null)
  const sector = extraString(fundamentals?.extra, ["sector", "Sector"])
  const industry = extraString(fundamentals?.extra, ["industry", "Industry"])

  return (
    <Panel title="Asset snapshot" subtitle={`Values in ${listingCurrency}`} padding={false}>
      <FactRow label="Current price" value={currentPrice !== null ? fmtPrice(locale, currentPrice, listingCurrency, assetType) : "-"} />
      <FactRow label="Day change" tone={dailyChange === null ? undefined : dailyChange >= 0 ? "positive" : "negative"} value={dailyChange === null ? "-" : fmtPct(dailyChange)} />
      <FactRow label="52W range" value={range ? `${fmtPrice(locale, range.low, listingCurrency, assetType)} - ${fmtPrice(locale, range.high, listingCurrency, assetType)}` : "-"} />
      <FactRow label="Market cap" value={marketCap !== null ? fmtCompact(locale, marketCap, fundamentals?.currency ?? listingCurrency) : "-"} />
      <FactRow label="Shares outstanding" value={shares !== null ? fmtCompact(locale, shares) : "-"} />
      <FactRow label="Provider" value={model.quoteStatus.provider ?? fundamentals?.provider ?? "-"} />
      <FactRow label="Sector" value={sector ?? "-"} />
      <FactRow label="Industry" value={industry ?? "-"} />
    </Panel>
  )
}

function UpcomingEventsPanel({
  currency,
  locale,
  model,
}: {
  currency: string
  locale: string
  model: AssetDetailModel
}) {
  const upcomingEarnings = model.events.earnings
    .filter((item) => item.is_upcoming && item.report_date)
    .sort((a, b) => (a.report_date ?? "").localeCompare(b.report_date ?? ""))
    .slice(0, 2)
  const corporateActions = model.events.corporateActions
    .filter((item) => item.ex_date)
    .sort((a, b) => a.ex_date.localeCompare(b.ex_date))
    .slice(0, 2)
  const hasEvents = upcomingEarnings.length > 0 || corporateActions.length > 0

  return (
    <Panel action={<span className="text-[10px] font-semibold text-[var(--app-accent)]">View all</span>} title="Upcoming events" padding={false}>
      {hasEvents ? (
        <div className="divide-y divide-[var(--app-border)]">
          {upcomingEarnings.map((event) => (
            <SideEventRow
              key={`earnings-${event.instrument_id}-${event.report_date}`}
              label="Earnings report"
              meta={`FY${event.fiscal_year}${event.fiscal_quarter ? ` Q${event.fiscal_quarter}` : ""} - ${event.provider}`}
              value={event.report_date ? formatShortDate(locale, event.report_date) : "-"}
            />
          ))}
          {corporateActions.map((event) => (
            <SideEventRow
              key={event.stable_action_id}
              label={event.type}
              meta={event.provider}
              value={event.dividend_amount ? fmtCurrency(locale, num(event.dividend_amount) ?? 0, event.dividend_currency ?? currency) : formatShortDate(locale, event.ex_date)}
            />
          ))}
        </div>
      ) : (
        <EmptyPanelText>{model.sections.events.reason ?? "No upcoming events for this asset."}</EmptyPanelText>
      )}
    </Panel>
  )
}

function DataQualityPanel({ locale, model }: { locale: string; model: AssetDetailModel }) {
  return (
    <Panel title="Data quality" padding={false}>
      <FactRow label="Quote status" tone={model.quoteStatus.tone === "positive" ? "positive" : model.quoteStatus.tone === "critical" ? "negative" : model.quoteStatus.tone === "warning" ? "warning" : undefined} value={model.quoteStatus.label} />
      <FactRow label="Last update" value={model.quoteStatus.lastUpdatedAt ? new Date(model.quoteStatus.lastUpdatedAt).toLocaleString(locale, { dateStyle: "short", timeStyle: "short" }) : "-"} />
      <FactRow label="Market status" value={marketStatusLabel(model.quoteStatus.marketStatus)} />
      <p className={`border-t border-[var(--app-border)] px-3 py-2.5 text-[10.5px] font-semibold leading-4 ${model.quoteStatus.isActionRequired ? "text-[var(--app-warning)]" : "text-[var(--app-text-faint)]"}`}>
        {model.quoteStatus.explanation}
      </p>
      {model.attentionItems.length > 0 ? (
        <div className="border-t border-[var(--app-border)]">
          {model.attentionItems.map((item, index) => (
            <AttentionRow item={item} key={`${item.type}-${index}`} />
          ))}
        </div>
      ) : null}
    </Panel>
  )
}

function ActionsPanel({ model }: { model: AssetDetailModel }) {
  const context = model.positions[0]
  if (!context) return null

  return (
    <Panel title="Actions">
      <div className="space-y-4">
        <div>
          <p className="mb-2 text-[10.5px] font-medium leading-4 text-[var(--app-text-faint)]">Move this position and its full history to another portfolio.</p>
          <TransferPositionControl positionId={context.position.id} portfolios={model.otherPortfolios.filter((portfolio) => portfolio.id !== context.position.portfolio_id)} />
        </div>
        <div className="border-t border-[var(--app-border)] pt-4">
          <p className="mb-2 text-[10.5px] font-medium leading-4 text-[var(--app-text-faint)]">Permanently delete this position and all its transactions.</p>
          <DeletePositionButton positionId={context.position.id} />
        </div>
      </div>
    </Panel>
  )
}

function SideEventRow({ label, meta, value }: { label: string; meta: string; value: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[11.5px] font-semibold text-[var(--app-text)]">{label}</p>
        <p className="mt-0.5 truncate text-[10px] font-medium text-[var(--app-text-faint)]">{meta}</p>
      </div>
      <p className="text-right text-[11px] font-semibold tabular-nums text-[var(--app-text)]">{value}</p>
    </div>
  )
}

function ResearchTile({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <div className="min-w-0 rounded-md border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-surface-panel)_82%,var(--app-surface-inset)_18%)] p-3">
      <h3 className="mb-3 text-[11px] font-semibold leading-4 text-[var(--app-text-muted)]">{title}</h3>
      {children}
    </div>
  )
}

function PositionsTable({
  assetType,
  contexts,
  currency,
  locale,
}: {
  assetType: string
  contexts: AssetPositionContext[]
  currency: string
  locale: string
}) {
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-[minmax(200px,1.4fr)_130px_150px_150px_130px_120px] gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-inset)] px-4 py-2 text-[10.5px] font-semibold text-[var(--app-text-faint)]">
          <span>Portfolio</span>
          <span className="text-right">Quantity</span>
          <span className="text-right">Value</span>
          <span className="text-right">Cost basis</span>
          <span className="text-right">Return</span>
          <span className="text-right">Data</span>
        </div>
        {contexts.map((context) => {
          const performance = context.position.performance
          const value = num(performance.current_value_reporting)
          const cost = num(performance.open_cost_basis_reporting)
          const totalReturn = num(performance.total_return_pct)
          return (
            <div className="grid grid-cols-[minmax(200px,1.4fr)_130px_150px_150px_130px_120px] items-center gap-3 border-b border-[var(--app-border)] px-4 py-2.5 last:border-b-0" key={context.position.id}>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-semibold text-[var(--app-text)]">{context.portfolioName}</span>
                <span className="mt-0.5 block text-[10.5px] font-medium text-[var(--app-text-faint)]">{context.position.state}</span>
              </span>
              <span className="text-right text-[12px] font-semibold tabular-nums text-[var(--app-text)]">{fmtQty(locale, num(performance.open_quantity) ?? 0, assetType)}</span>
              <span className="text-right text-[12px] font-semibold tabular-nums text-[var(--app-text)]">{value !== null ? fmtCurrency(locale, value, currency) : "-"}</span>
              <span className="text-right text-[12px] font-semibold tabular-nums text-[var(--app-text-muted)]">{cost !== null ? fmtCurrency(locale, cost, currency) : "-"}</span>
              <span className={`text-right text-[12px] font-semibold tabular-nums ${totalReturn === null ? "text-[var(--app-text-faint)]" : totalReturn >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>{totalReturn !== null ? fmtPct(totalReturn) : "-"}</span>
              <span className="flex justify-end"><AppBadge kind="status" label={context.position.freshness_status ?? "unknown"} tone={context.position.freshness_status === "fresh" ? "success" : "warning"} /></span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Panel({
  action,
  children,
  className = "",
  padding = true,
  subtitle,
  title,
}: {
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
  padding?: boolean
  subtitle?: string
  title?: string
}) {
  return (
    <section className={`app-panel overflow-hidden rounded-lg ${className}`}>
      {title ? (
        <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
          <div className="min-w-0">
            <h2 className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">{subtitle}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={padding ? "p-3" : undefined}>{children}</div>
    </section>
  )
}

function AssetMetric({
  icon,
  label,
  primary = false,
  sub,
  tone = "neutral",
  value,
}: {
  icon: React.ReactNode
  label: string
  primary?: boolean
  sub?: string
  tone?: MetricBarTone
  value: React.ReactNode
}) {
  return <MetricBarItem icon={icon} label={label} primary={primary} sub={sub} tone={tone} value={value} />
}

function FactRow({ label, tone, value }: { label: string; tone?: "positive" | "negative" | "warning"; value: string }) {
  const color = tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : tone === "warning" ? "text-[var(--app-warning)]" : "text-[var(--app-text)]"
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-3 py-2 last:border-b-0">
      <span className="text-[11px] font-semibold text-[var(--app-text-muted)]">{label}</span>
      <span className={`text-right text-[11px] font-extrabold tabular-nums ${color}`}>{value}</span>
    </div>
  )
}

function EmptyPanelText({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[12px] font-medium text-[var(--app-text-faint)]">{children}</p>
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const tone: AppBadgeTone = item.severity === "critical" ? "danger" : item.severity === "warning" ? "warning" : "neutral"
  const label = item.type === "alert" ? "Alert" : item.type === "event" ? "Event" : "Data"
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-3 py-2.5 last:border-b-0">
      <p className="min-w-0 truncate text-[11.5px] font-semibold text-[var(--app-text)]">{item.title}</p>
      <AppBadge kind="status" label={label} tone={tone} />
    </div>
  )
}

function chartRange(points: AssetDetailModel["dailyChartSeries"]): { high: number; low: number } | null {
  const values = points.map((point) => num(point.price)).filter((value): value is number => value !== null)
  if (values.length === 0) return null
  return { high: Math.max(...values), low: Math.min(...values) }
}

function extraString(extra: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!extra) return null
  for (const key of keys) {
    const value = extra[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function formatShortDate(locale: string, iso: string): string {
  return new Date(iso).toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
}

function marketStatusLabel(status: QuoteStatus["marketStatus"]): string {
  if (status === "open") return "Market open"
  if (status === "closed") return "Market closed"
  if (status === "holiday") return "Holiday"
  if (status === "weekend") return "Weekend"
  return "Unknown"
}

function badgeToneFromQuote(tone: QuoteStatus["tone"]): AppBadgeTone {
  if (tone === "positive") return "success"
  if (tone === "warning") return "warning"
  if (tone === "critical") return "danger"
  return "neutral"
}

function lastChartPrice(model: AssetDetailModel): number | null {
  const latest = [...model.chartSeries, ...model.dailyChartSeries]
    .map((point) => ({ price: num(point.price), time: point.time }))
    .filter((point): point is { price: number; time: string } => point.price !== null)
    .sort((first, second) => new Date(first.time).getTime() - new Date(second.time).getTime())
    .pop()
  return latest?.price ?? null
}

function dailyChangeFromPositionOrQuote(positionDailyChange: string | null, quote: Quote | null): number | null {
  const fromPosition = num(positionDailyChange)
  if (fromPosition !== null) return fromPosition

  const latest = num(quote?.latest ?? null)
  const previous = num(quote?.previous ?? null)
  if (latest === null || previous === null || previous === 0) return null
  return (latest - previous) / previous * 100
}

function signedCurrency(locale: string, value: number, currency: string): string {
  return `${value > 0 ? "+" : ""}${fmtCurrency(locale, value, currency)}`
}

function toneFromNumber(value: number | null): MetricBarTone {
  if (value === null || value === 0) return "neutral"
  return value > 0 ? "positive" : "danger"
}

function factToneFromNumber(value: number | null): "positive" | "negative" | "warning" | undefined {
  if (value === null || value === 0) return undefined
  return value > 0 ? "positive" : "negative"
}

function formatAccountingMethod(method: string | undefined): string {
  if (method === "fifo") return "FIFO realization"
  if (method === "lifo") return "LIFO realization"
  if (method === "average_cost") return "Average cost realization"
  return "Realization method unavailable"
}
