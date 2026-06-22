"use client"

import { Fragment, useEffect, useMemo, useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import {
  Autocomplete,
  Box,
  Breadcrumbs,
  Button,
  Card,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Pagination,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import {
  createAdminSymbolAction,
  deactivateAdminSymbolAction,
  getInstrumentSelectionsAction,
  listAdminSymbolsAction,
  listAdminSymbolEditMetadataAction,
  purgeAdminSymbolQuotesAction,
  rebuildAdminSymbolQuotesAction,
  searchProviderSymbolsAction,
  updateAdminSymbolAction,
  type ProviderSymbolHit,
} from "@/features/administration/symbols/actions"
import { ControlBar } from "@/application/shell/ControlBar"
import { PageShell } from "@/application/shell/PageShell"
import { selectableRowSx } from "@/application/shell/rowSelection"
import { useToast } from "@/application/toast/ToastProvider"
import type { AdminSymbolsPage, AdminSymbolView, ExchangeView, ProviderSettingsView } from "@/lib/types"

/**
 * Capability feed-groups that share one provider (mirrors the backend's
 * SELECTION_GROUPS): quotes+chart move together, earnings+corporate_actions+news
 * move together, fundamentals and analyst are standalone. `capability` is the
 * representative sent to the batch selection endpoint, which expands the group.
 */
const FEED_GROUPS = [
  { key: "price", label: "Quotes & chart", short: "Price", capability: "quotes" },
  { key: "events", label: "Earnings, actions & news", short: "Events", capability: "earnings" },
  { key: "fundamentals", label: "Fundamentals", short: "Fund.", capability: "fundamentals" },
  { key: "analyst", label: "Analyst", short: "Analyst", capability: "analyst" },
] as const

const symbolTabs = [
  { key: "equity", label: "Equity" },
  { key: "fund", label: "Funds" },
  { key: "crypto", label: "Crypto" },
  { key: "index", label: "Index" },
] as const

const SYMBOL_PAGE_SIZE = 12
const INLINE_EDIT_EXTRA_SLOTS = 8

type SymbolTab = (typeof symbolTabs)[number]["key"]

export function SymbolsAdministration({
  initialSymbolsPage,
  exchanges,
  providers,
}: {
  initialSymbolsPage: AdminSymbolsPage
  exchanges: ExchangeView[]
  providers: ProviderSettingsView[]
}) {
  const router = useRouter()
  const { showToast } = useToast()
  const [editExchanges, setEditExchanges] = useState(exchanges)
  const [editProviders, setEditProviders] = useState(providers)
  const [editMetadataLoaded, setEditMetadataLoaded] = useState(exchanges.length > 0 && providers.length > 0)
  const [editMetadataLoading, setEditMetadataLoading] = useState(false)
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<SymbolTab>("equity")
  const [page, setPage] = useState(1)
  const [symbolsPage, setSymbolsPage] = useState(initialSymbolsPage)
  const [loadingSymbols, setLoadingSymbols] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<AdminSymbolView | null>(null)
  const [removeCandidate, setRemoveCandidate] = useState<AdminSymbolView | null>(null)
  const [pending, startTransition] = useTransition()
  const searchTerm = query.trim()
  const symbolProviders = useMemo(() => editProviders.filter((provider) => provider.providerClass === "symbol"), [editProviders])
  const filteredTabCounts = symbolsPage.counts
  const filteredSymbols = symbolsPage.items
  const symbolPages = useMemo(
    () => paginateSymbols(filteredSymbols, editing?.id ?? null),
    [editing?.id, filteredSymbols],
  )
  const pageCount = Math.max(1, Math.ceil(symbolsPage.total / SYMBOL_PAGE_SIZE))
  const normalizedPage = Math.min(page, pageCount)
  const pageSymbols = symbolPages[0] ?? []
  const pageRange = pageRangeFor(pageSymbols, filteredSymbols)
  const panelStart = symbolsPage.total === 0 ? 0 : symbolsPage.offset + pageRange.start
  const panelEnd = symbolsPage.offset + pageRange.end
  const activeTabTotal = filteredTabCounts[activeTab] ?? 0
  const panelCountLabel = searchTerm ? `${symbolsPage.total} of ${activeTabTotal}` : String(activeTabTotal)

  useEffect(() => {
    const totalMatches = symbolTabs.reduce((sum, symbolTab) => sum + (filteredTabCounts[symbolTab.key] ?? 0), 0)
    if (filteredTabCounts[activeTab] > 0 || totalMatches === 0) return
    const firstTabWithMatch = symbolTabs.find((symbolTab) => filteredTabCounts[symbolTab.key] > 0)
    if (firstTabWithMatch) setActiveTab(firstTabWithMatch.key)
  }, [activeTab, filteredTabCounts])

  useEffect(() => {
    setPage(1)
    setEditing(null)
    setShowAdd(false)
  }, [activeTab, searchTerm])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  useEffect(() => {
    let active = true
    setLoadingSymbols(true)
    listAdminSymbolsAction({
      assetType: activeTab,
      query: searchTerm,
      limit: SYMBOL_PAGE_SIZE,
      offset: (page - 1) * SYMBOL_PAGE_SIZE,
    }).then((nextPage) => {
      if (!active) return
      setSymbolsPage(nextPage)
      setLoadingSymbols(false)
    })
    return () => { active = false }
  }, [activeTab, page, searchTerm])

  function run(action: () => Promise<string | null>, success: string) {
    startTransition(async () => {
      const error = await action()
      showToast(error ? { severity: "error", message: error } : { severity: "success", message: success })
      if (!error) {
        setShowAdd(false)
        setEditing(null)
        setRemoveCandidate(null)
        const refreshedPage = await listAdminSymbolsAction({
          assetType: activeTab,
          query: searchTerm,
          limit: SYMBOL_PAGE_SIZE,
          offset: (page - 1) * SYMBOL_PAGE_SIZE,
        })
        setSymbolsPage(refreshedPage)
        router.refresh()
      }
    })
  }

  async function ensureEditMetadata() {
    if (editMetadataLoaded || editMetadataLoading) return
    setEditMetadataLoading(true)
    const result = await listAdminSymbolEditMetadataAction()
    if (result.error) showToast({ severity: "error", message: result.error })
    else {
      setEditExchanges(result.exchanges)
      setEditProviders(result.providers)
      setEditMetadataLoaded(true)
    }
    setEditMetadataLoading(false)
  }

  return (
    <PageShell kind="admin" maxWidth={1640}>
      <Stack component="header" direction="row" spacing={2} sx={{ alignItems: "center", justifyContent: "space-between" }}>
        <Breadcrumbs aria-label="breadcrumb">
          <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12, fontWeight: 600 }}>
            Administration
          </Typography>
          <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>
            Symbols
          </Typography>
        </Breadcrumbs>
      </Stack>

      <ControlBar
        addLabel="Add symbol"
        defaultTabValue="equity"
        onAdd={() => {
          setShowAdd(true)
          void ensureEditMetadata()
        }}
        onSearchChange={setQuery}
        onTabChange={setActiveTab}
        searchPlaceholder="Name, symbol, ISIN, exchange or usage"
        searchValue={query}
        tabs={symbolTabs.map((symbolTab) => ({
          count: filteredTabCounts[symbolTab.key],
          label: symbolTab.label,
          value: symbolTab.key,
        }))}
        tabValue={activeTab}
      />

      <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)" }}>
        <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography component="h2" sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Symbols</Typography>
            <Chip label={panelCountLabel} color="primary" variant="outlined" size="small" />
            {loadingSymbols ? <CircularProgress size={14} /> : null}
          </Stack>
          <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11 }}>
            {symbolTabs.find((symbolTab) => symbolTab.key === activeTab)?.label}
          </Typography>
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 900 }}>
            <TableHead sx={{ "& .MuiTableCell-root": { color: "var(--app-text-faint)", fontSize: 10, fontWeight: 600, px: 1.5, py: 1 } }}>
              <TableRow>
                <TableCell>Instrument</TableCell>
                <TableCell align="right" sx={{ width: 140 }}>Listing</TableCell>
                <TableCell align="right" sx={{ width: 100 }}>Providers</TableCell>
                <TableCell align="right" sx={{ width: 96 }}>Usage</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {showAdd ? (
                <InlineSymbolCreate
                  assetType={activeTab}
                  exchanges={editExchanges}
                  metadataLoading={editMetadataLoading && !editMetadataLoaded}
                  providers={symbolProviders}
                  pending={pending}
                  onClose={() => setShowAdd(false)}
                  onSubmit={(formData) => run(() => createAdminSymbolAction(formData), "Symbol added.")}
                />
              ) : null}
              {pageSymbols.map((symbol) => (
                <Fragment key={symbol.id}>
                  <TableRow
                    hover
                    onClick={() => {
                      setEditing((currentSymbol) => {
                        const nextSymbol = currentSymbol?.id === symbol.id ? null : symbol
                        if (nextSymbol) void ensureEditMetadata()
                        return nextSymbol
                      })
                    }}
                    aria-selected={editing?.id === symbol.id}
                    sx={{ ...selectableRowSx(editing?.id === symbol.id), cursor: "pointer" }}
                  >
                    <TableCell>
            <Stack spacing={0.5}>
              <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>{symbol.instrument_name}</Typography>
                        <Stack direction="row" spacing={0.75} useFlexGap sx={{ alignItems: "center", flexWrap: "wrap" }}>
                          {symbol.isin ? <Typography sx={{ color: "var(--app-text-faint)", fontFamily: "monospace", fontSize: 10 }}>ISIN {symbol.isin}</Typography> : null}
                        </Stack>
                      </Stack>
                    </TableCell>
                    <TableCell align="right" sx={{ width: 140 }}>
                      <Typography sx={{ color: "var(--app-text)", fontFamily: "monospace", fontSize: 12, fontWeight: 700 }}>{symbol.symbol}</Typography>
                      <Typography sx={{ color: "var(--app-text-faint)", fontSize: 10 }}>
                        {symbol.exchange_mic ?? "No exchange"} - {symbol.currency}
                      </Typography>
                    </TableCell>
                    <TableCell align="right" sx={{ width: 100 }}><ProvidersCell selections={symbol.provider_selections} providers={providers} /></TableCell>
                    <TableCell align="right" sx={{ width: 96 }}>
                      <Chip label={symbol.in_use ? "In use" : "Unused"} color="success" variant="outlined" size="small" />
                    </TableCell>
                    <TableCell align="right" sx={{ width: 132 }}>
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                        <Tooltip title="Purge quote history">
                          <IconButton
                            aria-label={`Purge quotes for ${symbol.symbol}`}
                            color="warning"
                            size="small"
                            disabled={pending}
                            onClick={(event) => {
                              event.stopPropagation()
                              run(() => purgeAdminSymbolQuotesAction(symbol.id), `${symbol.instrument_name} quote history purged.`)
                            }}
                          >
                            <PurgeIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={`Rebuild quote history${quoteProviderFor(symbol) === "lstc" ? " from full LSTC history" : " from 2000-01-01"}`}>
                          <IconButton
                            aria-label={`Rebuild quotes for ${symbol.symbol}`}
                            color="primary"
                            size="small"
                            disabled={pending}
                            onClick={(event) => {
                              event.stopPropagation()
                              run(
                                () => rebuildAdminSymbolQuotesAction(symbol.id, quoteProviderFor(symbol)),
                                `${symbol.instrument_name} quote history rebuilt.`,
                              )
                            }}
                          >
                            <RebuildIcon />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={symbol.in_use ? "Remove positions and watchlist entries first" : "Remove unused symbol"}>
                          <span>
                            <IconButton
                              aria-label={`Remove ${symbol.symbol}`}
                              color="error"
                              size="small"
                              disabled={symbol.in_use || pending}
                              onClick={(event) => {
                                event.stopPropagation()
                                setRemoveCandidate(symbol)
                              }}
                            >
                              <TrashIcon />
                            </IconButton>
                          </span>
                        </Tooltip>
                      </Stack>
                    </TableCell>
                  </TableRow>
                  {editing?.id === symbol.id ? (
                    <InlineSymbolEditor
                      exchanges={editExchanges}
                  metadataLoading={editMetadataLoading && !editMetadataLoaded}
                  providers={symbolProviders}
                      symbol={symbol}
                      pending={pending}
                      onClose={() => setEditing(null)}
                      onSubmit={(formData) => run(() => updateAdminSymbolAction(formData), "Symbol updated.")}
                    />
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          {filteredSymbols.length === 0 ? (
            <Typography sx={{ py: 8, textAlign: "center", color: "var(--app-text-faint)", fontSize: 12 }}>
              No symbols match this view.
            </Typography>
          ) : null}
        </TableContainer>
        {filteredSymbols.length > 0 ? (
          <PaginationFooter
            page={normalizedPage}
            pageCount={pageCount}
            start={panelStart}
            end={panelEnd}
            total={symbolsPage.total}
            onChange={(nextPage) => {
              setPage(nextPage)
              setEditing(null)
            }}
          />
        ) : null}
      </Card>

      <RemoveSymbolDialog
        symbol={removeCandidate}
        pending={pending}
        onCancel={() => {
          setRemoveCandidate(null)
          showToast({ severity: "info", message: "Symbol removal cancelled." })
        }}
        onConfirm={() => {
          if (!removeCandidate) return
          run(() => deactivateAdminSymbolAction(removeCandidate.id), `${removeCandidate.instrument_name} removed.`)
        }}
      />
    </PageShell>
  )
}

function ProvidersCell({
  selections,
  providers,
}: {
  selections: { capability: string; provider: string }[]
  providers: ProviderSettingsView[]
}) {
  const router = useRouter()
  const byCapability = useMemo(() => new Map(selections.map((selection) => [selection.capability, selection.provider])), [selections])
  const providerByName = useMemo(() => new Map(providers.map((provider) => [provider.provider, provider])), [providers])
  const providerRows = FEED_GROUPS.map((group) => {
    const provider = byCapability.get(group.capability) ?? null
    const providerSettings = provider ? providerByName.get(provider) : undefined
    const status = !provider ? "missing" : providerSettings ? (providerSettings.enabled ? "active" : "disabled") : "configured"
    return {
      key: group.key,
      label: group.label,
      short: group.short,
      provider,
      status,
    }
  })
  const configuredCount = providerRows.filter((providerRow) => providerRow.provider !== null).length
  const chipColor = configuredCount === FEED_GROUPS.length ? "success" : configuredCount === 0 ? "error" : "warning"
  return (
    <Tooltip
      arrow
      placement="left"
      title={(
        <Stack spacing={0.75} sx={{ py: 0.5, minWidth: 210 }}>
          {providerRows.map((providerRow) => (
            <Stack key={providerRow.key} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={{ color: "inherit", fontSize: 11, fontWeight: 700 }}>{providerRow.short}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                <Typography sx={{ color: "inherit", fontSize: 11 }}>{providerRow.provider ?? "None"}</Typography>
                <Chip
                  label={providerRow.status === "active" ? "Active" : providerRow.status === "disabled" ? "Disabled" : providerRow.status === "configured" ? "Configured" : "Missing"}
                  color={providerRow.status === "missing" || providerRow.status === "disabled" ? "error" : "success"}
                  variant="outlined"
                  size="small"
                  sx={{ height: 20, "& .MuiChip-label": { px: 0.75, fontSize: 10 } }}
                />
              </Stack>
            </Stack>
          ))}
        </Stack>
      )}
    >
      <Chip
        label={`${configuredCount}/${FEED_GROUPS.length}`}
        color={chipColor}
        variant="outlined"
        size="small"
        clickable={providerRows.some((providerRow) => providerRow.provider !== null)}
        onClick={(event) => {
          event.stopPropagation()
          const firstProvider = providerRows.find((providerRow) => providerRow.provider)?.provider
          if (firstProvider) router.push(`/administration/providers?provider=${encodeURIComponent(firstProvider)}`)
        }}
        sx={{ minWidth: 48 }}
      />
    </Tooltip>
  )
}

function PaginationFooter({
  page,
  pageCount,
  start,
  end,
  total,
  onChange,
}: {
  page: number
  pageCount: number
  start: number
  end: number
  total: number
  onChange: (page: number) => void
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        alignItems: { xs: "stretch", sm: "center" },
        borderTop: "1px solid var(--app-border)",
        bgcolor: "var(--app-surface-raised)",
        justifyContent: "space-between",
        px: 1.5,
        py: 1,
      }}
    >
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{start}-{end} of {total}</Typography>
      <Pagination count={pageCount} page={page} size="small" onChange={(_, value) => onChange(value)} />
    </Stack>
  )
}

function paginateSymbols(symbols: AdminSymbolView[], editingId: string | null) {
  const pages: AdminSymbolView[][] = []
  let currentPage: AdminSymbolView[] = []
  let currentSlots = 0

  symbols.forEach((symbol) => {
    const symbolSlots = 1 + (symbol.id === editingId ? INLINE_EDIT_EXTRA_SLOTS : 0)
    if (currentPage.length > 0 && currentSlots + symbolSlots > SYMBOL_PAGE_SIZE) {
      pages.push(currentPage)
      currentPage = []
      currentSlots = 0
    }
    currentPage.push(symbol)
    currentSlots += symbolSlots
  })

  if (currentPage.length > 0) pages.push(currentPage)
  return pages
}

function pageRangeFor(pageSymbols: AdminSymbolView[], allSymbols: AdminSymbolView[]) {
  if (pageSymbols.length === 0) return { start: 0, end: 0 }
  const firstIndex = allSymbols.findIndex((symbol) => symbol.id === pageSymbols[0]?.id)
  const lastIndex = allSymbols.findIndex((symbol) => symbol.id === pageSymbols[pageSymbols.length - 1]?.id)
  return { start: Math.max(0, firstIndex) + 1, end: Math.max(0, lastIndex) + 1 }
}

function quoteProviderFor(symbol: AdminSymbolView): string | null {
  return symbol.provider_selections.find((selection) => selection.capability === "quotes")?.provider
    ?? symbol.provider_selections.find((selection) => selection.capability === "chart")?.provider
    ?? null
}

function SectionLabel({ label }: { label: string }) {
  return (
    <Typography
      sx={{
        color: "var(--app-primary)",
        fontSize: 10,
        fontWeight: 800,
        letterSpacing: "0.08em",
        mb: 1.25,
        textTransform: "uppercase",
      }}
    >
      {label}
    </Typography>
  )
}

function InlineSymbolEditor({
  exchanges,
  metadataLoading,
  providers,
  symbol,
  pending,
  onClose,
  onSubmit,
}: {
  exchanges: ExchangeView[]
  metadataLoading: boolean
  providers: ProviderSettingsView[]
  symbol: AdminSymbolView
  pending: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}) {
  return (
    <TableRow>
      <TableCell colSpan={5} sx={{ borderTop: "2px solid var(--app-primary)", bgcolor: "var(--app-surface-raised)", p: 0 }}>
        <Box component="form" action={onSubmit}>
          <Box sx={{ px: 2, py: 2 }}>
            {metadataLoading ? <SymbolEditMetadataSkeleton /> : <SymbolFormFields exchanges={exchanges} providers={providers} symbol={symbol} variant="inline" />}
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ ...inlineActionsSx, alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}>
            <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>
              {new Set(symbol.provider_selections.map((selection) => selection.provider)).size} providers · {symbol.provider_selections.length} feeds configured
            </Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button type="button" variant="outlined" disabled={pending} onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={pending || metadataLoading}>{pending ? "Saving..." : "Save changes"}</Button>
            </Stack>
          </Stack>
        </Box>
      </TableCell>
    </TableRow>
  )
}

function InlineSymbolCreate({
  assetType,
  exchanges,
  metadataLoading,
  providers,
  pending,
  onClose,
  onSubmit,
}: {
  assetType: SymbolTab
  exchanges: ExchangeView[]
  metadataLoading: boolean
  providers: ProviderSettingsView[]
  pending: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}) {
  return (
    <TableRow>
      <TableCell colSpan={5} sx={{ borderTop: "2px solid var(--app-primary)", bgcolor: "var(--app-surface-raised)", p: 0 }}>
        <Box component="form" action={onSubmit}>
          <Box sx={{ px: 2, py: 2 }}>
            {metadataLoading ? <SymbolEditMetadataSkeleton /> : <SymbolFormFields exchanges={exchanges} providers={providers} defaultAssetType={assetType} variant="inline" />}
          </Box>
          <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ ...inlineActionsSx, alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between" }}>
            <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>
              New {symbolTabs.find((tab) => tab.key === assetType)?.label ?? "symbol"} listing
            </Typography>
            <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
              <Button type="button" variant="outlined" disabled={pending} onClick={onClose}>Cancel</Button>
              <Button type="submit" variant="contained" disabled={pending || metadataLoading}>{pending ? "Saving..." : "Create symbol"}</Button>
            </Stack>
          </Stack>
        </Box>
      </TableCell>
    </TableRow>
  )
}

function SymbolEditMetadataSkeleton() {
  return (
    <Stack spacing={2}>
      <Box>
        <SectionLabel label="Basics" />
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "minmax(260px, 1.5fr) minmax(180px, 0.8fr) minmax(140px, 0.7fr)" } }}>
          <Skeleton animation="wave" variant="rounded" height={56} />
          <Skeleton animation="wave" variant="rounded" height={56} />
          <Skeleton animation="wave" variant="rounded" height={56} />
        </Box>
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", lg: "minmax(220px, 0.9fr) minmax(180px, 0.7fr) minmax(300px, 1.4fr)" }, mt: 1.5 }}>
          <Skeleton animation="wave" variant="rounded" height={56} />
          <Skeleton animation="wave" variant="rounded" height={56} />
          <Skeleton animation="wave" variant="rounded" height={56} />
        </Box>
      </Box>
      <Box sx={{ borderTop: "1px solid var(--app-border)", pt: 2 }}>
        <SectionLabel label="Data providers" />
        <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" } }}>
          {Array.from({ length: 4 }, (_, index) => <Skeleton key={index} animation="wave" variant="rounded" height={56} />)}
        </Box>
      </Box>
    </Stack>
  )
}

function SymbolFormFields({
  exchanges,
  providers,
  symbol,
  defaultAssetType = "equity",
  variant = "dialog",
}: {
  exchanges: ExchangeView[]
  providers: ProviderSettingsView[]
  symbol?: AdminSymbolView
  defaultAssetType?: SymbolTab
  variant?: "dialog" | "inline"
}) {
  const inline = variant === "inline"
  return (
    <>
      <Box>
        {symbol ? <><input type="hidden" name="instrument_id" value={symbol.instrument_id} /><input type="hidden" name="listing_id" value={symbol.id} /></> : null}
        {inline ? <SectionLabel label="Basics" /> : null}
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: inline
              ? { xs: "1fr", lg: "minmax(260px, 1.5fr) minmax(180px, 0.8fr) minmax(140px, 0.7fr)" }
              : { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
          }}
        >
          <Field label="Instrument name" name="name" defaultValue={symbol?.instrument_name} required />
          <TextField name="asset_type" label="Asset type" select size="small" defaultValue={symbol?.asset_type ?? defaultAssetType} disabled={!!symbol} fullWidth>
            <MenuItem value="equity">Equity</MenuItem>
            <MenuItem value="fund">Fund</MenuItem>
            <MenuItem value="crypto">Crypto</MenuItem>
            <MenuItem value="index">Index</MenuItem>
          </TextField>
          <Field label="Currency" name="currency" defaultValue={symbol?.currency ?? "EUR"} maxLength={3} required />
        </Box>
        <Box
          sx={{
            display: "grid",
            gap: 1.5,
            gridTemplateColumns: inline
              ? { xs: "1fr", lg: "minmax(220px, 0.9fr) minmax(180px, 0.7fr) minmax(300px, 1.4fr)" }
              : { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))" },
            mt: 1.5,
          }}
        >
          <Field label="ISIN" name="isin" defaultValue={symbol?.isin ?? ""} maxLength={12} />
          <Field label="Display symbol" name="symbol" defaultValue={symbol?.symbol} required />
          <TextField name="exchange_id" label="Exchange" select size="small" defaultValue={symbol?.exchange_id ?? exchanges[0]?.id ?? ""} fullWidth>
            {exchanges.map((exchange) => <MenuItem key={exchange.id} value={exchange.id}>{exchange.mic} - {exchange.name}</MenuItem>)}
          </TextField>
        </Box>
      </Box>
      <ProviderMatrix symbol={symbol} providers={providers} variant={variant} />
    </>
  )
}

function ProviderMatrix({ symbol, providers, variant = "dialog" }: { symbol?: AdminSymbolView; providers: ProviderSettingsView[]; variant?: "dialog" | "inline" }) {
  const [groupProvider, setGroupProvider] = useState<Record<string, string>>({})
  const [symbolByProvider, setSymbolByProvider] = useState<Record<string, string>>(() =>
    Object.fromEntries(symbol?.provider_identifiers.map((providerIdentifier) => [providerIdentifier.provider, providerIdentifier.provider_identifier]) ?? []),
  )
  const [loading, setLoading] = useState(!!symbol)

  useEffect(() => {
    if (!symbol) {
      setGroupProvider({})
      setLoading(false)
      return
    }
    let active = true
    getInstrumentSelectionsAction(symbol.instrument_id).then((selections) => {
      if (!active) return
      const byCapability = new Map(selections.map((selection) => [selection.capability, selection.provider]))
      setGroupProvider(Object.fromEntries(FEED_GROUPS.map((group) => [group.key, byCapability.get(group.capability) ?? ""])))
      setLoading(false)
    })
    return () => { active = false }
  }, [symbol])

  const distinctProviders = useMemo(
    () => [...new Set(Object.values(groupProvider).filter((provider) => provider.length > 0))],
    [groupProvider],
  )
  const feedsByProvider = useMemo(() => {
    const byProvider = new Map<string, { key: string; label: string; short: string }[]>()
    for (const group of FEED_GROUPS) {
      const provider = groupProvider[group.key]
      if (!provider) continue
      const feeds = byProvider.get(provider) ?? []
      feeds.push({ key: group.key, label: group.label, short: group.short })
      byProvider.set(provider, feeds)
    }
    return byProvider
  }, [groupProvider])

  function setSymbol(provider: string, value: string) {
    setSymbolByProvider((currentSymbols) => ({ ...currentSymbols, [provider]: value }))
  }

  const selectionsPayload = FEED_GROUPS.filter((group) => groupProvider[group.key]).map((group) => ({
    capability: group.capability,
    provider: groupProvider[group.key],
  }))
  const identifiersPayload = distinctProviders.map((provider) => ({ provider, provider_identifier: symbolByProvider[provider] ?? "" }))
  const inline = variant === "inline"

  return (
    <Box sx={{ borderTop: "1px solid var(--app-border)", mt: inline ? 2 : 2, pt: 2 }}>
      <input type="hidden" name="provider_selections" value={JSON.stringify(selectionsPayload)} />
      <input type="hidden" name="provider_identifiers" value={JSON.stringify(identifiersPayload)} />

      {loading ? (
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", color: "var(--app-text-faint)" }}>
          <CircularProgress size={16} />
          <Typography sx={{ fontSize: 11 }}>Loading current selections...</Typography>
        </Stack>
      ) : (
        <>
          <SectionLabel label="Data providers" />
          <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" } }}>
            {FEED_GROUPS.map((group) => (
              <TextField
                key={group.key}
                label={group.label}
                select
                size="small"
                fullWidth
                value={groupProvider[group.key] ?? ""}
                onChange={(event) => setGroupProvider((currentProviders) => ({ ...currentProviders, [group.key]: event.target.value }))}
              >
                <MenuItem value="">None</MenuItem>
                {providers.map((provider) => <MenuItem key={provider.provider} value={provider.provider}>{provider.provider}</MenuItem>)}
              </TextField>
            ))}
          </Box>

          {distinctProviders.length > 0 ? (
            <Stack spacing={1.25} sx={{ borderTop: "1px solid var(--app-border)", mt: 2, pt: 2 }}>
              <Stack spacing={0.35}>
                <SectionLabel label="Provider symbols" />
                <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11 }}>
                  Search starts after 3 characters. One symbol is stored per provider.
                </Typography>
              </Stack>
              <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", xl: "repeat(2, minmax(0, 1fr))" } }}>
              {distinctProviders.map((provider) => (
                <ProviderSymbolRow
                  key={provider}
                  provider={provider}
                  value={symbolByProvider[provider] ?? ""}
                  feeds={feedsByProvider.get(provider) ?? []}
                  onChange={(value) => setSymbol(provider, value)}
                />
              ))}
              </Box>
            </Stack>
          ) : null}
        </>
      )}
    </Box>
  )
}

function ProviderSymbolRow({
  provider,
  value,
  feeds,
  onChange,
}: {
  provider: string
  value: string
  feeds: { key: string; label: string; short: string }[]
  onChange: (value: string) => void
}) {
  const [inputValue, setInputValue] = useState(value)
  const [results, setResults] = useState<ProviderSymbolHit[]>([])
  const [searching, setSearching] = useState(false)

  useEffect(() => setInputValue(value), [value])

  useEffect(() => {
    const query = inputValue.trim()
    if (query.length < 3) {
      setResults([])
      setSearching(false)
      return
    }
    let active = true
    const handle = window.setTimeout(() => {
      setSearching(true)
      searchProviderSymbolsAction(provider, query).then((nextResults) => {
        if (!active) return
        setResults(nextResults)
        setSearching(false)
      })
    }, 300)
    return () => {
      active = false
      window.clearTimeout(handle)
    }
  }, [inputValue, provider])

  return (
    <Box>
      <Stack direction={{ xs: "column", md: "row" }} spacing={1} sx={{ alignItems: { xs: "stretch", md: "center" } }}>
        <Autocomplete
          freeSolo
          fullWidth
          size="small"
          options={results}
          inputValue={inputValue}
          value={value}
          loading={searching}
          filterOptions={(options) => options}
          getOptionLabel={(option) => typeof option === "string" ? option : option.symbol}
          isOptionEqualToValue={(option, selectedValue) => option.symbol === selectedValue}
          noOptionsText={inputValue.trim().length < 3 ? "Type at least 3 characters" : "No match"}
          onInputChange={(_, nextValue) => {
            setInputValue(nextValue)
            onChange(nextValue)
          }}
          onChange={(_, option) => {
            const nextValue = typeof option === "string" ? option : option?.symbol ?? ""
            setInputValue(nextValue)
            onChange(nextValue)
          }}
          renderInput={(params) => (
            <TextField
              {...params}
              label={`${provider} symbol`}
              placeholder={`${provider} by symbol, ISIN or name`}
            />
          )}
          renderOption={(props, hit) => (
            <Box component="li" {...props} key={`${hit.symbol}-${hit.exchange ?? ""}`}>
              <Stack direction="row" spacing={1} sx={{ minWidth: 0, width: "100%", alignItems: "center", justifyContent: "space-between" }}>
                <Typography sx={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", color: "var(--app-text)", fontSize: 12 }}>{hit.name}</Typography>
                <Typography sx={{ flexShrink: 0, color: "var(--app-text-faint)", fontFamily: "monospace", fontSize: 10 }}>
                  {hit.symbol}{hit.currency ? ` - ${hit.currency}` : ""}
                </Typography>
              </Stack>
            </Box>
          )}
        />
      </Stack>
      <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: "wrap", mt: 0.75 }}>
        {feeds.map((feed) => (
          <Chip key={feed.key} label={feed.label} color="primary" variant="outlined" size="small" sx={{ height: 22, "& .MuiChip-label": { px: 0.8, fontSize: 10 } }} />
        ))}
      </Stack>
    </Box>
  )
}

function RemoveSymbolDialog({
  symbol,
  pending,
  onCancel,
  onConfirm,
}: {
  symbol: AdminSymbolView | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={symbol !== null} onClose={pending ? undefined : onCancel} fullWidth maxWidth="sm" slotProps={dialogPaperSlotProps}>
      <DialogTitle sx={dialogTitleSx}>Remove {symbol?.symbol}?</DialogTitle>
      <DialogContent sx={{ bgcolor: "var(--app-surface-raised)", p: 0 }}>
        <Box sx={{ px: 2, py: 2 }}>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>
            This removes the listing from the active symbol catalog. Removal is blocked while positions or watchlist entries still use it.
          </Typography>
          {symbol ? (
            <Card variant="outlined" sx={{ mt: 1.5, borderColor: "var(--app-border)", bgcolor: "var(--app-surface)", p: 1.5 }}>
              <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 700 }}>
                {symbol.instrument_name}
              </Typography>
              <Typography sx={{ color: "var(--app-text-faint)", fontFamily: "monospace", fontSize: 10 }}>
                {symbol.symbol} - {symbol.exchange_mic ?? "No exchange"} - {symbol.currency}
              </Typography>
            </Card>
          ) : null}
        </Box>
      </DialogContent>
      <DialogActions sx={dialogActionsSx}>
        <Button type="button" variant="outlined" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="contained" color="error" disabled={pending} onClick={onConfirm}>
          {pending ? "Removing..." : "Remove symbol"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function Field({
  label,
  maxLength,
  ...props
}: {
  label: string
  name: string
  defaultValue?: string | null
  required?: boolean
  disabled?: boolean
  maxLength?: number
}) {
  return <TextField {...props} label={label} size="small" fullWidth slotProps={maxLength ? { htmlInput: { maxLength } } : undefined} />
}

function PurgeIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M4 5h12" />
      <path d="M8 5V3h4v2" />
      <path d="M6.5 5 7.2 15.5A1.5 1.5 0 0 0 8.7 17h2.6a1.5 1.5 0 0 0 1.5-1.5L13.5 5" />
      <path d="m8.5 9 3 3" />
      <path d="m11.5 9-3 3" />
    </svg>
  )
}

function RebuildIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M15.5 6.5A6 6 0 0 0 5 5.8" />
      <path d="M5 3v2.8h2.8" />
      <path d="M4.5 13.5A6 6 0 0 0 15 14.2" />
      <path d="M15 17v-2.8h-2.8" />
    </svg>
  )
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M3 5h14" />
      <path d="M8 5V3h4v2" />
      <path d="M6 5l1 12h6l1-12" />
      <path d="M8.5 8v6" />
      <path d="M11.5 8v6" />
    </svg>
  )
}

const dialogPaperSlotProps = {
  paper: {
    variant: "outlined",
    sx: {
      borderColor: "var(--app-border)",
      bgcolor: "var(--app-surface-raised)",
      boxShadow: "var(--app-shadow)",
    },
  },
} as const

const dialogTitleSx = {
  borderBottom: "1px solid var(--app-border)",
  bgcolor: "var(--app-surface-raised)",
  color: "var(--app-text)",
  fontSize: 16,
  fontWeight: 700,
  px: 2,
  py: 1.5,
}

const dialogActionsSx = {
  borderTop: "1px solid var(--app-border)",
  bgcolor: "var(--app-surface)",
  gap: 1,
  px: 2,
  py: 1.5,
}

const inlineActionsSx = {
  ...dialogActionsSx,
  bgcolor: "var(--app-surface-raised)",
}
