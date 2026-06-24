"use client"

import Link from "next/link"
import { useMemo, useState, useTransition, type ReactNode } from "react"
import { useRouter } from "next/navigation"
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  IconButton,
  Stack,
  Tooltip,
  Typography,
} from "@mui/material"
import { AppBadge, appIconButtonSx } from "@/application/shell/AppBadge"
import { appTypography } from "@/application/shell/appTypography"
import { PageMetricGrid, PageShell } from "@/application/shell/PageShell"
import { ControlBar } from "@/design/components/ControlBar"
import { MetricBar, MetricBarItem, type MetricBarTone } from "@/design/components/MetricBar"
import { AddToWatchlistDialog } from "@/features/watchlist/components/AddToWatchlistDialog"
import { removeFromWatchlistAction } from "@/features/watchlist/actions"
import { fmtPrice, num } from "@/lib/format"
import type { InstrumentAssetType, WatchlistItemView } from "@/lib/types"

type WatchlistTab = "all" | InstrumentAssetType

interface WatchlistWorkspaceProperties {
  locale: string
  watchlistItems: WatchlistItemView[]
}

const watchlistTabs = [
  { value: "all", label: "All" },
  { value: "equity", label: "Equities" },
  { value: "fund", label: "Funds" },
  { value: "crypto", label: "Crypto" },
  { value: "index", label: "Index" },
] as const

const assetTypeLabels: Record<InstrumentAssetType, string> = {
  crypto: "Crypto",
  equity: "Equity",
  fund: "Fund",
  index: "Index",
}

export function WatchlistWorkspace({ locale, watchlistItems }: WatchlistWorkspaceProperties) {
  const router = useRouter()
  const [query, setQuery] = useState("")
  const [tab, setTab] = useState<WatchlistTab>("all")
  const [addDialogOpen, setAddDialogOpen] = useState(false)
  const searchTerm = query.trim().toLowerCase()

  const metrics = useMemo(() => buildWatchlistMetrics(watchlistItems), [watchlistItems])
  const tabCounts = useMemo(() => countTabs(watchlistItems), [watchlistItems])
  const filteredItems = useMemo(() => watchlistItems
    .filter((item) => tab === "all" || item.listing?.asset_type === tab)
    .filter((item) => matchesWatchlistItem(item, searchTerm))
    .sort(compareWatchlistItems), [searchTerm, tab, watchlistItems])

  function clearFilters() {
    setQuery("")
    setTab("all")
  }

  return (
    <PageShell kind="workspace" maxWidth={1640}>
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={appTypography.breadcrumbParent}>Portfolio</Typography>
        <Typography sx={appTypography.breadcrumbCurrent}>Watchlist</Typography>
      </Breadcrumbs>

      <PageMetricGrid columns={{ xs: "1fr", md: "repeat(3, minmax(0, 1fr))" }}>
        <WatchlistMetric icon={<BookmarkIcon />} label="Tracked assets" value={metrics.total} sub="Not included in portfolio totals" tone="accent" />
        <WatchlistMetric icon={<TrendUpIcon />} label="Positive today" value={metrics.positiveToday} sub={`${metrics.negativeToday} down / ${metrics.unchangedToday} flat`} tone="positive" />
        <WatchlistMetric icon={<QuoteIcon />} label="Priced assets" value={`${metrics.pricedAssets}/${metrics.total}`} sub={metrics.unavailableAssets > 0 ? `${metrics.unavailableAssets} without quote` : "Current quote coverage"} tone={metrics.unavailableAssets > 0 ? "warning" : "positive"} />
      </PageMetricGrid>

      <ControlBar
        defaultTabValue="all"
        onAdd={() => setAddDialogOpen(true)}
        onClearFilters={clearFilters}
        onReload={() => router.refresh()}
        onSearchChange={setQuery}
        onTabChange={setTab}
        addLabel="Add to watchlist"
        reloadLabel="Reload watchlist"
        searchPlaceholder="Search watchlist assets, ticker, or note"
        searchValue={query}
        tabs={watchlistTabs.map((item) => ({
          label: item.label,
          value: item.value,
          count: item.value === "all" ? undefined : tabCounts[item.value],
        }))}
        tabValue={tab}
      />

      <WatchlistTable
        filteredCount={filteredItems.length}
        items={filteredItems}
        locale={locale}
        onAdd={() => setAddDialogOpen(true)}
        onClearFilters={clearFilters}
        totalCount={watchlistItems.length}
      />

      <AddToWatchlistDialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} />
    </PageShell>
  )
}

function WatchlistMetric({
  icon,
  label,
  sub,
  tone,
  value,
}: {
  icon: ReactNode
  label: string
  sub: string
  tone: MetricBarTone
  value: ReactNode
}) {
  return (
    <MetricBar>
      <MetricBarItem icon={icon} label={label} primary sub={sub} tone={tone} value={value} />
    </MetricBar>
  )
}

function WatchlistTable({
  filteredCount,
  items,
  locale,
  onAdd,
  onClearFilters,
  totalCount,
}: {
  filteredCount: number
  items: WatchlistItemView[]
  locale: string
  onAdd: () => void
  onClearFilters: () => void
  totalCount: number
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "var(--app-surface-panel)", boxShadow: "var(--app-shadow)", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", bgcolor: "var(--app-surface-header)", borderBottom: "1px solid var(--app-divider)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Box sx={{ minWidth: 0 }}>
          <Typography component="h2" sx={appTypography.panelTitle}>Watchlist assets</Typography>
          <Typography sx={appTypography.panelMeta}>Observation list only; excluded from portfolio value and performance.</Typography>
        </Box>
        <AppBadge kind="count" label={String(filteredCount)} tone="accent" />
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ minWidth: 980 }}>
          <Box className="grid grid-cols-[minmax(270px,1.7fr)_120px_130px_110px_150px_minmax(180px,1fr)_54px] gap-3 border-b border-[var(--app-border)] bg-[var(--app-surface-inset)] px-4 py-2">
            {["Asset", "Type", "Price", "Today", "Quote", "Note", ""].map((heading) => (
              <span key={heading} className={`text-[10.5px] font-semibold text-[var(--app-text-faint)] ${["Price", "Today", "Quote"].includes(heading) ? "text-right" : ""}`}>
                {heading}
              </span>
            ))}
          </Box>

          {items.length === 0 ? (
            <EmptyWatchlistState
              filtered={totalCount > 0}
              onAdd={onAdd}
              onClearFilters={onClearFilters}
            />
          ) : (
            items.map((item) => <WatchlistRow item={item} key={item.id} locale={locale} />)
          )}
        </Box>
      </Box>
    </Card>
  )
}

function WatchlistRow({ item, locale }: { item: WatchlistItemView; locale: string }) {
  const router = useRouter()
  const [isRemoving, startRemove] = useTransition()
  const listing = item.listing
  const symbol = listing?.symbol ?? "-"
  const name = listing?.name ?? item.listing_id.slice(0, 8)
  const assetType = listing?.asset_type
  const currency = listing?.currency ?? "EUR"
  const price = num(item.current_price)
  const dailyChange = num(item.daily_change_pct)
  const dailyTone = dailyChange === null ? "text-[var(--app-text-faint)]" : dailyChange >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"
  const quoteLabel = formatQuoteLabel(item.quote_as_of, locale)

  function removeItem() {
    startRemove(async () => {
      await removeFromWatchlistAction(item.listing_id)
      router.refresh()
    })
  }

  return (
    <Box
      className="grid grid-cols-[minmax(270px,1.7fr)_120px_130px_110px_150px_minmax(180px,1fr)_54px] items-center gap-3 border-b border-[var(--app-border)] px-4 py-2.5 transition last:border-b-0 hover:bg-[var(--app-surface-hover)]"
    >
      <Link className="flex min-w-0 items-center gap-3 rounded-md transition hover:text-[var(--app-accent)]" href={`/assets/${item.listing_id}`}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[10px] font-bold text-[var(--app-accent)]">
          {symbol.slice(0, 3)}
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[13px] font-semibold leading-tight text-[var(--app-text)]">{name}</span>
          <span className="mt-0.5 block truncate text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">{symbol}</span>
        </span>
      </Link>
      <span>{assetType ? <AppBadge kind="category" label={assetTypeLabels[assetType]} tone="neutral" /> : <AppBadge kind="status" label="Unknown" tone="warning" />}</span>
      <span className="text-right text-[13px] font-semibold tabular-nums text-[var(--app-text)]">
        {price !== null ? fmtPrice(locale, price, currency, assetType ?? "equity") : "-"}
      </span>
      <span className={`text-right text-[13px] font-semibold tabular-nums ${dailyTone}`}>
        {dailyChange === null ? "-" : `${dailyChange >= 0 ? "+" : ""}${dailyChange.toFixed(2)}%`}
      </span>
      <span className="flex justify-end">
        <AppBadge kind="status" label={quoteLabel.label} tone={quoteLabel.tone} title={quoteLabel.title} />
      </span>
      <span className="truncate text-[11px] font-medium text-[var(--app-text-muted)]">{item.note ?? "-"}</span>
      <span className="flex justify-end">
        <Tooltip title="Remove from watchlist">
          <span>
            <IconButton aria-label="Remove from watchlist" disabled={isRemoving} onClick={removeItem} size="small" sx={appIconButtonSx("destructive-action")}>
              <TrashIcon />
            </IconButton>
          </span>
        </Tooltip>
      </span>
    </Box>
  )
}

function EmptyWatchlistState({
  filtered,
  onAdd,
  onClearFilters,
}: {
  filtered: boolean
  onAdd: () => void
  onClearFilters: () => void
}) {
  return (
    <Stack spacing={1.5} sx={{ alignItems: "center", minHeight: 280, justifyContent: "center", px: 2 }}>
      <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>
        {filtered ? "No watchlist assets match these filters" : "No assets on your watchlist yet"}
      </Typography>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12, maxWidth: 420, textAlign: "center" }}>
        {filtered ? "Adjust the asset type or search query to broaden the view." : "Add assets you want to observe before opening a position."}
      </Typography>
      <Button onClick={filtered ? onClearFilters : onAdd} variant="outlined" size="small" sx={{ textTransform: "none" }}>
        {filtered ? "Clear filters" : "Add asset"}
      </Button>
    </Stack>
  )
}

function buildWatchlistMetrics(watchlistItems: WatchlistItemView[]) {
  const pricedAssets = watchlistItems.filter((item) => num(item.current_price) !== null).length
  const dailyValues = watchlistItems.map((item) => num(item.daily_change_pct)).filter((value): value is number => value !== null)
  return {
    negativeToday: dailyValues.filter((value) => value < 0).length,
    positiveToday: dailyValues.filter((value) => value > 0).length,
    pricedAssets,
    total: watchlistItems.length,
    unchangedToday: dailyValues.filter((value) => value === 0).length,
    unavailableAssets: watchlistItems.length - pricedAssets,
  }
}

function countTabs(watchlistItems: WatchlistItemView[]): Record<InstrumentAssetType, number> {
  return watchlistItems.reduce<Record<InstrumentAssetType, number>>((counts, item) => {
    if (item.listing?.asset_type) counts[item.listing.asset_type] += 1
    return counts
  }, { crypto: 0, equity: 0, fund: 0, index: 0 })
}

function matchesWatchlistItem(item: WatchlistItemView, searchTerm: string): boolean {
  if (!searchTerm) return true
  const listing = item.listing
  return [
    listing?.name,
    listing?.symbol,
    listing?.currency,
    listing?.asset_type,
    item.note,
  ].filter(Boolean).some((value) => String(value).toLowerCase().includes(searchTerm))
}

function compareWatchlistItems(firstItem: WatchlistItemView, secondItem: WatchlistItemView): number {
  const firstName = firstItem.listing?.name ?? firstItem.listing_id
  const secondName = secondItem.listing?.name ?? secondItem.listing_id
  return firstName.localeCompare(secondName)
}

function formatQuoteLabel(value: string | null, locale: string): { label: string; title: string; tone: "success" | "warning" | "neutral" } {
  if (!value) return { label: "No quote", title: "No quote is available yet.", tone: "warning" }
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return { label: "Quoted", title: value, tone: "neutral" }
  return {
    label: date.toLocaleDateString(locale, { day: "2-digit", month: "short" }),
    title: date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }),
    tone: "success",
  }
}

function BookmarkIcon() {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24"><path d="M6 4h12v16l-6-3-6 3V4Z" /></svg>
}

function QuoteIcon() {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24"><path d="M4 18V6" /><path d="M9 18v-5" /><path d="M14 18V9" /><path d="M19 18V4" /></svg>
}

function TrendUpIcon() {
  return <svg aria-hidden="true" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24"><path d="m5 15 5-5 4 4 5-7" /><path d="M14 7h5v5" /></svg>
}

function TrashIcon() {
  return <svg aria-hidden="true" fill="none" height="15" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.9" viewBox="0 0 24 24" width="15"><path d="M4 7h16" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M6 7l1 14h10l1-14" /><path d="M9 7V4h6v3" /></svg>
}
