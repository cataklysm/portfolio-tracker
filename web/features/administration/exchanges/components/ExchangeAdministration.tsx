"use client"

import { Fragment, useEffect, useMemo, useState, useTransition } from "react"
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Pagination,
  Skeleton,
  Stack,
  Switch,
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
import { AppBadge, appIconButtonSx } from "@/application/shell/AppBadge"
import { appTypography, tableHeadSx } from "@/application/shell/appTypography"
import { ControlBar } from "@/design/components/ControlBar"
import { PageShell } from "@/application/shell/PageShell"
import { selectableRowSx } from "@/application/shell/rowSelection"
import { useToast } from "@/application/toast/ToastProvider"
import {
  AdminInspectorActions,
  AdminInspectorBody,
  AdminInspectorHeader,
  AdminSectionLabel as SectionLabel,
  adminInlineEditorCellSx,
  adminInspectorSectionSx,
} from "@/features/administration/components/AdminInspector"
import { createExchangeAction, deleteExchangeAction, listAdminExchangesAction, restoreExchangeAction, updateExchangeAction } from "@/features/administration/exchanges/actions"
import type { ExchangeView } from "@/lib/types"

const EXCHANGE_PAGE_SIZE = 12
const INLINE_EDIT_EXTRA_SLOTS = 5

const exchangeTabs = [
  { key: "all", label: "All" },
  { key: "active", label: "Active" },
  { key: "disabled", label: "Disabled" },
] as const

type ExchangeTab = (typeof exchangeTabs)[number]["key"]

export function ExchangeAdministration({ exchanges: initialExchanges }: { exchanges: ExchangeView[] }) {
  const { showToast } = useToast()
  const [exchanges, setExchanges] = useState(initialExchanges)
  const [loadingExchanges, setLoadingExchanges] = useState(initialExchanges.length === 0)
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<ExchangeTab>("all")
  const [page, setPage] = useState(1)
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<ExchangeView | null>(null)
  const [deleteCandidate, setDeleteCandidate] = useState<ExchangeView | null>(null)
  const [pending, startTransition] = useTransition()
  const searchTerm = query.trim().toLowerCase()

  useEffect(() => {
    if (exchanges.length > 0) return
    let active = true
    setLoadingExchanges(true)
    listAdminExchangesAction().then((result) => {
      if (!active) return
      if (result.error) showToast({ severity: "error", message: result.error })
      else setExchanges(result.exchanges)
      setLoadingExchanges(false)
    })
    return () => { active = false }
  }, [exchanges.length, showToast])

  async function reloadExchanges() {
    setLoadingExchanges(true)
    const result = await listAdminExchangesAction()
    if (result.error) showToast({ severity: "error", message: result.error })
    else setExchanges(result.exchanges)
    setLoadingExchanges(false)
  }

  const searchedExchanges = useMemo(() => {
    if (!searchTerm) return exchanges
    return exchanges.filter((exchange) => [
      exchange.mic,
      exchange.name,
      exchange.timezone,
      exchange.regular_open_local ?? "",
      exchange.regular_close_local ?? "",
    ].some((value) => value.toLowerCase().includes(searchTerm)))
  }, [exchanges, searchTerm])

  const tabCounts = useMemo(() => ({
    active: searchedExchanges.filter((exchange) => exchange.active).length,
    all: searchedExchanges.length,
    disabled: searchedExchanges.filter((exchange) => !exchange.active).length,
  }), [searchedExchanges])

  const filteredExchanges = useMemo(() => {
    if (activeTab === "active") return searchedExchanges.filter((exchange) => exchange.active)
    if (activeTab === "disabled") return searchedExchanges.filter((exchange) => !exchange.active)
    return searchedExchanges
  }, [activeTab, searchedExchanges])

  const exchangePages = useMemo(
    () => paginateExchanges(filteredExchanges, editing?.id ?? null, showAdd),
    [editing?.id, filteredExchanges, showAdd],
  )
  const pageCount = Math.max(1, exchangePages.length)
  const normalizedPage = Math.min(page, pageCount)
  const pageExchanges = exchangePages[normalizedPage - 1] ?? []
  const pageRange = pageRangeFor(pageExchanges, filteredExchanges)

  useEffect(() => {
    setPage(1)
    setEditing(null)
    setShowAdd(false)
  }, [activeTab, searchTerm])

  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  function run(action: () => Promise<string | null>, successMessage: string) {
    startTransition(async () => {
      const error = await action()
      showToast(error ? { severity: "error", message: error } : { severity: "success", message: successMessage })
      if (!error) {
        setShowAdd(false)
        setEditing(null)
        setDeleteCandidate(null)
        await reloadExchanges()
      }
    })
  }

  return (
    <PageShell kind="admin" maxWidth={1640}>
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={appTypography.breadcrumbParent}>
          Administration
        </Typography>
        <Typography sx={appTypography.breadcrumbCurrent}>
          Exchanges
        </Typography>
      </Breadcrumbs>

      <ControlBar
        addLabel="Add exchange"
        defaultTabValue="all"
        onAdd={() => setShowAdd(true)}
        onClearFilters={() => {
          setActiveTab("all")
          setQuery("")
        }}
        onReload={() => { void reloadExchanges() }}
        onSearchChange={setQuery}
        onTabChange={setActiveTab}
        reloadLabel="Reload exchanges"
        reloadLoading={loadingExchanges}
        searchPlaceholder="MIC, name, timezone or trading hours"
        searchValue={query}
        tabs={exchangeTabs.map((exchangeTab) => ({
          count: exchangeTab.key === "all" ? undefined : tabCounts[exchangeTab.key],
          label: exchangeTab.label,
          value: exchangeTab.key,
        }))}
        tabValue={activeTab}
      />

      <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "var(--app-surface-panel)", boxShadow: "var(--app-shadow)" }}>
        <Stack direction="row" sx={{ alignItems: "center", bgcolor: "var(--app-surface-header)", borderBottom: "1px solid var(--app-divider)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography component="h2" sx={appTypography.panelTitle}>Exchanges</Typography>
            <AppBadge label={filteredExchanges.length} kind="count" />
            {loadingExchanges ? <CircularProgress size={14} /> : null}
          </Stack>
          <Typography sx={appTypography.panelMeta}>
            {exchangeTabs.find((exchangeTab) => exchangeTab.key === activeTab)?.label}
          </Typography>
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 920 }}>
            <TableHead sx={tableHeadSx}>
              <TableRow>
                <TableCell>Exchange</TableCell>
                <TableCell align="right" sx={{ width: 190 }}>Timezone</TableCell>
                <TableCell align="right" sx={{ width: 190 }}>Trading hours</TableCell>
                <TableCell align="right" sx={{ width: 96 }}>Status</TableCell>
                <TableCell align="right" sx={{ width: 112 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {showAdd && normalizedPage === 1 ? (
                <InlineExchangeCreate
                  pending={pending}
                  onClose={() => setShowAdd(false)}
                  onSubmit={(formData) => run(() => createExchangeAction(exchangeFormPayload(formData)), "Exchange created.")}
                />
              ) : null}
              {loadingExchanges && exchanges.length === 0 ? <ExchangeTableSkeleton /> : null}
              {pageExchanges.map((exchange) => (
                <Fragment key={exchange.id}>
                  <TableRow
                    hover
                    onClick={() => setEditing((currentExchange) => currentExchange?.id === exchange.id ? null : exchange)}
                    aria-selected={editing?.id === exchange.id}
                    sx={{ ...selectableRowSx(editing?.id === exchange.id), cursor: "pointer", opacity: exchange.active ? 1 : 0.58 }}
                  >
                    <TableCell>
                      <Stack spacing={0.5}>
                        <Typography sx={appTypography.tablePrimary}>{exchange.mic}</Typography>
                        <Typography noWrap sx={appTypography.tableMeta}>{exchange.name}</Typography>
                      </Stack>
                    </TableCell>
                    <TableCell align="right">
                      <AppBadge label={exchange.timezone} kind="data-source" />
                    </TableCell>
                    <TableCell align="right">
                      <Typography sx={appTypography.tableMono}>
                        {tradingHours(exchange)}
                      </Typography>
                    </TableCell>
                    <TableCell align="right">
                      <AppBadge label={exchange.active ? "Active" : "Disabled"} kind="status" tone={exchange.active ? "success" : "neutral"} />
                    </TableCell>
                    <TableCell align="right">
                      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
                        {exchange.active ? (
                          <Tooltip title="Delete exchange">
                            <IconButton
                              aria-label={`Delete ${exchange.mic}`}
                              color="error"
                              size="small"
                              disabled={pending}
                              sx={appIconButtonSx("destructive-action")}
                              onClick={(event) => {
                                event.stopPropagation()
                                setDeleteCandidate(exchange)
                              }}
                            >
                              <TrashIcon />
                            </IconButton>
                          </Tooltip>
                        ) : (
                          <Tooltip title="Restore exchange">
                            <IconButton
                              aria-label={`Restore ${exchange.mic}`}
                              color="primary"
                              size="small"
                              disabled={pending}
                              sx={appIconButtonSx("accent")}
                              onClick={(event) => {
                                event.stopPropagation()
                                run(() => restoreExchangeAction(exchange.id), `${exchange.mic} restored.`)
                              }}
                            >
                              <RestoreIcon />
                            </IconButton>
                          </Tooltip>
                        )}
                      </Stack>
                    </TableCell>
                  </TableRow>
                  {editing?.id === exchange.id ? (
                    <InlineExchangeEditor
                      exchange={exchange}
                      pending={pending}
                      onClose={() => setEditing(null)}
                      onRestore={() => run(() => restoreExchangeAction(exchange.id), `${exchange.mic} restored.`)}
                      onSubmit={(formData) => run(() => updateExchangeAction({ id: exchange.id, ...exchangeFormPayload(formData) }), `${exchange.mic} updated.`)}
                    />
                  ) : null}
                </Fragment>
              ))}
            </TableBody>
          </Table>
          {!loadingExchanges && filteredExchanges.length === 0 ? (
            <Typography sx={{ ...appTypography.tableSecondary, py: 8, textAlign: "center" }}>
              No exchanges match this view.
            </Typography>
          ) : null}
        </TableContainer>
        {filteredExchanges.length > 0 || showAdd ? (
          <PaginationFooter
            page={normalizedPage}
            pageCount={pageCount}
            start={pageRange.start}
            end={pageRange.end}
            total={filteredExchanges.length}
            onChange={(nextPage) => {
              setPage(nextPage)
              setEditing(null)
            }}
          />
        ) : null}
      </Card>

      <DeleteExchangeDialog
        exchange={deleteCandidate}
        pending={pending}
        onCancel={() => {
          setDeleteCandidate(null)
          showToast({ severity: "info", message: "Exchange delete cancelled." })
        }}
        onConfirm={() => {
          if (!deleteCandidate) return
          const exchange = deleteCandidate
          run(() => deleteExchangeAction(exchange.id), `${exchange.mic} deleted.`)
        }}
      />
    </PageShell>
  )
}

function ExchangeTableSkeleton() {
  return (
    <>
      {Array.from({ length: 6 }, (_, index) => (
        <TableRow key={index}>
          <TableCell><Skeleton animation="wave" width="56%" /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={110} sx={{ ml: "auto" }} /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={96} sx={{ ml: "auto" }} /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={72} sx={{ ml: "auto" }} /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={32} sx={{ ml: "auto" }} /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

function InlineExchangeEditor({
  exchange,
  pending,
  onClose,
  onRestore,
  onSubmit,
}: {
  exchange: ExchangeView
  pending: boolean
  onClose: () => void
  onRestore: () => void
  onSubmit: (formData: FormData) => void
}) {
  return (
    <TableRow>
      <TableCell colSpan={5} sx={adminInlineEditorCellSx}>
        <Box component="form" action={onSubmit}>
          <AdminInspectorHeader
            title="Exchange inspector"
            detail={`${exchange.mic} - ${exchange.name}`}
            meta={exchange.active ? "Active" : "Disabled"}
          />
          <AdminInspectorBody>
            <ExchangeFormFields exchange={exchange} disabled={!exchange.active} />
          </AdminInspectorBody>
          <AdminInspectorActions summary={exchange.active ? `${exchange.mic} trading calendar` : `${exchange.mic} is disabled`}>
            <Button type="button" variant="outlined" disabled={pending} onClick={onClose}>Cancel</Button>
            {!exchange.active ? (
              <Button type="button" variant="contained" disabled={pending} onClick={onRestore}>{pending ? "Restoring..." : "Restore exchange"}</Button>
            ) : (
              <Button type="submit" variant="contained" disabled={pending}>{pending ? "Saving..." : "Save changes"}</Button>
            )}
          </AdminInspectorActions>
        </Box>
      </TableCell>
    </TableRow>
  )
}

function InlineExchangeCreate({
  pending,
  onClose,
  onSubmit,
}: {
  pending: boolean
  onClose: () => void
  onSubmit: (formData: FormData) => void
}) {
  return (
    <TableRow>
      <TableCell colSpan={5} sx={adminInlineEditorCellSx}>
        <Box component="form" action={onSubmit}>
          <AdminInspectorHeader
            title="New exchange"
            detail="Create exchange metadata and trading calendar"
            meta="Exchange"
          />
          <AdminInspectorBody>
            <ExchangeFormFields />
          </AdminInspectorBody>
          <AdminInspectorActions summary="New exchange calendar">
            <Button type="button" variant="outlined" disabled={pending} onClick={onClose}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={pending}>{pending ? "Creating..." : "Create exchange"}</Button>
          </AdminInspectorActions>
        </Box>
      </TableCell>
    </TableRow>
  )
}

function ExchangeFormFields({ exchange, disabled = false }: { exchange?: ExchangeView; disabled?: boolean }) {
  const [replaceHolidays, setReplaceHolidays] = useState(false)
  return (
    <>
      <SectionLabel label="Basics" />
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", lg: "minmax(150px, 0.4fr) minmax(300px, 1.6fr)" },
        }}
      >
        <TextField name="mic" label="MIC" size="small" defaultValue={exchange?.mic ?? ""} disabled={disabled} required fullWidth slotProps={{ htmlInput: { maxLength: 8 } }} />
        <TextField name="name" label="Name" size="small" defaultValue={exchange?.name ?? ""} disabled={disabled} required fullWidth />
      </Box>
      <Box
        sx={{
          display: "grid",
          gap: 1.5,
          gridTemplateColumns: { xs: "1fr", md: "minmax(260px, 1fr) 160px 160px" },
          mt: 1.5,
        }}
      >
        <TextField name="timezone" label="Timezone" size="small" defaultValue={exchange?.timezone ?? ""} disabled={disabled} required fullWidth />
        <TextField
          name="regular_open_local"
          label="Regular open"
          type="time"
          size="small"
          defaultValue={exchange?.regular_open_local ?? ""}
          disabled={disabled}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
        />
        <TextField
          name="regular_close_local"
          label="Regular close"
          type="time"
          size="small"
          defaultValue={exchange?.regular_close_local ?? ""}
          disabled={disabled}
          fullWidth
          slotProps={{ inputLabel: { shrink: true }, htmlInput: { step: 1 } }}
        />
      </Box>

      <Box sx={adminInspectorSectionSx}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", sm: "center" }, justifyContent: "space-between", mb: 1.5 }}>
          <Box>
            <SectionLabel label="Holiday calendar" />
            <Typography sx={appTypography.metadata}>
              Leave replacement disabled to keep existing holidays unchanged.
            </Typography>
          </Box>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Switch checked={replaceHolidays} disabled={disabled} onChange={(_, checked) => setReplaceHolidays(checked)} slotProps={{ input: { "aria-label": "Replace holiday calendar" } }} />
            <Typography sx={appTypography.tableSecondary}>Replace</Typography>
          </Stack>
        </Stack>
        <input type="hidden" name="replace_holidays" value={replaceHolidays ? "true" : "false"} />
        <TextField
          name="holidays"
          label="Holidays"
          placeholder={"2026-01-01\n2026-12-25"}
          disabled={disabled || !replaceHolidays}
          multiline
          minRows={4}
          fullWidth
        />
      </Box>
    </>
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
        borderTop: "1px solid var(--app-divider)",
        bgcolor: "var(--app-surface-header)",
        justifyContent: "space-between",
        px: 1.5,
        py: 1,
      }}
    >
      <Typography sx={appTypography.panelMeta}>{start}-{end} of {total}</Typography>
      <Pagination count={pageCount} page={page} size="small" onChange={(_, value) => onChange(value)} />
    </Stack>
  )
}

function DeleteExchangeDialog({
  exchange,
  pending,
  onCancel,
  onConfirm,
}: {
  exchange: ExchangeView | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  return (
    <Dialog open={exchange !== null} onClose={pending ? undefined : onCancel} fullWidth maxWidth="sm" slotProps={dialogPaperSlotProps}>
      <DialogTitle sx={dialogTitleSx}>Delete {exchange?.mic}?</DialogTitle>
      <DialogContent sx={{ bgcolor: "var(--app-surface-raised)", p: 0 }}>
        <Box sx={{ px: 2, py: 2 }}>
          <Typography sx={appTypography.tableSecondary}>
            This removes the exchange from administration lists. Deletion is blocked while active listings still use it.
          </Typography>
        </Box>
      </DialogContent>
      <DialogActions sx={dialogActionsSx}>
        <Button type="button" variant="outlined" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="contained" color="error" disabled={pending} onClick={onConfirm}>
          {pending ? "Deleting..." : "Delete exchange"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function exchangeFormPayload(formData: FormData) {
  const replaceHolidays = String(formData.get("replace_holidays") ?? "") === "true"
  return {
    mic: String(formData.get("mic") ?? "").trim().toUpperCase(),
    name: String(formData.get("name") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "").trim(),
    regularOpenLocal: emptyToNull(String(formData.get("regular_open_local") ?? "")),
    regularCloseLocal: emptyToNull(String(formData.get("regular_close_local") ?? "")),
    ...(replaceHolidays ? { holidays: splitDates(String(formData.get("holidays") ?? "")) } : {}),
  }
}

function paginateExchanges(exchanges: ExchangeView[], editingId: string | null, showAdd: boolean) {
  const pages: ExchangeView[][] = []
  let currentPage: ExchangeView[] = []
  let currentSlots = showAdd ? INLINE_EDIT_EXTRA_SLOTS : 0

  exchanges.forEach((exchange) => {
    const exchangeSlots = 1 + (exchange.id === editingId ? INLINE_EDIT_EXTRA_SLOTS : 0)
    if (currentPage.length > 0 && currentSlots + exchangeSlots > EXCHANGE_PAGE_SIZE) {
      pages.push(currentPage)
      currentPage = []
      currentSlots = 0
    }
    currentPage.push(exchange)
    currentSlots += exchangeSlots
  })

  if (currentPage.length > 0) pages.push(currentPage)
  if (pages.length === 0) pages.push([])
  return pages
}

function pageRangeFor(pageExchanges: ExchangeView[], allExchanges: ExchangeView[]) {
  if (allExchanges.length === 0) return { start: 0, end: 0 }
  if (pageExchanges.length === 0) return { start: 0, end: 0 }
  const firstIndex = allExchanges.findIndex((exchange) => exchange.id === pageExchanges[0]?.id)
  const lastIndex = allExchanges.findIndex((exchange) => exchange.id === pageExchanges[pageExchanges.length - 1]?.id)
  return { start: Math.max(0, firstIndex) + 1, end: Math.max(0, lastIndex) + 1 }
}

function tradingHours(exchange: ExchangeView) {
  if (!exchange.regular_open_local && !exchange.regular_close_local) return "-"
  return `${exchange.regular_open_local ?? "-"} - ${exchange.regular_close_local ?? "-"}`
}

function emptyToNull(value: string): string | null {
  const raw = value.trim()
  return raw || null
}

function splitDates(value: string): string[] {
  return value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)
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

function RestoreIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
      <path d="M5 8a6 6 0 1 1 1.8 4.3" />
      <path d="M5 4v4h4" />
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
  borderBottom: "1px solid var(--app-divider)",
  bgcolor: "var(--app-surface-header)",
  color: "var(--app-text)",
  fontSize: 15,
  fontWeight: 800,
  px: 2,
  py: 1.5,
}

const dialogActionsSx = {
  borderTop: "1px solid var(--app-divider)",
  bgcolor: "var(--app-surface-header)",
  px: 2,
  py: 1.25,
}
