import Link from "next/link"
import { Box, Breadcrumbs, Card, Stack, Typography } from "@mui/material"
import { AppBadge } from "@/application/shell/AppBadge"
import { appTypography } from "@/application/shell/appTypography"
import { PageShell } from "@/application/shell/PageShell"
import { MetricBar, MetricBarItem, type MetricBarTone } from "@/design/components/MetricBar"
import { AddTransactionModal } from "@/components/AddTransactionModal"
import { AssetPriceChart } from "@/features/asset-detail/components/AssetPriceChart"
import { AssetTransactionsTable } from "@/features/asset-detail/components/AssetTransactionsTable"
import { AssetAlerts } from "@/components/AssetAlerts"
import { CorporateActionsManager } from "@/components/CorporateActionsManager"
import { DeletePositionButton } from "@/components/DeletePositionButton"
import { EventsSection, NewsSection } from "@/components/EventsSection"
import { FairValueSection } from "@/components/FairValueSection"
import { FundamentalsSection } from "@/components/FundamentalsSection"
import { PriceTargetsSection } from "@/components/PriceTargetsSection"
import { TransferPositionControl } from "@/components/TransferPositionControl"
import { fmtCurrency, fmtPct, fmtPrice, fmtQty, num } from "@/lib/format"
import { getTranslations } from "@/lib/i18n"
import type { AppBadgeTone } from "@/application/shell/AppBadge"
import type { AssetDetailModel, AssetPositionContext, AttentionItem, QuoteStatus } from "@/features/asset-detail/model/asset-detail-model"

interface AssetDetailWorkspaceProperties {
  model: AssetDetailModel
}

export function AssetDetailWorkspace({ model }: AssetDetailWorkspaceProperties) {
  const translations = getTranslations()
  const primaryPosition = model.positions[0]?.position ?? null
  const listing = primaryPosition?.listing ?? model.listing
  const listingCurrency = listing?.currency ?? primaryPosition?.performance.listing_currency ?? model.reportingCurrency
  const assetType = listing?.asset_type ?? "equity"
  const instrumentId = listing?.instrument_id ?? null
  const currentPrice = num(primaryPosition?.performance.current_price ?? model.quote?.latest ?? null) ?? lastChartPrice(model)
  const dailyChange = num(primaryPosition?.performance.daily_change_pct ?? null)
  const isDailyUp = dailyChange !== null && dailyChange >= 0
  const aggregate = model.aggregate
  const hasPositions = model.positions.length > 0
  const quoteStatus = model.quoteStatus

  return (
    <PageShell kind="workspace" maxWidth={1680}>
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={appTypography.breadcrumbParent}>Portfolio</Typography>
        <Typography sx={appTypography.breadcrumbCurrent}>{listing?.name ?? model.listingId}</Typography>
      </Breadcrumbs>

      <AssetHeader
        assetType={assetType}
        currentPrice={currentPrice}
        dailyChange={dailyChange}
        isDailyUp={isDailyUp}
        listingCurrency={listingCurrency}
        locale={model.locale}
        name={listing?.name ?? model.listingId}
        quoteStatus={quoteStatus}
        scopeLabel={model.scope.label}
        symbol={listing?.symbol ?? model.listingId}
      />

      <MetricBar className="grid gap-px bg-[var(--app-border)] sm:grid-cols-2 xl:grid-cols-6">
        <AssetMetric icon={<PriceIcon />} label="Current price" primary sub={dailyChange === null ? "Daily movement unavailable" : `${dailyChange >= 0 ? "+" : ""}${fmtPct(dailyChange)} today`} tone={dailyChange === null ? "neutral" : isDailyUp ? "positive" : "danger"} value={currentPrice !== null ? fmtPrice(model.locale, currentPrice, listingCurrency, assetType) : "-"} />
        <AssetMetric icon={<ValueIcon />} label="Position value" sub={hasPositions ? `${model.positions.length} position${model.positions.length === 1 ? "" : "s"}` : "No open position"} tone="accent" value={aggregate.currentValue !== null ? fmtCurrency(model.locale, aggregate.currentValue, model.reportingCurrency) : "-"} />
        <AssetMetric icon={<LotIcon />} label="Quantity" sub={hasPositions ? "Across visible positions" : "Watchlist only"} value={fmtQty(model.locale, aggregate.quantity, assetType)} />
        <AssetMetric icon={<ReturnIcon />} label="Unrealized P&L" sub={aggregate.totalReturnPct !== null ? fmtPct(aggregate.totalReturnPct) : "No cost basis"} tone={toneFromNumber(aggregate.unrealized)} value={aggregate.unrealized !== null ? signedCurrency(model.locale, aggregate.unrealized, model.reportingCurrency) : "-"} />
        <AssetMetric icon={<DataIcon />} label="Data status" sub={quoteAsOfLabel(quoteStatus, model.locale)} tone={metricToneFromQuote(quoteStatus.tone)} value={quoteStatus.label} />
        <AssetMetric icon={<AlertIcon />} label="Alerts" sub={`${model.notificationData.notifications.length} recent notifications`} tone={model.notificationData.rules.length > 0 ? "warning" : "neutral"} value={model.notificationData.rules.length} />
      </MetricBar>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel className="min-w-0 overflow-hidden" padding={false}>
          <AssetPriceChart currency={listingCurrency} dailyData={model.dailyChartSeries} dailyPositive={isDailyUp} data={model.chartSeries} locale={model.locale} />
        </Panel>

        <aside className="space-y-3">
          {model.attentionItems.length > 0 ? (
            <Panel title="Attention" padding={false}>
              {model.attentionItems.map((item, index) => (
                <AttentionRow item={item} key={`${item.type}-${index}`} />
              ))}
            </Panel>
          ) : null}

          <Panel title={hasPositions ? "Position snapshot" : "Asset snapshot"} subtitle={`Scope: ${model.scope.label}`} padding={false}>
            <MetricRow label="Current value" tone={rowToneFromNumber(aggregate.unrealized)} value={aggregate.currentValue !== null ? fmtCurrency(model.locale, aggregate.currentValue, model.reportingCurrency) : "-"} />
            <MetricRow label="Unrealized P&L" tone={rowToneFromNumber(aggregate.unrealized)} value={aggregate.unrealized !== null ? signedCurrency(model.locale, aggregate.unrealized, model.reportingCurrency) : "-"} />
            <MetricRow label="Realized P&L" tone={rowToneFromNumber(aggregate.realized)} value={aggregate.realized !== null ? signedCurrency(model.locale, aggregate.realized, model.reportingCurrency) : "-"} />
            <MetricRow label="Recorded net tax" tone={aggregate.tax > 0 ? "negative" : aggregate.tax < 0 ? "positive" : undefined} value={signedCurrency(model.locale, aggregate.tax, model.reportingCurrency)} />
            <MetricRow label="Total return" tone={rowToneFromNumber(aggregate.totalReturnPct)} value={aggregate.totalReturnPct !== null ? fmtPct(aggregate.totalReturnPct) : "-"} />
          </Panel>

          {instrumentId ? (
            <Panel title="Asset alerts">
              <AssetAlerts
                currency={listingCurrency}
                currentPrice={currentPrice}
                instrumentId={instrumentId}
                listingId={model.listingId}
                locale={model.locale}
                notifications={model.notificationData.notifications}
                positionId={model.actionContextPath}
                rules={model.notificationData.rules}
                symbol={listing?.symbol ?? model.listingId}
              />
            </Panel>
          ) : null}
        </aside>
      </div>

      <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-3">
          <Panel title={hasPositions ? "Positions" : "Portfolio positions"} subtitle={hasPositions ? "Visible holdings for this asset." : "No position exists yet; this asset can still be analysed from the watchlist."} padding={false}>
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
              <Panel title={translations("positionDetail.fundamentals")}>
                <FundamentalsSection currency={listingCurrency} data={model.fundamentals} emptyReason={model.sections.fundamentals.reason} locale={model.locale} />
              </Panel>

              <div className="grid gap-3 lg:grid-cols-2">
                <Panel title={translations("positionDetail.fairValue")}>
                  <FairValueSection currentPrice={currentPrice} currency={listingCurrency} instrumentId={instrumentId} items={model.fairValues} positionId={model.actionContextPath} />
                </Panel>
                <Panel title={translations("positionDetail.priceTargets")}>
                  <PriceTargetsSection currentPrice={currentPrice} currency={listingCurrency} instrumentId={instrumentId} items={model.priceTargets} positionId={model.actionContextPath} />
                </Panel>
              </div>

              <Panel title={translations("positionDetail.events")}>
                <EventsSection corporateActions={model.events.corporateActions} currency={listingCurrency} earnings={model.events.earnings} emptyReason={model.sections.events.reason} locale={model.locale} />
              </Panel>

              <Panel title={translations("events.newsTitle")}>
                <NewsSection emptyReason={model.sections.news.reason} locale={model.locale} news={model.events.news} />
              </Panel>
            </>
          ) : null}
        </div>

        <aside className="space-y-3">
          <Panel title={hasPositions ? "Position facts" : "Asset facts"}>
            <FactRow label="Quantity" value={fmtQty(model.locale, aggregate.quantity, assetType)} />
            <FactRow label="Cost basis" value={aggregate.cost !== null ? fmtCurrency(model.locale, aggregate.cost, model.reportingCurrency) : "-"} />
            <FactRow label="Average cost" value={aggregate.cost !== null && aggregate.quantity > 0 ? fmtPrice(model.locale, aggregate.cost / aggregate.quantity, model.reportingCurrency, assetType) : "-"} />
            <FactRow label="Total fees" value={aggregate.fees !== null ? fmtCurrency(model.locale, aggregate.fees, model.reportingCurrency) : "-"} />
            <FactRow label="After-tax realized P&L" tone={factToneFromNumber(aggregate.afterTaxRealized)} value={aggregate.afterTaxRealized !== null ? signedCurrency(model.locale, aggregate.afterTaxRealized, model.reportingCurrency) : "-"} />
            <FactRow label="Transactions" value={String(aggregate.txCount)} />
            <FactRow label="Quote status" tone={quoteStatus.tone === "positive" ? "positive" : quoteStatus.tone === "neutral" ? undefined : "warning"} value={quoteStatus.label} />
          </Panel>

          {model.positions.map((context) => (
            <Panel key={context.position.id} title={`Manage ${context.portfolioName}`}>
              <div className="space-y-4">
                <div>
                  <p className="mb-3 text-[10.5px] leading-4 text-[var(--app-text-muted)]">Apply splits or reverse splits to restate this holding's share count while preserving cost basis.</p>
                  <CorporateActionsManager applied={context.appliedCorporateActions} available={model.events.corporateActions} locale={model.locale} positionId={context.position.id} />
                </div>
                <div className="border-t border-[var(--app-border)] pt-4">
                  <p className="mb-3 text-[10.5px] leading-4 text-[var(--app-text-muted)]">Move this position and its full history to another portfolio.</p>
                  <TransferPositionControl positionId={context.position.id} portfolios={model.otherPortfolios.filter((portfolio) => portfolio.id !== context.position.portfolio_id)} />
                </div>
                <div className="border-t border-[var(--app-border)] pt-4">
                  <p className="mb-3 text-[10.5px] leading-4 text-[var(--app-text-muted)]">Permanently delete this position and all its transactions.</p>
                  <DeletePositionButton positionId={context.position.id} />
                </div>
              </div>
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
  name,
  quoteStatus,
  scopeLabel,
  symbol,
}: {
  assetType: string
  currentPrice: number | null
  dailyChange: number | null
  isDailyUp: boolean
  listingCurrency: string
  locale: string
  name: string
  quoteStatus: QuoteStatus
  scopeLabel: string
  symbol: string
}) {
  return (
    <Card className="app-panel" component="header" variant="outlined" sx={{ borderColor: "var(--app-border)", borderRadius: 1, boxShadow: "var(--app-shadow)", p: 2 }}>
      <Stack direction="row" sx={{ alignItems: "flex-start", gap: 2, justifyContent: "space-between" }}>
        <Stack direction="row" sx={{ alignItems: "flex-start", gap: 1.5, minWidth: 0 }}>
          <Link aria-label="Back to dashboard" className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]" href="/dashboard">
            <BackIcon />
          </Link>
          <Box sx={{ minWidth: 0 }}>
            <Stack direction="row" sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
              <Typography component="h1" sx={{ color: "var(--app-text)", fontSize: 20, fontWeight: 800, letterSpacing: 0, lineHeight: 1.2 }}>{name}</Typography>
              <AppBadge kind="category" label={assetType} tone="neutral" />
              <AppBadge kind="status" label={quoteStatus.label} tone={badgeToneFromQuote(quoteStatus.tone)} />
            </Stack>
            <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12, fontWeight: 700, mt: 0.75 }} className="tabular-nums">{symbol} - {listingCurrency} - {scopeLabel}</Typography>
            <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 500, mt: 0.25 }}>{quoteStatus.explanation}</Typography>
          </Box>
        </Stack>
        <Box sx={{ flexShrink: 0, textAlign: "right" }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 22, fontWeight: 800, lineHeight: 1.1 }} className="tabular-nums">
            {currentPrice !== null ? fmtPrice(locale, currentPrice, listingCurrency, assetType) : "-"}
          </Typography>
          <Typography sx={{ color: dailyChange === null ? "var(--app-text-faint)" : isDailyUp ? "var(--app-positive)" : "var(--app-negative)", fontSize: 12, fontWeight: 800, mt: 0.75 }} className="tabular-nums">
            {dailyChange === null ? "Daily movement unavailable" : `${dailyChange >= 0 ? "+" : ""}${fmtPct(dailyChange)} today`}
          </Typography>
        </Box>
      </Stack>
    </Card>
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
    <Card className={`app-panel ${className}`} component="section" variant="outlined" sx={{ borderColor: "var(--app-border)", borderRadius: 1, boxShadow: "var(--app-shadow)", overflow: "hidden" }}>
      {title ? (
        <Stack direction="row" sx={{ alignItems: "center", bgcolor: "var(--app-surface-header)", borderBottom: "1px solid var(--app-divider)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
          <Box sx={{ minWidth: 0 }}>
            <Typography component="h2" sx={appTypography.panelTitle}>{title}</Typography>
            {subtitle ? <Typography sx={appTypography.panelMeta}>{subtitle}</Typography> : null}
          </Box>
          {action}
        </Stack>
      ) : null}
      <Box sx={padding ? { p: 1.5 } : undefined}>{children}</Box>
    </Card>
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

function MetricRow({ label, tone, value }: { label: string; tone?: "positive" | "negative"; value: string }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "negative" ? "var(--app-negative)" : "var(--app-text)"
  return (
    <Box sx={{ borderBottom: "1px solid var(--app-border)", px: 1.5, py: 1.25, "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase" }}>{label}</Typography>
      <Typography className="tabular-nums" sx={{ color, fontSize: 14, fontWeight: 800, mt: 0.5 }}>{value}</Typography>
    </Box>
  )
}

function FactRow({ label, tone, value }: { label: string; tone?: "positive" | "negative" | "warning"; value: string }) {
  const color = tone === "positive" ? "var(--app-positive)" : tone === "negative" ? "var(--app-negative)" : tone === "warning" ? "var(--app-warning)" : "var(--app-text)"
  return (
    <Stack direction="row" spacing={2} sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", py: 1, "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11, fontWeight: 600 }}>{label}</Typography>
      <Typography className="tabular-nums" sx={{ color, fontSize: 11, fontWeight: 800, textAlign: "right" }}>{value}</Typography>
    </Stack>
  )
}

function EmptyPanelText({ children }: { children: React.ReactNode }) {
  return <p className="px-4 py-10 text-center text-[12px] font-medium text-[var(--app-text-faint)]">{children}</p>
}

function AttentionRow({ item }: { item: AttentionItem }) {
  const tone: AppBadgeTone = item.severity === "critical" ? "danger" : item.severity === "warning" ? "warning" : "neutral"
  const label = item.type === "alert" ? "Alert" : item.type === "event" ? "Event" : "Data"
  return (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25, "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ color: "var(--app-text)", fontSize: 11.5, fontWeight: 600 }}>{item.title}</Typography>
      <AppBadge kind="status" label={label} tone={tone} />
    </Stack>
  )
}

function quoteAsOfLabel(quoteStatus: QuoteStatus, locale: string): string {
  if (!quoteStatus.quoteAsOf) return "No quote on record"
  return `Quote ${new Date(quoteStatus.quoteAsOf).toLocaleDateString(locale)}`
}

function metricToneFromQuote(tone: QuoteStatus["tone"]): MetricBarTone {
  if (tone === "positive") return "positive"
  if (tone === "warning") return "warning"
  if (tone === "critical") return "danger"
  return "neutral"
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

function signedCurrency(locale: string, value: number, currency: string): string {
  return `${value > 0 ? "+" : ""}${fmtCurrency(locale, value, currency)}`
}

function toneFromNumber(value: number | null): MetricBarTone {
  if (value === null || value === 0) return "neutral"
  return value > 0 ? "positive" : "danger"
}

function rowToneFromNumber(value: number | null): "positive" | "negative" | undefined {
  if (value === null || value === 0) return undefined
  return value > 0 ? "positive" : "negative"
}

function factToneFromNumber(value: number | null): "positive" | "negative" | "warning" | undefined {
  if (value === null || value === 0) return undefined
  return value > 0 ? "positive" : "negative"
}

function dataTone(contexts: AssetPositionContext[]): MetricBarTone {
  if (contexts.length === 0) return "neutral"
  return contexts.every((context) => context.position.freshness_status === "fresh") ? "positive" : "neutral"
}

function dataLabel(contexts: AssetPositionContext[]): string {
  if (contexts.length === 0) return "Watchlist"
  if (contexts.every((context) => context.position.freshness_status === "fresh")) return "Fresh"
  if (contexts.some((context) => context.position.freshness_status === "unavailable" && context.position.performance.current_price === null)) return "Missing"
  return "Market neutral"
}

function quoteDateLabel(contexts: AssetPositionContext[], locale: string): string {
  const latestQuote = contexts
    .map((context) => context.position.quote_as_of)
    .filter((value): value is string => value !== null)
    .sort()
    .pop()
  return latestQuote ? `Quote ${new Date(latestQuote).toLocaleDateString(locale)}` : "No held quote"
}

function formatAccountingMethod(method: string | undefined): string {
  if (method === "fifo") return "FIFO realization"
  if (method === "lifo") return "LIFO realization"
  if (method === "average_cost") return "Average cost realization"
  return "Realization method unavailable"
}

function BackIcon() {
  return (
    <svg aria-hidden="true" className="h-4 w-4" fill="none" viewBox="0 0 24 24">
      <path d="m15 6-6 6 6 6" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
    </svg>
  )
}

function PriceIcon() {
  return <MiniIcon path="M5 17h14M7 14l3-3 3 2 4-6" />
}

function ValueIcon() {
  return <MiniIcon path="M7 18V7m5 11V4m5 14v-8" />
}

function LotIcon() {
  return <MiniIcon path="M5 7h14M5 12h14M5 17h14" />
}

function ReturnIcon() {
  return <MiniIcon path="M6 16l5-5 3 3 4-7M18 7h-4m4 0v4" />
}

function DataIcon() {
  return <MiniIcon path="M7 7h10v10H7zM10 4v3m4-3v3m-4 10v3m4-3v3M4 10h3m10 0h3M4 14h3m10 0h3" />
}

function AlertIcon() {
  return <MiniIcon path="M12 5a5 5 0 0 0-5 5v3l-1.5 2h13L17 13v-3a5 5 0 0 0-5-5Zm-2 13h4" />
}

function MiniIcon({ path }: { path: string }) {
  return (
    <svg aria-hidden="true" className="h-5 w-5" fill="none" viewBox="0 0 24 24">
      <path d={path} stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.8" />
    </svg>
  )
}
