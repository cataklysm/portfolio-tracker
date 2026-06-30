"use client"

import { useEffect, useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  MenuItem,
  Pagination,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { ControlBar, type ControlBarFilterBadge } from "@/design/components/ControlBar"
import { MetricBar, MetricBarItem } from "@/design/components/MetricBar"
import { AppIcon } from "@/design/icons/AppIcon"
import { PageShell } from "@/application/shell/PageShell"
import { selectableRowSx } from "@/design/tokens/rowSelection"
import { useToast } from "@/application/toast/ToastProvider"
import type { PortfolioNews } from "@/lib/portfolio-events"

const PAGE_SIZE = 12

type NewsFilter = "all" | "unread" | "important" | "saved"
type SortMode = "newest" | "oldest" | "impact"
type Impact = "high" | "medium" | "low" | "unknown"
type Category = "earnings" | "corporate_action" | "analyst_rating" | "product" | "legal" | "macro" | "mna" | "management" | "dividend" | "other"
type DateRange = "today" | "7d" | "30d" | "custom"
type FacetKey = "impact" | "source" | "sector" | "holding" | "category"

const filterOptions = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "important", label: "Important" },
  { value: "saved", label: "Saved" },
] as const

const dateRangeOptions = [
  { value: "today", label: "Today" },
  { value: "7d", label: "7D" },
  { value: "30d", label: "30D" },
  { value: "custom", label: "Custom" },
] as const

const impactOptions: Impact[] = ["high", "medium", "low", "unknown"]

const categoryOptions: Category[] = ["earnings", "corporate_action", "analyst_rating", "product", "legal", "macro", "mna", "management", "dividend", "other"]

const categoryLabels: Record<Category, string> = {
  analyst_rating: "Analyst rating",
  corporate_action: "Corporate action",
  dividend: "Dividend",
  earnings: "Earnings",
  legal: "Legal",
  macro: "Macro",
  management: "Management",
  mna: "M&A",
  other: "Other",
  product: "Product",
}

const sourceLabels: Record<string, string> = {
  company_ir: "Company IR",
  reuters: "Reuters",
  sec: "SEC",
  yahoo: "Yahoo",
}

const impactRank: Record<Impact, number> = {
  high: 4,
  medium: 3,
  low: 2,
  unknown: 1,
}

interface NewsWorkspaceProps {
  news: PortfolioNews[]
  locale: string
}

interface EnrichedNews extends PortfolioNews {
  affectedInstrumentIds: string[]
  category: Category
  holdingKeys: string[]
  impact: Impact
  publishedAt: Date
  sectorKeys: string[]
  source: string
}

interface FilterCriteria {
  categorySelections: Set<Category>
  customFrom: string
  customTo: string
  dateRange: DateRange
  holdingSelections: Set<string>
  holdingsOnly: boolean
  impactSelections: Set<Impact>
  query: string
  readIds: Set<string>
  savedIds: Set<string>
  sectorSelections: Set<string>
  sourceSelections: Set<string>
  status: NewsFilter
  today: Date
}

export function NewsWorkspace({ news, locale }: NewsWorkspaceProps) {
  const router = useRouter()
  const { info, success } = useToast()
  const [isRefreshing, startRefreshTransition] = useTransition()
  const [filter, setFilter] = useState<NewsFilter>("all")
  const [query, setQuery] = useState("")
  const [impactSelections, setImpactSelections] = useState<Set<Impact>>(() => new Set())
  const [sourceSelections, setSourceSelections] = useState<Set<string>>(() => new Set())
  const [sectorSelections, setSectorSelections] = useState<Set<string>>(() => new Set())
  const [holdingSelections, setHoldingSelections] = useState<Set<string>>(() => new Set())
  const [categorySelections, setCategorySelections] = useState<Set<Category>>(() => new Set())
  const [dateRange, setDateRange] = useState<DateRange>("30d")
  const [customFrom, setCustomFrom] = useState("")
  const [customTo, setCustomTo] = useState("")
  const [sort, setSort] = useState<SortMode>("newest")
  const [holdingsOnly, setHoldingsOnly] = useState(true)
  const [holdingFacetQuery, setHoldingFacetQuery] = useState("")
  const [page, setPage] = useState(1)
  const [selectedId, setSelectedId] = useState(news[0]?.id ?? null)
  const [readIds, setReadIds] = useState<Set<string>>(() => new Set())
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set())

  const items = useMemo<EnrichedNews[]>(() => news.map((item) => ({
    ...item,
    affectedInstrumentIds: item.context.instrumentId ? [item.context.instrumentId] : [],
    category: categorizeNews(item),
    holdingKeys: item.context.instrumentId ? [item.context.instrumentId] : [],
    impact: impactNews(item),
    publishedAt: new Date(item.published_at),
    sectorKeys: ["unmapped"],
    source: normalizeSource(item.provider),
  })), [news])

  const searchTerm = query.trim().toLowerCase()
  const today = useMemo(() => startOfDay(new Date()), [])
  const criteria = useMemo<FilterCriteria>(() => ({
    categorySelections,
    customFrom,
    customTo,
    dateRange,
    holdingSelections,
    holdingsOnly,
    impactSelections,
    query: searchTerm,
    readIds,
    savedIds,
    sectorSelections,
    sourceSelections,
    status: filter,
    today,
  }), [categorySelections, customFrom, customTo, dateRange, filter, holdingSelections, holdingsOnly, impactSelections, readIds, savedIds, searchTerm, sectorSelections, sourceSelections, today])

  const filtered = useMemo(() => {
    const next = filterNews(items, criteria)

    if (sort === "impact") return next.sort((first, second) => impactRank[second.impact] - impactRank[first.impact] || second.publishedAt.getTime() - first.publishedAt.getTime())
    if (sort === "oldest") return next.sort((first, second) => first.publishedAt.getTime() - second.publishedAt.getTime())
    return next.sort((first, second) => second.publishedAt.getTime() - first.publishedAt.getTime())
  }, [criteria, items, sort])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const normalizedPage = Math.min(page, pageCount)
  const pageItems = filtered.slice((normalizedPage - 1) * PAGE_SIZE, normalizedPage * PAGE_SIZE)
  const selected = filtered.find((item) => item.id === selectedId) ?? pageItems[0] ?? filtered[0] ?? null

  const metrics = useMemo(() => {
    const uniqueHoldings = new Set(filtered.flatMap((item) => item.affectedInstrumentIds))
    const duplicateGroups = filtered.length - new Set(filtered.map((item) => normalizeHeadline(item.headline))).size
    return {
      unread: filtered.filter((item) => !readIds.has(item.id)).length,
      highImpact: filtered.filter((item) => item.impact === "high").length,
      holdings: uniqueHoldings.size,
      duplicates: Math.max(0, duplicateGroups),
    }
  }, [filtered, readIds])

  const facetCounts = useMemo(() => ({
    category: countFacet(filterNews(items, criteria, "category"), (item) => [item.category]),
    holding: countFacet(filterNews(items, criteria, "holding"), (item) => item.holdingKeys),
    impact: countFacet(filterNews(items, criteria, "impact"), (item) => [item.impact]),
    sector: countFacet(filterNews(items, criteria, "sector"), (item) => item.sectorKeys),
    source: countFacet(filterNews(items, criteria, "source"), (item) => [item.source]),
  }), [criteria, items])

  const statusCounts = useMemo(() => {
    const withoutStatus = filterNews(items, criteria, "status")
    return {
      all: withoutStatus.length,
      important: withoutStatus.filter((item) => isImportant(item)).length,
      saved: withoutStatus.filter((item) => savedIds.has(item.id)).length,
      unread: withoutStatus.filter((item) => !readIds.has(item.id)).length,
    }
  }, [criteria, items, readIds, savedIds])

  const holdingLabels = useMemo(() => {
    const labels = new Map<string, string>()
    for (const item of items) {
      if (item.context.instrumentId) labels.set(item.context.instrumentId, item.context.name)
    }
    return labels
  }, [items])

  const controlBadges = useMemo<ControlBarFilterBadge[]>(() => [
    ...[...impactSelections].map((impact) => ({
      id: `impact-${impact}`,
      label: "Impact",
      value: capitalize(impact),
      onClear: () => setImpactSelections((current) => removeSetValue(current, impact)),
    })),
    ...[...sourceSelections].map((source) => ({
      id: `source-${source}`,
      label: "Source",
      value: sourceLabel(source),
      onClear: () => setSourceSelections((current) => removeSetValue(current, source)),
    })),
    ...[...sectorSelections].map((sector) => ({
      id: `sector-${sector}`,
      label: "Sector",
      value: sectorLabel(sector),
      onClear: () => setSectorSelections((current) => removeSetValue(current, sector)),
    })),
    ...[...categorySelections].map((category) => ({
      id: `category-${category}`,
      label: "Category",
      value: categoryLabels[category],
      onClear: () => setCategorySelections((current) => removeSetValue(current, category)),
    })),
    ...[...holdingSelections].map((holding) => ({
      id: `holding-${holding}`,
      label: "Holding",
      value: holdingLabels.get(holding) ?? holding,
      onClear: () => setHoldingSelections((current) => removeSetValue(current, holding)),
    })),
  ], [categorySelections, holdingLabels, holdingSelections, impactSelections, sectorSelections, sourceSelections])

  useEffect(() => {
    setPage(1)
  }, [categorySelections, customFrom, customTo, dateRange, filter, holdingSelections, holdingsOnly, impactSelections, query, sectorSelections, sort, sourceSelections])

  useEffect(() => {
    if (selected && filtered.some((item) => item.id === selected.id)) return
    setSelectedId(pageItems[0]?.id ?? filtered[0]?.id ?? null)
  }, [filtered, pageItems, selected])

  function clearFilters() {
    setFilter("all")
    setQuery("")
    setImpactSelections(new Set())
    setSourceSelections(new Set())
    setSectorSelections(new Set())
    setHoldingSelections(new Set())
    setCategorySelections(new Set())
    setDateRange("30d")
    setCustomFrom("")
    setCustomTo("")
    setSort("newest")
    setHoldingsOnly(true)
  }

  function toggleImpact(impact: Impact) {
    setImpactSelections((current) => toggleSetValue(current, impact))
  }

  function toggleSource(source: string) {
    setSourceSelections((current) => toggleSetValue(current, source))
  }

  function toggleSector(sector: string) {
    setSectorSelections((current) => toggleSetValue(current, sector))
  }

  function toggleHolding(holding: string) {
    setHoldingSelections((current) => toggleSetValue(current, holding))
  }

  function toggleCategory(category: Category) {
    setCategorySelections((current) => toggleSetValue(current, category))
  }

  function refreshNews() {
    if (isRefreshing) return
    startRefreshTransition(() => {
      router.refresh()
      success("News reloaded.")
    })
  }

  function markRead(id: string) {
    setReadIds((current) => {
      const next = new Set(current)
      next.add(id)
      return next
    })
    info("Marked as read.")
  }

  function toggleSaved(id: string) {
    setSavedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <PageShell kind="workspace">
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12, fontWeight: 600 }}>
          Portfolio
        </Typography>
        <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>
          News
        </Typography>
      </Breadcrumbs>

      <MetricBar columns={{ xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }}>
        <MetricBarItem icon={<AppIcon name="mail" />} label="Unread" primary sub="Current view" tone="accent" value={metrics.unread} />
        <MetricBarItem icon={<AppIcon name="flame" />} label="High impact" primary sub="Current view" tone="danger" value={metrics.highImpact} />
        <MetricBarItem icon={<AppIcon name="building" />} label="Holdings mentioned" primary sub="Unique holdings" tone="positive" value={metrics.holdings} />
        <MetricBarItem icon={<AppIcon name="duplicate" />} label="Duplicate groups" primary sub="Potential overlap" tone="warning" value={metrics.duplicates} />
      </MetricBar>

      <ControlBar
        badges={controlBadges}
        defaultPeriodValue="30d"
        defaultTabValue="all"
        onClearFilters={clearFilters}
        onPeriodChange={setDateRange}
        onReload={refreshNews}
        onSearchChange={setQuery}
        onTabChange={setFilter}
        periodAddon={dateRange === "custom" ? <CustomDateFields from={customFrom} to={customTo} onFrom={setCustomFrom} onTo={setCustomTo} /> : null}
        periodLabel="Range"
        periodOptions={dateRangeOptions}
        periodValue={dateRange}
        reloadLabel="Reload news"
        reloadLoading={isRefreshing}
        searchPlaceholder="Search news, companies, or topics"
        searchValue={query}
        tabs={filterOptions.map((option) => ({
          ...option,
          count: option.value === "all" ? undefined : statusCounts[option.value],
        }))}
        tabValue={filter}
      />

      <Box sx={{ alignItems: "stretch", display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "280px minmax(760px, 1fr) 520px" } }}>
        <NewsFilters
          categoryCounts={facetCounts.category}
          categorySelections={categorySelections}
          holdingCounts={facetCounts.holding}
          holdingFacetQuery={holdingFacetQuery}
          holdingLabels={holdingLabels}
          holdingSelections={holdingSelections}
          impactCounts={facetCounts.impact}
          impactSelections={impactSelections}
          sectorCounts={facetCounts.sector}
          sectorSelections={sectorSelections}
          sourceCounts={facetCounts.source}
          sourceSelections={sourceSelections}
          onClear={clearFilters}
          onHoldingFacetQuery={setHoldingFacetQuery}
          onImpact={toggleImpact}
          onSource={toggleSource}
          onSector={toggleSector}
          onHolding={toggleHolding}
          onCategory={toggleCategory}
        />

        <NewsInbox
          items={pageItems}
          clearFilters={clearFilters}
          selectedId={selected?.id ?? null}
          readIds={readIds}
          locale={locale}
          sort={sort}
          onSort={setSort}
          onSelect={(item) => {
            setSelectedId(item.id)
            setReadIds((current) => new Set(current).add(item.id))
          }}
          range={{
            start: filtered.length === 0 ? 0 : (normalizedPage - 1) * PAGE_SIZE + 1,
            end: Math.min(normalizedPage * PAGE_SIZE, filtered.length),
            total: filtered.length,
          }}
          page={normalizedPage}
          pageCount={pageCount}
          onPage={setPage}
        />

        <StoryDetails
          item={selected}
          locale={locale}
          saved={selected ? savedIds.has(selected.id) : false}
          related={selected ? relatedNews(items, selected) : []}
          onMarkRead={selected ? () => markRead(selected.id) : undefined}
          onToggleSaved={selected ? () => toggleSaved(selected.id) : undefined}
        />
      </Box>
    </PageShell>
  )
}

function CustomDateFields({ from, to, onFrom, onTo }: {
  from: string
  to: string
  onFrom: (value: string) => void
  onTo: (value: string) => void
}) {
  return (
    <Stack direction="row" spacing={1}>
      <TextField type="date" variant="standard" size="small" value={from} onChange={(event) => onFrom(event.target.value)} sx={{ width: 135 }} />
      <TextField type="date" variant="standard" size="small" value={to} onChange={(event) => onTo(event.target.value)} sx={{ width: 135 }} />
    </Stack>
  )
}

function NewsFilters({ categoryCounts, categorySelections, holdingCounts, holdingFacetQuery, holdingLabels, holdingSelections, impactCounts, impactSelections, sectorCounts, sectorSelections, sourceCounts, sourceSelections, onCategory, onClear, onHolding, onHoldingFacetQuery, onImpact, onSector, onSource }: {
  categoryCounts: Map<string, number>
  categorySelections: Set<Category>
  holdingCounts: Map<string, number>
  holdingFacetQuery: string
  holdingLabels: Map<string, string>
  holdingSelections: Set<string>
  impactCounts: Map<string, number>
  impactSelections: Set<Impact>
  sectorCounts: Map<string, number>
  sectorSelections: Set<string>
  sourceCounts: Map<string, number>
  sourceSelections: Set<string>
  onCategory: (value: Category) => void
  onClear: () => void
  onHolding: (value: string) => void
  onHoldingFacetQuery: (value: string) => void
  onImpact: (value: Impact) => void
  onSector: (value: string) => void
  onSource: (value: string) => void
}) {
  const sourceEntries = sortedFacetEntries(sourceCounts, (value) => sourceLabel(value))
  const sectorEntries = sortedFacetEntries(sectorCounts, sectorLabel)
  const categoryEntries = categoryOptions
    .map((value) => [value, categoryCounts.get(value) ?? 0] as const)
    .filter(([, count]) => count > 0)
  const holdingSearch = holdingFacetQuery.trim().toLowerCase()
  const holdingEntries = sortedFacetEntries(holdingCounts, (value) => holdingLabels.get(value) ?? value)
    .filter(([value]) => !holdingSearch || (holdingLabels.get(value) ?? value).toLowerCase().includes(holdingSearch))
    .slice(0, 8)
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 13, fontWeight: 800 }}>Filters</Typography>
        <Button size="small" onClick={onClear} sx={{ fontSize: 11, textTransform: "none" }}>Clear all</Button>
      </Stack>

      <FilterSection title="Impact">
        {impactOptions.map((impact) => (
          <FilterOption
            key={impact}
            checked={impactSelections.has(impact)}
            label={capitalize(impact)}
            count={impactCounts.get(impact) ?? 0}
            tone={impact}
            onClick={() => onImpact(impact)}
          />
        ))}
      </FilterSection>

      <FilterSection title="Source">
        {sourceEntries.map(([value, count]) => (
          <FilterOption key={value} checked={sourceSelections.has(value)} label={sourceLabel(value)} count={count} onClick={() => onSource(value)} />
        ))}
      </FilterSection>

      <FilterSection title="Sector">
        {sectorEntries.map(([value, count]) => (
          <FilterOption key={value} checked={sectorSelections.has(value)} label={sectorLabel(value)} count={count} onClick={() => onSector(value)} />
        ))}
      </FilterSection>

      <FilterSection title="Category">
        {categoryEntries.map(([value, count]) => (
          <FilterOption key={value} checked={categorySelections.has(value)} label={categoryLabels[value]} count={count} onClick={() => onCategory(value)} />
        ))}
      </FilterSection>

      <FilterSection title="Holding" last spacious>
        <TextField
          variant="standard"
          value={holdingFacetQuery}
          onChange={(event) => onHoldingFacetQuery(event.target.value)}
          onInput={(event) => onHoldingFacetQuery((event.target as HTMLInputElement).value)}
          size="small"
          placeholder="Search holdings"
          sx={{
            mb: 1,
            mt: -0.25,
            width: "100%",
            "& .MuiInputBase-root": { px: 0.25 },
            "& .MuiInputBase-input": { fontSize: 11, py: 0.65 },
            "& .MuiInputAdornment-root": { color: "var(--app-text-muted)", mr: 0.5 },
            "&:before": { borderBottomColor: "var(--app-border)" },
            "&:hover:not(.Mui-disabled):before": { borderBottomColor: "var(--app-text-muted)" },
            "&:after": { borderBottomColor: "var(--app-accent)" },
          }}
          slotProps={{
            input: {
              startAdornment: <InputAdornment position="start"><SearchIcon /></InputAdornment>,
            },
          }}
        />
        {holdingEntries.map(([value, count]) => (
          <FilterOption key={value} checked={holdingSelections.has(value)} label={holdingLabels.get(value) ?? value} count={count} onClick={() => onHolding(value)} />
        ))}
      </FilterSection>
    </Card>
  )
}

function FilterSection({ title, children, last = false, spacious = false }: { title: string; children: React.ReactNode; last?: boolean; spacious?: boolean }) {
  return (
    <Box sx={{ borderBottom: last ? 0 : "1px solid var(--app-border)", px: 1.5, py: 1.25 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center", mb: spacious ? 1.1 : 0.75 }}>
        <ChevronDownIcon />
        <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>{title}</Typography>
      </Stack>
      <Stack spacing={spacious ? 0.45 : 0.25}>{children}</Stack>
    </Box>
  )
}

function FilterOption({ checked, label, count, tone, disabled = false, onClick }: { checked: boolean; label: string; count: number; tone?: Impact; disabled?: boolean; onClick: () => void }) {
  return (
    <Stack component="button" type="button" onClick={onClick} disabled={disabled} direction="row" sx={{ alignItems: "center", bgcolor: "transparent", border: 0, color: disabled ? "var(--app-text-faint)" : "var(--app-text-muted)", cursor: disabled ? "default" : "pointer", gap: 0.75, px: 0, py: 0.25, textAlign: "left", width: "100%", "&:hover": disabled ? undefined : { color: "var(--app-text)" } }}>
      <Checkbox checked={checked} size="small" sx={{ p: 0 }} />
      {tone ? <ImpactDot impact={tone} /> : null}
      <Typography noWrap sx={{ flex: 1, fontSize: 11 }}>{label}</Typography>
      <Chip label={count} size="small" variant="outlined" />
    </Stack>
  )
}

function NewsInbox({ clearFilters, items, selectedId, readIds, locale, sort, range, page, pageCount, onSort, onSelect, onPage }: {
  clearFilters: () => void
  items: EnrichedNews[]
  selectedId: string | null
  readIds: Set<string>
  locale: string
  sort: SortMode
  range: { start: number; end: number; total: number }
  page: number
  pageCount: number
  onSort: (sort: SortMode) => void
  onSelect: (item: EnrichedNews) => void
  onPage: (page: number) => void
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", flexDirection: "column", height: "100%", minHeight: 640, overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>News inbox</Typography>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 10 }}>{range.total} items</Typography>
        </Stack>
        <FormControl variant="standard" size="small" sx={{ minWidth: 120 }}>
          <Select value={sort} onChange={(event) => onSort(event.target.value as SortMode)} sx={{ color: "var(--app-text)", fontSize: 11 }}>
            <MenuItem value="newest">Sort: Newest</MenuItem>
            <MenuItem value="oldest">Sort: Oldest</MenuItem>
            <MenuItem value="impact">Sort: Impact</MenuItem>
          </Select>
        </FormControl>
      </Stack>

      <Box sx={{ overflowX: "auto" }}>
        <Box component="table" sx={{ borderCollapse: "collapse", minWidth: 760, tableLayout: "fixed", width: "100%" }}>
          <Box component="thead">
            <Box component="tr" sx={{ borderBottom: "1px solid var(--app-border)" }}>
              {[
                { label: "", width: 34 },
                { label: "Headline", width: "42%" },
                { label: "Holding", width: 160 },
                { label: "Time", width: 72 },
                { label: "Source", width: 62 },
                { label: "Impact", width: 94 },
              ].map((heading, index) => (
                <Typography key={heading.label || "select"} component="th" sx={{ color: "var(--app-text-faint)", fontSize: 10, fontWeight: 600, px: 1.25, py: 1, textAlign: index > 2 ? "right" : "left", width: heading.width }}>
                  {heading.label}
                </Typography>
              ))}
            </Box>
          </Box>
          <Box component="tbody">
            {items.length > 0 ? items.map((item) => (
              <NewsRow key={item.id} item={item} selected={item.id === selectedId} read={readIds.has(item.id)} locale={locale} onSelect={() => onSelect(item)} />
            )) : (
              <Box component="tr">
                <Box component="td" colSpan={6} sx={{ px: 2, py: 8 }}>
                  <Stack spacing={1.25} sx={{ alignItems: "center" }}>
                    <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800, textAlign: "center" }}>No news match these filters</Typography>
                    <Button variant="outlined" size="small" onClick={clearFilters}>Clear filters</Button>
                  </Stack>
                </Box>
              </Box>
            )}
          </Box>
        </Box>
      </Box>

      <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ alignItems: { xs: "stretch", sm: "center" }, borderTop: "1px solid var(--app-border)", bgcolor: "var(--app-surface-raised)", justifyContent: "space-between", mt: "auto", px: 1.5, py: 1 }}>
        <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{range.start}-{range.end} of {range.total}</Typography>
        <Pagination page={page} count={pageCount} onChange={(_, nextPage) => onPage(nextPage)} size="small" siblingCount={1} boundaryCount={1} />
      </Stack>
    </Card>
  )
}

function NewsRow({ item, selected, read, locale, onSelect }: { item: EnrichedNews; selected: boolean; read: boolean; locale: string; onSelect: () => void }) {
  return (
    <Box component="tr" aria-selected={selected} onClick={onSelect} sx={{ ...selectableRowSx(selected), borderBottom: "1px solid var(--app-border)", cursor: "pointer" }}>
      <Box component="td" sx={{ px: 1.25, py: 1.1, width: 34 }}>
        <Checkbox checked={selected} size="small" sx={{ p: 0 }} />
      </Box>
      <Box component="td" sx={{ minWidth: 0, px: 1.25, py: 1.1 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-start", minWidth: 0 }}>
          {!read ? <Box sx={{ bgcolor: "var(--app-accent)", borderRadius: "50%", height: 7, mt: 0.65, width: 7, flexShrink: 0 }} /> : null}
          <Box sx={{ minWidth: 0 }}>
            <Typography noWrap title={item.headline} sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: read ? 600 : 800 }}>{truncateHeadline(item.headline)}</Typography>
            <Typography noWrap sx={{ color: "var(--app-text-muted)", fontSize: 10, mt: 0.25 }}>{categoryLabels[item.category]} news for {item.context.name}</Typography>
          </Box>
        </Stack>
      </Box>
      <Box component="td" sx={{ minWidth: 0, px: 1.25, py: 1.1 }}>
        <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 11, fontWeight: 700 }}>{item.context.name}</Typography>
        <Chip label={item.context.symbol} size="small" variant="outlined" />
      </Box>
      <TableCell align="right">{relativeTime(item.publishedAt, locale)}</TableCell>
      <TableCell align="right">{sourceLabel(item.source)}</TableCell>
      <Box component="td" sx={{ px: 1.25, py: 1.1, textAlign: "right" }}>
        <ImpactChip impact={item.impact} />
      </Box>
    </Box>
  )
}

function StoryDetails({ item, locale, saved, related, onMarkRead, onToggleSaved }: { item: EnrichedNews | null; locale: string; saved: boolean; related: EnrichedNews[]; onMarkRead?: () => void; onToggleSaved?: () => void }) {
  if (!item) {
    return (
      <Card variant="outlined" sx={{ alignItems: "center", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", height: "100%", justifyContent: "center", minHeight: 420, p: 3 }}>
        <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12, textAlign: "center" }}>Select a news item to inspect details.</Typography>
      </Card>
    )
  }

  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Story details</Typography>
        <Stack direction="row" spacing={0.5}>
          <Tooltip title={saved ? "Remove saved" : "Save"}>
            <IconButton size="small" onClick={onToggleSaved} sx={{ color: saved ? "var(--app-accent)" : "var(--app-text-muted)" }}>
              <BookmarkIcon filled={saved} />
            </IconButton>
          </Tooltip>
        </Stack>
      </Stack>

      <Box sx={{ display: "grid", flex: 1, gridTemplateRows: "minmax(0, 1fr) auto auto", minHeight: 0 }}>
        <Box sx={{ minHeight: 0, overflowY: "auto", p: 1.75 }}>
          <Typography component="h2" title={item.headline} sx={{ color: "var(--app-text)", fontSize: 18, fontWeight: 800, lineHeight: 1.25 }}>
            {truncateHeadline(item.headline)}
          </Typography>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "var(--app-text-muted)", flexWrap: "wrap", mt: 1.5 }}>
            <Typography sx={{ fontSize: 11 }}>{sourceLabel(item.source)}</Typography>
            <Typography sx={{ fontSize: 11 }}>|</Typography>
            <Typography sx={{ fontSize: 11 }}>{formatDateTime(item.publishedAt, locale)}</Typography>
            <ImpactChip impact={item.impact} />
          </Stack>

          <Divider sx={{ borderColor: "var(--app-border)", my: 2 }} />

          <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800, mb: 1 }}>Related holding</Typography>
          <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)", p: 1.25 }}>
            <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
              <Box sx={{ alignItems: "center", bgcolor: "var(--app-accent)", borderRadius: "50%", color: "white", display: "flex", fontSize: 11, fontWeight: 800, height: 34, justifyContent: "center", width: 34 }}>
                {item.context.symbol.slice(0, 3).toUpperCase()}
              </Box>
              <Box sx={{ minWidth: 0 }}>
                <Link href={`/positions/${item.context.positionId}`} style={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800, textDecoration: "none" }}>
                  {item.context.name}
                </Link>
                <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10 }}>{item.context.symbol}</Typography>
              </Box>
            </Stack>
          </Card>

          <Divider sx={{ borderColor: "var(--app-border)", my: 2 }} />

          <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800, mb: 0.75 }}>Summary</Typography>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12, lineHeight: 1.6 }}>
            This headline was published by {sourceLabel(item.source)} and is linked to {item.context.name}. Open the source article for the full story.
          </Typography>
        </Box>

        <Box sx={{ borderTop: "1px solid var(--app-border)", flex: "0 0 auto", p: 1.75 }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800, mb: 1 }}>Related headlines</Typography>
          <Stack spacing={1}>
            {related.length > 0 ? related.slice(0, 3).map((relatedItem) => (
              <Box key={relatedItem.id} sx={{ borderBottom: "1px solid var(--app-border)", pb: 1 }}>
                <Typography noWrap title={relatedItem.headline} sx={{ color: "var(--app-text)", fontSize: 11, fontWeight: 700 }}>{truncateHeadline(relatedItem.headline)}</Typography>
                <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10 }}>{sourceLabel(relatedItem.source)} | {relativeTime(relatedItem.publishedAt, locale)}</Typography>
              </Box>
            )) : <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11 }}>No related headlines in the current feed.</Typography>}
          </Stack>
        </Box>

        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ bgcolor: "var(--app-surface-raised)", borderTop: "1px solid var(--app-border)", flex: "0 0 auto", justifyContent: "flex-end", p: 1.5 }}>
          <Button variant="outlined" onClick={onMarkRead} startIcon={<MailIcon />}>Mark read</Button>
          <Button variant="outlined" onClick={onToggleSaved} startIcon={<BookmarkIcon filled={saved} />}>{saved ? "Saved" : "Save"}</Button>
          {item.url ? (
            <Button variant="contained" href={item.url} target="_blank" rel="noopener noreferrer" startIcon={<OpenIcon />}>Open</Button>
          ) : (
            <Button variant="contained" disabled startIcon={<OpenIcon />}>Open</Button>
          )}
        </Stack>
      </Box>
    </Card>
  )
}

function ImpactChip({ impact }: { impact: Impact }) {
  const color = impact === "high" ? "error" : impact === "medium" ? "warning" : impact === "low" ? "success" : "default"
  return <Chip label={capitalize(impact)} color={color} variant="outlined" size="small" />
}

function ImpactDot({ impact }: { impact: Impact }) {
  const color = impact === "high" ? "var(--app-negative)" : impact === "medium" ? "var(--app-warning)" : impact === "low" ? "var(--app-positive)" : "var(--app-text-faint)"
  return <Box sx={{ bgcolor: color, borderRadius: "50%", height: 7, width: 7 }} />
}

function TableCell({ align = "left", children }: { align?: "left" | "right"; children: React.ReactNode }) {
  return (
    <Typography component="td" sx={{ color: "var(--app-text-muted)", fontSize: 11, px: 1.25, py: 1.1, textAlign: align, whiteSpace: "nowrap" }}>
      {children}
    </Typography>
  )
}

function filterNews(items: EnrichedNews[], criteria: FilterCriteria, excludeFacet?: FacetKey | "status"): EnrichedNews[] {
  return items
    .filter((item) => excludeFacet === "status" || matchesStatus(item, criteria))
    .filter((item) => matchesDateRange(item, criteria))
    .filter((item) => !criteria.holdingsOnly || item.affectedInstrumentIds.length > 0)
    .filter((item) => matchesSearch(item, criteria.query))
    .filter((item) => excludeFacet === "impact" || criteria.impactSelections.size === 0 || criteria.impactSelections.has(item.impact))
    .filter((item) => excludeFacet === "source" || criteria.sourceSelections.size === 0 || criteria.sourceSelections.has(item.source))
    .filter((item) => excludeFacet === "sector" || criteria.sectorSelections.size === 0 || item.sectorKeys.some((sector) => criteria.sectorSelections.has(sector)))
    .filter((item) => excludeFacet === "holding" || criteria.holdingSelections.size === 0 || item.holdingKeys.some((holding) => criteria.holdingSelections.has(holding)))
    .filter((item) => excludeFacet === "category" || criteria.categorySelections.size === 0 || criteria.categorySelections.has(item.category))
}

function matchesStatus(item: EnrichedNews, criteria: FilterCriteria): boolean {
  if (criteria.status === "all") return true
  if (criteria.status === "unread") return !criteria.readIds.has(item.id)
  if (criteria.status === "important") return isImportant(item)
  return criteria.savedIds.has(item.id)
}

function matchesDateRange(item: EnrichedNews, criteria: FilterCriteria): boolean {
  const published = startOfDay(item.publishedAt)
  if (criteria.dateRange === "today") return published.getTime() === criteria.today.getTime()
  if (criteria.dateRange === "7d" || criteria.dateRange === "30d") {
    const min = new Date(criteria.today)
    min.setDate(min.getDate() - (criteria.dateRange === "7d" ? 7 : 30))
    return published >= min && published <= criteria.today
  }
  const from = criteria.customFrom ? startOfDay(new Date(criteria.customFrom)) : null
  const to = criteria.customTo ? startOfDay(new Date(criteria.customTo)) : null
  if (from && published < from) return false
  if (to && published > to) return false
  return true
}

function isImportant(item: EnrichedNews): boolean {
  return item.impact === "high"
}

function countFacet(items: EnrichedNews[], getKeys: (item: EnrichedNews) => string[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    for (const key of new Set(getKeys(item))) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return counts
}

function toggleSetValue<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current)
  if (next.has(value)) next.delete(value)
  else next.add(value)
  return next
}

function removeSetValue<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current)
  next.delete(value)
  return next
}

function sortedFacetEntries(counts: Map<string, number>, getLabel: (value: string) => string): [string, number][] {
  return [...counts.entries()]
    .filter(([, count]) => count > 0)
    .sort((first, second) => second[1] - first[1] || getLabel(first[0]).localeCompare(getLabel(second[0])))
}

function matchesSearch(item: EnrichedNews, searchTerm: string): boolean {
  if (!searchTerm) return true
  return [item.headline, sourceLabel(item.source), item.context.name, item.context.symbol, categoryLabels[item.category], item.impact]
    .some((value) => value.toLowerCase().includes(searchTerm))
}

function impactNews(item: PortfolioNews): Impact {
  const sentiment = item.sentiment?.toLowerCase()
  if (sentiment?.includes("negative") || sentiment?.includes("positive")) return "high"
  if (sentiment?.includes("neutral")) return "medium"
  const headline = item.headline.toLowerCase()
  if (/\b(beat|miss|surge|plunge|warn|cuts|raises|acquire|merger|lawsuit|profit|loss|guidance|contract)\b/.test(headline)) return "high"
  if (/\b(launch|expand|dividend|split|report|forecast|target|deal)\b/.test(headline)) return "medium"
  return "unknown"
}

function categorizeNews(item: PortfolioNews): Category {
  const headline = item.headline.toLowerCase()
  if (/\b(earnings|eps|profit|revenue|quarter|guidance|forecast)\b/.test(headline)) return "earnings"
  if (/\b(dividend|distribution)\b/.test(headline)) return "dividend"
  if (/\b(split|buyback|spin.?off|corporate action)\b/.test(headline)) return "corporate_action"
  if (/\b(upgrade|downgrade|rating|price target|analyst)\b/.test(headline)) return "analyst_rating"
  if (/\b(acquire|merger|takeover|m&a)\b/.test(headline)) return "mna"
  if (/\b(lawsuit|legal|court|probe|investigation|settlement)\b/.test(headline)) return "legal"
  if (/\b(rate|inflation|market|oil|opec|yield|fed|macro)\b/.test(headline)) return "macro"
  if (/\b(ceo|cfo|management|board|appoints|resigns)\b/.test(headline)) return "management"
  if (/\b(launch|product|service|platform|technology)\b/.test(headline)) return "product"
  return "other"
}

function relatedNews(items: EnrichedNews[], selected: EnrichedNews): EnrichedNews[] {
  return items
    .filter((item) => item.id !== selected.id)
    .filter((item) => item.context.instrumentId === selected.context.instrumentId || item.category === selected.category)
    .sort((first, second) => second.publishedAt.getTime() - first.publishedAt.getTime())
}

function normalizeHeadline(headline: string): string {
  return headline.toLowerCase().replace(/[^\w\s]/g, "").replace(/\s+/g, " ").trim()
}

function truncateHeadline(headline: string): string {
  return headline.length > 60 ? `${headline.slice(0, 57)}...` : headline
}

function normalizeSource(provider: string): string {
  return provider.trim().toLowerCase().replace(/[\s-]+/g, "_")
}

function sourceLabel(source: string): string {
  return sourceLabels[source] ?? source.split("_").map(capitalize).join(" ")
}

function sectorLabel(sector: string): string {
  return sector === "unmapped" ? "Unmapped" : sector.split("_").map(capitalize).join(" ")
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function relativeTime(date: Date, locale: string): string {
  const diffMs = Date.now() - date.getTime()
  const diffHours = Math.floor(diffMs / 3_600_000)
  if (diffHours < 1) return "Just now"
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" })
}

function formatDateTime(date: Date, locale: string): string {
  return date.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
}

function capitalize(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`
}

function MailIcon({ large = false }: { large?: boolean }) {
  return <AppIcon className={large ? "h-6 w-6" : "h-4 w-4"} name="mail" strokeWidth={1.8} />
}

function SearchIcon() {
  return <AppIcon className="h-4 w-4" name="search" strokeWidth={1.8} />
}

function BookmarkIcon({ filled = false }: { filled?: boolean }) {
  return <AppIcon className="h-4 w-4" filled={filled} name="bookmark" strokeWidth={1.8} />
}

function OpenIcon() {
  return <AppIcon className="h-4 w-4" name="openExternal" strokeWidth={1.8} />
}

function ChevronDownIcon() {
  return <AppIcon className="h-3.5 w-3.5" name="chevronDown" strokeWidth={1.8} />
}
