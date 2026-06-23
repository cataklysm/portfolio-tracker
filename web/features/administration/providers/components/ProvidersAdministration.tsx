"use client"

import { Fragment, useEffect, useMemo, useRef, useState, useTransition, type Dispatch, type SetStateAction } from "react"
import { useSearchParams } from "next/navigation"
import {
  Box,
  Breadcrumbs,
  Button,
  Card,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
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
import { AppBadge } from "@/application/shell/AppBadge"
import { appTypography, tableHeadSx } from "@/application/shell/appTypography"
import {
  listAdminProviderConfigurationAction,
  listAdminProviderCadenceAction,
  providerUsageAction,
  updateAdminProviderAction,
  updateCapabilityRefreshAction,
} from "@/features/administration/providers/actions"
import { ControlBar } from "@/application/shell/ControlBar"
import { PageShell } from "@/application/shell/PageShell"
import { selectableRowSx } from "@/application/shell/rowSelection"
import { useToast, type ToastMessage } from "@/application/toast/ToastProvider"
import {
  AdminInspectorActions,
  AdminInspectorBody,
  AdminInspectorHeader,
  AdminSectionLabel as SectionLabel,
  adminInlineEditorCellSx,
} from "@/features/administration/components/AdminInspector"
import type { CapabilityRefreshView, DataQuality, ProviderSettingsView, ProviderUsageView } from "@/lib/types"

const providerExpansionStorageKey = "administration.providers.expanded.v2"
const providerTabs = [
  { key: "all", label: "All" },
  { key: "symbol", label: "Symbol" },
  { key: "crypto", label: "Crypto" },
  { key: "reference", label: "Reference" },
] as const

type ProviderTab = (typeof providerTabs)[number]["key"]

export function ProvidersAdministration({
  providers: initialProviders,
  capabilityRefresh: initialCapabilityRefresh,
}: {
  providers: ProviderSettingsView[]
  capabilityRefresh: CapabilityRefreshView[]
}) {
  const searchParams = useSearchParams()
  const { showToast } = useToast()
  const [providers, setProviders] = useState(initialProviders)
  const [capabilityRefreshRows, setCapabilityRefreshRows] = useState(initialCapabilityRefresh)
  const [loadedProviderCadence, setLoadedProviderCadence] = useState<Set<string>>(() => new Set(initialCapabilityRefresh.map((row) => row.provider)))
  const [loadingProviderCadence, setLoadingProviderCadence] = useState<Record<string, boolean>>({})
  const [loadingProviders, setLoadingProviders] = useState(initialProviders.length === 0 && initialCapabilityRefresh.length === 0)
  const cadenceByProvider = useMemo(() => {
    const cadenceMap = new Map<string, CapabilityRefreshView[]>()
    for (const capabilityRefreshSetting of capabilityRefreshRows) {
      const providerCadence = cadenceMap.get(capabilityRefreshSetting.provider) ?? []
      providerCadence.push(capabilityRefreshSetting)
      cadenceMap.set(capabilityRefreshSetting.provider, providerCadence)
    }
    return cadenceMap
  }, [capabilityRefreshRows])
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<ProviderTab>("all")
  const [expandedProviders, setExpandedProviders] = useState<Record<string, boolean>>({})
  const tabBeforeSearchRef = useRef<ProviderTab | null>(null)
  const searchAutoSwitchedRef = useRef(false)
  const searchTerm = query.trim().toLowerCase()

  useEffect(() => {
    if (providers.length > 0 || capabilityRefreshRows.length > 0) return
    let active = true
    setLoadingProviders(true)
    listAdminProviderConfigurationAction().then((result) => {
      if (!active) return
      if (result.error) {
        showToast({ severity: "error", message: result.error })
      } else {
        setProviders(result.providers)
        setCapabilityRefreshRows(result.capabilityRefresh)
      }
      setLoadingProviders(false)
    })
    return () => { active = false }
  }, [capabilityRefreshRows.length, providers.length, showToast])

  async function reloadProviders() {
    setLoadingProviders(true)
    const result = await listAdminProviderConfigurationAction()
    if (result.error) {
      showToast({ severity: "error", message: result.error })
    } else {
      setProviders(result.providers)
    }
    setLoadingProviders(false)
  }

  async function loadProviderCadence(provider: string, force = false) {
    if (!force && (loadedProviderCadence.has(provider) || loadingProviderCadence[provider])) return
    setLoadingProviderCadence((currentLoading) => ({ ...currentLoading, [provider]: true }))
    const result = await listAdminProviderCadenceAction(provider)
    if (result.error) {
      showToast({ severity: "error", message: result.error })
    } else {
      setCapabilityRefreshRows((currentRows) => [
        ...currentRows.filter((row) => row.provider !== provider),
        ...result.capabilityRefresh,
      ])
      setLoadedProviderCadence((currentLoaded) => new Set([...currentLoaded, provider]))
    }
    setLoadingProviderCadence((currentLoading) => ({ ...currentLoading, [provider]: false }))
  }

  useEffect(() => {
    const requestedProvider = searchParams.get("provider")
    const requestedTab = searchParams.get("tab")
    if (requestedProvider) {
      const provider = providers.find((candidateProvider) => candidateProvider.provider.toLowerCase() === requestedProvider.toLowerCase())
      if (!provider) return
      setActiveTab(providerTabFor(provider))
      setQuery(provider.provider)
      setProviderExpanded(provider.provider, true)
      void loadProviderCadence(provider.provider)
      return
    }
    if (requestedTab === "all" || requestedTab === "symbol" || requestedTab === "crypto" || requestedTab === "reference") {
      setActiveTab(requestedTab)
    }
  }, [providers, searchParams])

  useEffect(() => {
    try {
      const storedExpandedProviders = localStorage.getItem(providerExpansionStorageKey)
      if (!storedExpandedProviders) return
      const parsedExpandedProviders = JSON.parse(storedExpandedProviders) as Record<string, boolean>
      setExpandedProviders((currentExpandedProviders) => ({ ...currentExpandedProviders, ...parsedExpandedProviders }))
    } catch {
      localStorage.removeItem(providerExpansionStorageKey)
    }
  }, [])

  const tabCounts = useMemo(() => {
    return Object.fromEntries(providerTabs.map((providerTab) => [
      providerTab.key,
      providerTab.key === "all" ? providers.length : providers.filter((provider) => providerTabFor(provider) === providerTab.key).length,
    ])) as Record<ProviderTab, number>
  }, [providers])

  const filteredTabCounts = useMemo(() => {
    return Object.fromEntries(providerTabs.map((providerTab) => [
      providerTab.key,
      providers.filter((provider) => (providerTab.key === "all" || providerTabFor(provider) === providerTab.key) && providerMatchesSearch(provider, searchTerm)).length,
    ])) as Record<ProviderTab, number>
  }, [providers, searchTerm])

  const visibleTabs = useMemo(() => {
    const populatedTabs = providerTabs.filter((providerTab) => providerTab.key === "all" || tabCounts[providerTab.key] > 0)
    return populatedTabs.length > 0 ? populatedTabs : providerTabs
  }, [tabCounts])
  const activeTabCount = filteredTabCounts[activeTab] ?? 0

  useEffect(() => {
    if (visibleTabs.length === 0) return
    if (!visibleTabs.some((providerTab) => providerTab.key === activeTab)) {
      setActiveTab(visibleTabs[0].key)
      return
    }
    if (!searchTerm || activeTabCount > 0) return
    const firstTabWithMatch = visibleTabs.find((providerTab) => filteredTabCounts[providerTab.key] > 0)
    if (firstTabWithMatch) {
      searchAutoSwitchedRef.current = true
      setActiveTab(firstTabWithMatch.key)
    }
  }, [activeTab, activeTabCount, filteredTabCounts, searchTerm, visibleTabs])

  const filteredProviders = useMemo(() => {
    const tabProviders = activeTab === "all" ? providers : providers.filter((provider) => providerTabFor(provider) === activeTab)
    if (!searchTerm) return tabProviders
    return tabProviders.filter((provider) => providerMatchesSearch(provider, searchTerm))
  }, [providers, searchTerm, activeTab])

  function setProviderExpanded(provider: string, nextExpanded: boolean) {
    setExpandedProviders((currentExpandedProviders) => {
      const nextExpandedProviders = { ...currentExpandedProviders, [provider]: nextExpanded }
      localStorage.setItem(providerExpansionStorageKey, JSON.stringify(nextExpandedProviders))
      return nextExpandedProviders
    })
  }

  function toggleProviderExpanded(provider: string, nextExpanded: boolean) {
    setProviderExpanded(provider, nextExpanded)
    if (nextExpanded) void loadProviderCadence(provider)
  }

  function changeQuery(nextQuery: string) {
    const isSearching = query.trim().length > 0
    const willSearch = nextQuery.trim().length > 0
    if (!isSearching && willSearch) {
      tabBeforeSearchRef.current = activeTab
      searchAutoSwitchedRef.current = false
    }
    if (isSearching && !willSearch) {
      if (searchAutoSwitchedRef.current && tabBeforeSearchRef.current) setActiveTab(tabBeforeSearchRef.current)
      tabBeforeSearchRef.current = null
      searchAutoSwitchedRef.current = false
    }
    setQuery(nextQuery)
  }

  function changeTab(nextTab: ProviderTab) {
    if (searchTerm) searchAutoSwitchedRef.current = false
    setActiveTab(nextTab)
  }

  function clearToolbarFilters() {
    changeQuery("")
    setActiveTab("all")
  }

  return (
    <PageShell kind="admin" maxWidth={1640}>
      <Breadcrumbs aria-label="breadcrumb">
        <Typography sx={appTypography.breadcrumbParent}>
          Administration
        </Typography>
        <Typography sx={appTypography.breadcrumbCurrent}>
          Providers
        </Typography>
      </Breadcrumbs>

      <ControlBar
        defaultTabValue="all"
        onClearFilters={clearToolbarFilters}
        onReload={() => { void reloadProviders() }}
        onSearchChange={changeQuery}
        onTabChange={changeTab}
        reloadLabel="Reload providers"
        reloadLoading={loadingProviders}
        searchPlaceholder="Provider, class, quality or capability"
        searchValue={query}
        tabs={visibleTabs.map((providerTab) => ({
          count: filteredTabCounts[providerTab.key],
          label: providerTab.label,
          value: providerTab.key,
        }))}
        tabValue={activeTab}
      />

      <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "var(--app-surface-panel)", boxShadow: "var(--app-shadow)" }}>
        <Stack direction="row" sx={{ alignItems: "center", bgcolor: "var(--app-surface-header)", borderBottom: "1px solid var(--app-divider)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
          <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
            <Typography component="h2" sx={appTypography.panelTitle}>Providers</Typography>
            <AppBadge label={filteredProviders.length} kind="count" />
            {loadingProviders ? <Skeleton animation="wave" variant="circular" width={14} height={14} /> : null}
          </Stack>
          <Typography sx={appTypography.panelMeta}>
            {visibleTabs.find((providerTab) => providerTab.key === activeTab)?.label}
          </Typography>
        </Stack>

        <TableContainer>
          <Table size="small" sx={{ minWidth: 920 }}>
            <TableHead sx={tableHeadSx}>
              <TableRow>
                <TableCell>Provider</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Class</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Quality</TableCell>
                <TableCell align="right" sx={{ width: 120 }}>Capabilities</TableCell>
                <TableCell align="right" sx={{ width: 92 }}>Enabled</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loadingProviders && providers.length === 0 ? <ProviderTableSkeleton /> : null}
              {filteredProviders.map((provider) => (
                <ProviderSettingsRow
                  key={provider.provider}
                  provider={provider}
                  cadence={cadenceByProvider.get(provider.provider) ?? []}
                  cadenceLoading={loadingProviderCadence[provider.provider] ?? false}
                  cadenceLoaded={loadedProviderCadence.has(provider.provider)}
                  expanded={expandedProviders[provider.provider] ?? false}
                  onToggle={(nextExpanded) => toggleProviderExpanded(provider.provider, nextExpanded)}
                  onToast={showToast}
                  onSaved={() => {
                    void reloadProviders()
                    void loadProviderCadence(provider.provider, true)
                  }}
                />
              ))}
            </TableBody>
          </Table>
          {!loadingProviders && filteredProviders.length === 0 ? (
            <Typography sx={{ ...appTypography.tableSecondary, py: 8, textAlign: "center" }}>
              No providers match this view.
            </Typography>
          ) : null}
        </TableContainer>
      </Card>

    </PageShell>
  )
}

function providerTabFor(provider: ProviderSettingsView): ProviderTab {
  const providerClass = provider.providerClass as string
  if (providerClass === "reference" || providerClass === "symbol" || providerClass === "crypto") return providerClass
  return provider.provider.toLowerCase().includes("crypto") ? "crypto" : "symbol"
}

function providerMatchesSearch(provider: ProviderSettingsView, searchTerm: string): boolean {
  if (!searchTerm) return true
  return [
    provider.provider,
    provider.providerClass,
    provider.dataQuality,
    ...Object.keys(provider.capabilityQuality),
    ...Object.values(provider.capabilityQuality).filter(Boolean),
  ].some((value) => value.toLowerCase().includes(searchTerm))
}

function ProviderTableSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }, (_, index) => (
        <TableRow key={index}>
          <TableCell><Skeleton animation="wave" width="48%" /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={72} sx={{ ml: "auto" }} /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={76} sx={{ ml: "auto" }} /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={48} sx={{ ml: "auto" }} /></TableCell>
          <TableCell align="right"><Skeleton animation="wave" width={42} sx={{ ml: "auto" }} /></TableCell>
        </TableRow>
      ))}
    </>
  )
}

function ProviderSettingsRow({
  provider,
  cadence,
  cadenceLoading,
  cadenceLoaded,
  expanded,
  onToggle,
  onToast,
  onSaved,
}: {
  provider: ProviderSettingsView
  cadence: CapabilityRefreshView[]
  cadenceLoading: boolean
  cadenceLoaded: boolean
  expanded: boolean
  onToggle: (expanded: boolean) => void
  onToast: (toast: ToastMessage) => void
  onSaved: () => void
}) {
  const [enabled, setEnabled] = useState(provider.enabled)
  const [dataQuality, setDataQuality] = useState<DataQuality>(provider.dataQuality)
  const [capabilityQuality, setCapabilityQuality] = useState<Record<string, DataQuality>>(() => normalizeCapabilityQuality(provider.capabilityQuality))
  const [maxConcurrency, setMaxConcurrency] = useState(provider.maxConcurrency)
  const [maxBatchSize, setMaxBatchSize] = useState<number | "">(provider.maxBatchSize ?? "")
  const [rateLimitPerMin, setRateLimitPerMin] = useState<number | "">(provider.rateLimitPerMin ?? "")
  const [cadenceState, setCadenceState] = useState<Record<string, CadenceFormState>>(() => buildCadenceFormState(cadence))
  const [baseline, setBaseline] = useState<ProviderFormSnapshot>(() => buildProviderFormSnapshot(provider, cadence))
  const [disableUsage, setDisableUsage] = useState<ProviderUsageView[] | null>(null)
  const [pending, startTransition] = useTransition()
  const capabilities = useMemo(() => {
    return [...new Set([...Object.keys(capabilityQuality), ...Object.keys(provider.capabilityQuality), ...cadence.map((capabilityRefreshSetting) => capabilityRefreshSetting.capability)])]
      .sort((firstCapability, secondCapability) => capabilityLabel(firstCapability).localeCompare(capabilityLabel(secondCapability)))
  }, [cadence, capabilityQuality, provider.capabilityQuality])
  const currentSnapshot = useMemo(() => ({
    dataQuality,
    capabilityQuality,
    maxConcurrency,
    maxBatchSize,
    rateLimitPerMin,
    cadenceState,
  }), [cadenceState, capabilityQuality, dataQuality, maxBatchSize, maxConcurrency, rateLimitPerMin])
  const isDirty = !providerFormSnapshotsEqual(currentSnapshot, baseline)

  useEffect(() => {
    const nextBaseline = buildProviderFormSnapshot(provider, cadence)
    setEnabled(provider.enabled)
    setDataQuality(provider.dataQuality)
    setCapabilityQuality(normalizeCapabilityQuality(provider.capabilityQuality))
    setMaxConcurrency(provider.maxConcurrency)
    setMaxBatchSize(provider.maxBatchSize ?? "")
    setRateLimitPerMin(provider.rateLimitPerMin ?? "")
    setCadenceState(nextBaseline.cadenceState)
    setBaseline(nextBaseline)
  }, [provider, cadence])

  async function requestDisableProvider() {
    const providerUsage = await providerUsageAction(provider.provider)
    if (providerUsage.error) {
      onToast({ severity: "error", message: providerUsage.error })
      return
    }
    if (providerUsage.usage.length > 0) {
      setDisableUsage(providerUsage.usage)
      return
    }
    persistEnabled(false)
  }

  async function saveProviderCard() {
    const providerError = await updateAdminProviderAction({
      provider: provider.provider,
      dataQuality,
      capabilityQuality,
      maxBatchSize: emptyNumberToNull(maxBatchSize),
      rateLimitPerMin: emptyNumberToNull(rateLimitPerMin),
      maxConcurrency: Math.max(1, maxConcurrency),
    })
    if (providerError) return providerError

    for (const capabilityRefreshSetting of cadence) {
      const nextCadence = cadenceState[capabilityRefreshSetting.capability]
      if (!nextCadence) continue
      const cadenceError = await updateCapabilityRefreshAction({
        provider: provider.provider,
        capability: capabilityRefreshSetting.capability,
        refreshIntervalMs: toMs(nextCadence.intervalValue, nextCadence.intervalUnit),
        saveResolutionMs: capabilityRefreshSetting.capability === "quotes" ? toMs(nextCadence.resolutionValue, nextCadence.resolutionUnit) : undefined,
        enabled: nextCadence.enabled,
      })
      if (cadenceError) return cadenceError
    }
    return null
  }

  function changeEnabled(nextEnabled: boolean) {
    if (provider.enabled && !nextEnabled) {
      requestDisableProvider()
      return
    }
    persistEnabled(nextEnabled)
  }

  function persistEnabled(nextEnabled: boolean) {
    startTransition(async () => {
      const error = await updateAdminProviderAction({
        provider: provider.provider,
        enabled: nextEnabled,
      })
      if (error) {
        onToast({ severity: "error", message: error })
        return
      }

      setEnabled(nextEnabled)
      if (!nextEnabled) onToggle(false)
      setDisableUsage(null)
      onToast({ severity: "success", message: `${provider.provider} ${nextEnabled ? "enabled" : "disabled"}.` })
      onSaved()
    })
  }

  function save() {
    startTransition(async () => {
      const error = await saveProviderCard()
      if (error) {
        onToast({ severity: error.includes("cancelled") ? "info" : "error", message: error })
        return
      }
      onToast({ severity: "success", message: `${provider.provider} settings saved.` })
      setBaseline(currentSnapshot)
      onSaved()
    })
  }

  return (
    <Fragment>
      <TableRow
        hover
        onClick={() => onToggle(!expanded)}
        aria-selected={expanded}
        sx={{ ...selectableRowSx(expanded), cursor: "pointer", opacity: enabled ? 1 : 0.58 }}
      >
        <TableCell>
          <Stack spacing={0.5}>
            <Typography sx={appTypography.tablePrimary}>{provider.provider}</Typography>
            <Typography noWrap sx={appTypography.tableMeta}>{provider.providerClass}</Typography>
          </Stack>
        </TableCell>
        <TableCell align="right">
          <AppBadge label={toTitleCase(providerTabFor(provider))} kind="category" />
        </TableCell>
        <TableCell align="right">
          <QualityChip quality={dataQuality} />
        </TableCell>
        <TableCell align="right">
          <ProviderCapabilitiesCell
            capabilities={capabilities}
            capabilityQuality={capabilityQuality}
            cadenceState={cadenceState}
            providerEnabled={enabled}
          />
        </TableCell>
        <TableCell align="right">
          <Switch
            checked={enabled}
            disabled={pending}
            onClick={(event) => event.stopPropagation()}
            onChange={(_, nextEnabled) => changeEnabled(nextEnabled)}
            slotProps={{ input: { "aria-label": `${provider.provider} availability` } }}
          />
        </TableCell>
      </TableRow>

      {expanded ? (
        <TableRow>
          <TableCell colSpan={5} sx={adminInlineEditorCellSx}>
            <AdminInspectorHeader
              title="Provider inspector"
              detail={`${provider.provider} - ${toTitleCase(providerTabFor(provider))}`}
              meta={enabled ? "Enabled" : "Disabled"}
            />
            <AdminInspectorBody divided>
              <fieldset disabled={!enabled} style={{ border: 0, margin: 0, padding: 0 }}>
                <SectionLabel label="Provider settings" />
                <Box sx={{ display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" } }}>
                  <TextField label="Overall quality" select size="small" value={dataQuality} onChange={(event) => setDataQuality(event.target.value as DataQuality)} disabled={!enabled} fullWidth>
                    {dataQualityOptions.map((quality) => <MenuItem key={quality} value={quality}>{toTitleCase(quality)}</MenuItem>)}
                  </TextField>
                  <NumberField label="Concurrency" value={maxConcurrency} onValue={(value) => setMaxConcurrency(value === "" ? 1 : value)} disabled={!enabled} />
                  <NumberField label="Batch size" value={maxBatchSize} onValue={setMaxBatchSize} placeholder="single" disabled={!enabled} />
                  <NumberField label="Rate/min" value={rateLimitPerMin} onValue={setRateLimitPerMin} placeholder="unset" disabled={!enabled} />
                </Box>
              </fieldset>
            </AdminInspectorBody>
            {cadenceLoading && !cadenceLoaded ? (
              <ProviderDetailSkeleton />
            ) : (
              <ProviderCapabilitiesEditor
                capabilities={capabilities}
                capabilityQuality={capabilityQuality}
                cadenceState={cadenceState}
                disabled={!enabled}
                onCadenceState={setCadenceState}
                onCapabilityQuality={setCapabilityQuality}
              />
            )}
            <AdminInspectorActions
              summary={cadenceLoading && !cadenceLoaded ? "Loading capability details..." : enabled ? `${capabilities.length} capabilities configured` : `${provider.provider} is disabled`}
            >
              <Button type="button" variant="outlined" disabled={pending} onClick={() => onToggle(false)}>Cancel</Button>
              <Button type="button" variant="contained" disabled={pending || !enabled || !isDirty || (cadenceLoading && !cadenceLoaded)} onClick={save}>{pending ? "Saving..." : "Save changes"}</Button>
            </AdminInspectorActions>
          </TableCell>
        </TableRow>
      ) : null}

      <DisableProviderDialog
        provider={provider.provider}
        usage={disableUsage}
        pending={pending}
        onCancel={() => {
          setDisableUsage(null)
          onToast({ severity: "info", message: "Provider disable cancelled." })
        }}
        onConfirm={() => persistEnabled(false)}
      />
    </Fragment>
  )
}

function DisableProviderDialog({
  provider,
  usage,
  pending,
  onCancel,
  onConfirm,
}: {
  provider: string
  usage: ProviderUsageView[] | null
  pending: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const uniqueAssets = usage ? uniqueProviderUsageAssets(usage) : []
  const visibleAssets = uniqueAssets.slice(0, 5)
  const remainingAssetCount = Math.max(0, uniqueAssets.length - visibleAssets.length)

  return (
    <Dialog
      open={usage !== null}
      onClose={pending ? undefined : onCancel}
      fullWidth
      maxWidth="sm"
      slotProps={{
        paper: {
          variant: "outlined",
          sx: {
            borderColor: "var(--app-border)",
            bgcolor: "var(--app-surface-raised)",
            boxShadow: "var(--app-shadow)",
          },
        },
      }}
    >
      <DialogTitle sx={dialogTitleSx}>
        Disable {provider}?
      </DialogTitle>
      <DialogContent sx={{ bgcolor: "var(--app-surface-raised)", p: 0 }}>
        <Box sx={{ px: 2, pb: 1.5, pt: 2.75 }}>
          <Typography sx={{ ...appTypography.tableSecondary, mb: 1.5 }}>
            These selections will stop refreshing until they are reassigned.
          </Typography>
          <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "var(--app-surface)", p: 1.25 }}>
            <Stack spacing={0.75}>
              {visibleAssets.map((usageItem) => (
                <Typography key={usageItem.instrument_id} sx={appTypography.tablePrimary}>
                  {usageItem.instrument_name}
                </Typography>
              ))}
              {remainingAssetCount > 0 ? (
                <Typography sx={appTypography.tableMeta}>
                  and {remainingAssetCount} others
                </Typography>
              ) : null}
            </Stack>
          </Card>
        </Box>
      </DialogContent>
      <DialogActions sx={dialogActionsSx}>
        <Button type="button" variant="outlined" disabled={pending} onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="contained" color="error" disabled={pending} onClick={onConfirm}>
          {pending ? "Disabling..." : "Disable provider"}
        </Button>
      </DialogActions>
    </Dialog>
  )
}

function ProviderCapabilitiesCell({
  capabilities,
  capabilityQuality,
  cadenceState,
  providerEnabled,
}: {
  capabilities: string[]
  capabilityQuality: Record<string, DataQuality>
  cadenceState: Record<string, CadenceFormState>
  providerEnabled: boolean
}) {
  const capabilityRows = capabilities.map((capability) => {
    const cadence = cadenceState[capability]
    const quality = capabilityQuality[capability] ?? "unknown"
    const configured = Boolean(capabilityQuality[capability] || cadence)
    const active = providerEnabled && configured && (cadence ? cadence.enabled : true)
    return {
      active,
      capability,
      label: capabilityLabel(capability),
      quality,
    }
  })
  const activeCount = capabilityRows.filter((capabilityRow) => capabilityRow.active).length
  const totalCount = capabilityRows.length
  const chipColor = totalCount === 0 || activeCount === 0 ? "error" : activeCount === totalCount ? "success" : "warning"

  return (
    <Tooltip
      arrow
      placement="left"
      title={(
        <Stack spacing={0.75} sx={{ py: 0.5, minWidth: 230 }}>
          {capabilityRows.length > 0 ? capabilityRows.map((capabilityRow) => (
            <Stack key={capabilityRow.capability} direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
              <Typography sx={{ color: "inherit", fontSize: 11, fontWeight: 650 }}>{capabilityRow.label}</Typography>
              <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
                <Typography sx={{ color: "inherit", fontSize: 11, fontWeight: 500 }}>{toTitleCase(capabilityRow.quality)}</Typography>
                <AppBadge
                  label={capabilityRow.active ? "Active" : "Disabled"}
                  kind="status"
                  tone={capabilityRow.active ? "success" : "danger"}
                />
              </Stack>
            </Stack>
          )) : (
            <Typography sx={{ color: "inherit", fontSize: 11, fontWeight: 500 }}>No capabilities configured</Typography>
          )}
        </Stack>
      )}
    >
      <AppBadge
        label={`${activeCount}/${totalCount}`}
        kind="count"
        tone={chipColor === "success" ? "success" : chipColor === "warning" ? "warning" : "danger"}
        sx={{ minWidth: 48 }}
      />
    </Tooltip>
  )
}

function uniqueProviderUsageAssets(usage: ProviderUsageView[]): ProviderUsageView[] {
  const seenInstrumentIds = new Set<string>()
  const uniqueUsage: ProviderUsageView[] = []
  for (const usageItem of usage) {
    if (seenInstrumentIds.has(usageItem.instrument_id)) continue
    seenInstrumentIds.add(usageItem.instrument_id)
    uniqueUsage.push(usageItem)
  }
  return uniqueUsage
}

const capabilityLabels: Record<string, string> = {
  quotes: "Quotes & chart",
  earnings: "Events (earnings, actions, news)",
  fundamentals: "Fundamentals",
  analyst: "Analyst",
  fx: "FX rates",
}

const dataQualityOptions: DataQuality[] = ["high", "medium", "low", "unknown"]

function capabilityLabel(capability: string): string {
  return capabilityLabels[capability] ?? toTitleCase(capability)
}

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
  gap: 1,
  px: 2,
  py: 1.25,
}

function ProviderCapabilitiesEditor({
  capabilities,
  capabilityQuality,
  cadenceState,
  disabled,
  onCapabilityQuality,
  onCadenceState,
}: {
  capabilities: string[]
  capabilityQuality: Record<string, DataQuality>
  cadenceState: Record<string, CadenceFormState>
  disabled: boolean
  onCapabilityQuality: Dispatch<SetStateAction<Record<string, DataQuality>>>
  onCadenceState: Dispatch<SetStateAction<Record<string, CadenceFormState>>>
}) {
  if (capabilities.length === 0) return null
  return (
    <Box sx={{ px: 2, py: 2 }}>
      <SectionLabel label="Capabilities" />
      <Typography sx={{ ...appTypography.tableSecondary, mb: 1.5 }}>
        Quality and cadence are configured per feed.
      </Typography>
      <TableContainer component={Box} sx={{ border: "1px solid var(--app-divider)", borderRadius: 1, bgcolor: "var(--app-surface-inset)", overflow: "hidden" }}>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead sx={{ "& .MuiTableCell-root": appTypography.tableHeaderCell }}>
            <TableRow>
              <TableCell>Capability</TableCell>
              <TableCell sx={{ width: 260 }}>Quality</TableCell>
              <TableCell sx={{ width: 300 }}>Refresh cadence</TableCell>
              <TableCell sx={{ width: 300 }}>Save cadence</TableCell>
              <TableCell align="right" sx={{ width: 160 }}>Status</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {capabilities.map((capability) => {
              const state = cadenceState[capability]
              const active = state?.enabled ?? true
              const isQuotes = capability === "quotes"
              return (
                <TableRow key={capability}>
                  <TableCell>
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                      <CapabilityIcon capability={capability} />
                      <Typography sx={appTypography.tablePrimary}>{capabilityLabel(capability)}</Typography>
                    </Stack>
                  </TableCell>
                  <TableCell>
                    <TextField
                      select
                      size="small"
                      value={capabilityQuality[capability] ?? "unknown"}
                      disabled={disabled}
                      onChange={(event) => {
                        const quality = event.target.value as DataQuality
                        onCapabilityQuality((currentQuality) => ({ ...currentQuality, [capability]: quality }))
                      }}
                      fullWidth
                    >
                      {dataQualityOptions.map((quality) => <MenuItem key={quality} value={quality}>{toTitleCase(quality)}</MenuItem>)}
                    </TextField>
                  </TableCell>
                  <TableCell>
                    {state ? (
                      <DurationField
                        label="Every"
                        value={state.intervalValue}
                        unit={state.intervalUnit}
                        disabled={disabled}
                        onValue={(intervalValue) => onCadenceState((currentState) => ({ ...currentState, [capability]: { ...state, intervalValue } }))}
                        onUnit={(intervalUnit) => onCadenceState((currentState) => ({ ...currentState, [capability]: { ...state, intervalUnit } }))}
                      />
                    ) : (
                      <Typography sx={appTypography.tableMeta}>-</Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {state && isQuotes ? (
                      <DurationField
                        label="Save every"
                        value={state.resolutionValue}
                        unit={state.resolutionUnit}
                        disabled={disabled}
                        onValue={(resolutionValue) => onCadenceState((currentState) => ({ ...currentState, [capability]: { ...state, resolutionValue } }))}
                        onUnit={(resolutionUnit) => onCadenceState((currentState) => ({ ...currentState, [capability]: { ...state, resolutionUnit } }))}
                      />
                    ) : (
                      <Typography sx={appTypography.tableMeta}>-</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "flex-end" }}>
                      <Typography sx={{ ...appTypography.tableSecondary, color: active ? "var(--app-positive)" : "var(--app-text-faint)", fontWeight: 600 }}>
                        {active ? "Active" : "Disabled"}
                      </Typography>
                      {state ? (
                        <Switch
                          checked={state.enabled}
                          disabled={disabled}
                          onChange={(_, enabled) => onCadenceState((currentState) => ({ ...currentState, [capability]: { ...state, enabled } }))}
                          slotProps={{ input: { "aria-label": `${capability} refresh enabled` } }}
                        />
                      ) : null}
                    </Stack>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  )
}

function ProviderDetailSkeleton() {
  return (
    <Box sx={{ px: 2, py: 2 }}>
      <Skeleton animation="wave" variant="text" width={120} height={20} />
      <Skeleton animation="wave" variant="text" width={260} height={18} sx={{ mb: 1.5 }} />
      <Box sx={{ border: "1px solid var(--app-divider)", borderRadius: 1, bgcolor: "var(--app-surface-inset)", overflow: "hidden" }}>
        {Array.from({ length: 4 }, (_, index) => (
          <Stack
            key={index}
            direction="row"
            spacing={2}
            sx={{
              alignItems: "center",
              borderTop: index === 0 ? 0 : "1px solid var(--app-divider)",
              px: 1.5,
              py: 1.25,
            }}
          >
            <Skeleton animation="wave" variant="circular" width={28} height={28} />
            <Skeleton animation="wave" width="22%" />
            <Skeleton animation="wave" variant="rounded" width="18%" height={36} />
            <Skeleton animation="wave" variant="rounded" width="22%" height={36} />
            <Skeleton animation="wave" width="12%" sx={{ ml: "auto" }} />
          </Stack>
        ))}
      </Box>
    </Box>
  )
}

const durationUnitOptions = [
  { key: "sec", ms: 1000, label: "sec" },
  { key: "min", ms: 60_000, label: "min" },
  { key: "hour", ms: 3_600_000, label: "hour" },
  { key: "day", ms: 86_400_000, label: "day" },
] as const

type DurationUnit = (typeof durationUnitOptions)[number]["key"]

interface CadenceFormState {
  intervalValue: number
  intervalUnit: DurationUnit
  resolutionValue: number
  resolutionUnit: DurationUnit
  enabled: boolean
}

interface ProviderFormSnapshot {
  dataQuality: DataQuality
  capabilityQuality: Record<string, DataQuality>
  maxConcurrency: number
  maxBatchSize: number | ""
  rateLimitPerMin: number | ""
  cadenceState: Record<string, CadenceFormState>
}

function buildProviderFormSnapshot(provider: ProviderSettingsView, cadence: CapabilityRefreshView[]): ProviderFormSnapshot {
  return {
    dataQuality: provider.dataQuality,
    capabilityQuality: normalizeCapabilityQuality(provider.capabilityQuality),
    maxConcurrency: provider.maxConcurrency,
    maxBatchSize: provider.maxBatchSize ?? "",
    rateLimitPerMin: provider.rateLimitPerMin ?? "",
    cadenceState: buildCadenceFormState(cadence),
  }
}

function providerFormSnapshotsEqual(firstSnapshot: ProviderFormSnapshot, secondSnapshot: ProviderFormSnapshot): boolean {
  if (
    firstSnapshot.dataQuality !== secondSnapshot.dataQuality ||
    !recordEqual(firstSnapshot.capabilityQuality, secondSnapshot.capabilityQuality) ||
    firstSnapshot.maxConcurrency !== secondSnapshot.maxConcurrency ||
    firstSnapshot.maxBatchSize !== secondSnapshot.maxBatchSize ||
    firstSnapshot.rateLimitPerMin !== secondSnapshot.rateLimitPerMin
  ) {
    return false
  }

  const firstCapabilities = Object.keys(firstSnapshot.cadenceState).sort()
  const secondCapabilities = Object.keys(secondSnapshot.cadenceState).sort()
  if (firstCapabilities.join("|") !== secondCapabilities.join("|")) return false

  return firstCapabilities.every((capability) => {
    const firstCadence = firstSnapshot.cadenceState[capability]
    const secondCadence = secondSnapshot.cadenceState[capability]
    return (
      firstCadence.enabled === secondCadence.enabled &&
      firstCadence.intervalValue === secondCadence.intervalValue &&
      firstCadence.intervalUnit === secondCadence.intervalUnit &&
      firstCadence.resolutionValue === secondCadence.resolutionValue &&
      firstCadence.resolutionUnit === secondCadence.resolutionUnit
    )
  })
}

function buildCadenceFormState(cadence: CapabilityRefreshView[]): Record<string, CadenceFormState> {
  return Object.fromEntries(cadence.map((capabilityRefreshSetting) => {
    const interval = splitDuration(capabilityRefreshSetting.refreshIntervalMs)
    const resolution = capabilityRefreshSetting.saveResolutionMs === null ? { value: 1, unit: "min" as DurationUnit } : splitDuration(capabilityRefreshSetting.saveResolutionMs)
    return [
      capabilityRefreshSetting.capability,
      {
        intervalValue: interval.value,
        intervalUnit: interval.unit,
        resolutionValue: resolution.value,
        resolutionUnit: resolution.unit,
        enabled: capabilityRefreshSetting.enabled,
      },
    ]
  }))
}

function normalizeCapabilityQuality(capabilityQuality: ProviderSettingsView["capabilityQuality"]): Record<string, DataQuality> {
  return Object.fromEntries(Object.entries(capabilityQuality).filter((entry): entry is [string, DataQuality] => Boolean(entry[1])))
}

function recordEqual(firstRecord: Record<string, string>, secondRecord: Record<string, string>): boolean {
  const firstKeys = Object.keys(firstRecord).sort()
  const secondKeys = Object.keys(secondRecord).sort()
  if (firstKeys.join("|") !== secondKeys.join("|")) return false
  return firstKeys.every((key) => firstRecord[key] === secondRecord[key])
}

function DurationField({
  label,
  value,
  unit,
  disabled,
  onValue,
  onUnit,
}: {
  label: string
  value: number
  unit: DurationUnit
  disabled?: boolean
  onValue: (value: number) => void
  onUnit: (unit: DurationUnit) => void
}) {
  return (
    <Stack direction="row" spacing={0.75} sx={{ alignItems: "flex-end" }}>
      <TextField
        label={label}
        type="number"
        size="small"
        value={value}
        onChange={(event) => onValue(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
        disabled={disabled}
        slotProps={{ htmlInput: { min: 1 } }}
        sx={{ width: 110 }}
      />
      <TextField select label="Unit" size="small" value={unit} disabled={disabled} onChange={(event) => onUnit(event.target.value as DurationUnit)} sx={{ width: 110 }}>
        {durationUnitOptions.map((durationUnitOption) => <MenuItem key={durationUnitOption.key} value={durationUnitOption.key}>{durationUnitOption.label}</MenuItem>)}
      </TextField>
    </Stack>
  )
}

function splitDuration(ms: number): { value: number; unit: DurationUnit } {
  for (const durationUnitOption of [...durationUnitOptions].reverse()) {
    if (ms >= durationUnitOption.ms && ms % durationUnitOption.ms === 0) return { value: ms / durationUnitOption.ms, unit: durationUnitOption.key }
  }
  return { value: Math.max(1, Math.round(ms / 1000)), unit: "sec" }
}

function toMs(value: number, unit: DurationUnit): number {
  const durationUnitOption = durationUnitOptions.find((candidateUnit) => candidateUnit.key === unit) ?? durationUnitOptions[0]
  return Math.max(1, value) * durationUnitOption.ms
}

function NumberField({
  label,
  value,
  onValue,
  placeholder,
  disabled,
}: {
  label: string
  value: number | ""
  onValue: (value: number | "") => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <TextField
      label={label}
      type="number"
      size="small"
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(event) => {
        const rawValue = event.target.value
        onValue(rawValue === "" ? "" : Math.max(1, Number.parseInt(rawValue, 10) || 1))
      }}
      slotProps={{ htmlInput: { min: 1 } }}
      fullWidth
    />
  )
}

function QualityChip({ quality, label }: { quality: DataQuality; label?: string }) {
  const tone = quality === "high" ? "positive" : quality === "medium" ? "warning" : quality === "low" ? "negative" : "neutral"
  return <StatusChip label={label ? `${toTitleCase(label)}: ${toTitleCase(quality)}` : toTitleCase(quality)} tone={tone} />
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function StatusChip({ label, tone }: { label: string; tone: "positive" | "warning" | "negative" | "neutral" }) {
  return (
    <AppBadge
      label={label}
      kind="status"
      tone={tone === "positive" ? "success" : tone === "warning" ? "warning" : tone === "negative" ? "danger" : "neutral"}
    />
  )
}

function emptyNumberToNull(value: number | ""): number | null {
  return value === "" ? null : value
}

function CapabilityIcon({ capability }: { capability: string }) {
  const icon = capabilityIconMap[capability] ?? { label: capability.slice(0, 1).toUpperCase(), tone: "accent" }
  const color = capabilityToneColor[icon.tone]
  return (
    <Box
      aria-hidden
      sx={{
        alignItems: "center",
        bgcolor: `color-mix(in srgb, ${color} 18%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 24%, var(--app-border))`,
        borderRadius: 1.25,
        color,
        display: "inline-flex",
        flexShrink: 0,
        fontSize: 11,
        fontWeight: 800,
        height: 28,
        justifyContent: "center",
        width: 28,
      }}
    >
      {icon.label}
    </Box>
  )
}

type CapabilityTone = "accent" | "positive" | "warning" | "muted"

const capabilityToneColor: Record<CapabilityTone, string> = {
  accent: "var(--app-accent)",
  muted: "var(--app-text-muted)",
  positive: "var(--app-positive)",
  warning: "var(--app-warning)",
}

const capabilityIconMap: Record<string, { label: string; tone: CapabilityTone }> = {
  analyst: { label: "A", tone: "accent" },
  earnings: { label: "E", tone: "accent" },
  corporate_actions: { label: "C", tone: "accent" },
  news: { label: "N", tone: "accent" },
  fundamentals: { label: "F", tone: "positive" },
  quotes: { label: "Q", tone: "warning" },
  chart: { label: "C", tone: "warning" },
  fx: { label: "FX", tone: "muted" },
  symbol_search: { label: "S", tone: "muted" },
}
