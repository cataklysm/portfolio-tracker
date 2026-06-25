"use client"

import { useMemo, useState, useTransition } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import {
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Divider,
  IconButton,
  InputAdornment,
  Stack,
  Switch,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material"
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions"
import { deleteRuleAction, toggleRuleAction } from "@/app/notifications/settings/actions"
import { ControlBar, type ControlBarFilterBadge } from "@/design/components/ControlBar"
import { AppIcon } from "@/design/icons/AppIcon"
import { PageMetricGrid, PageShell } from "@/application/shell/PageShell"
import { useToast } from "@/application/toast/ToastProvider"
import { repeatLabel } from "@/features/notifications/repeat"
import type { AlertRule, AlertRuleKind, ListingSummary, NotificationInbox, NotificationItem, PositionView } from "@/lib/types"

type NotificationTab = "all" | "unread" | "price_moves" | "thresholds" | "earnings"
type DateRange = "7d" | "30d" | "all"

interface NotificationsWorkspaceProps {
  inbox: NotificationInbox
  locale: string
  positions: PositionView[]
  rules: AlertRule[]
}

interface AssetContext extends ListingSummary {
  listing_id: string
  position_id: string
  state: PositionView["state"]
  performance: PositionView["performance"]
}

const notificationTabs: Array<{ value: NotificationTab; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "price_moves", label: "Price moves" },
  { value: "thresholds", label: "Thresholds" },
  { value: "earnings", label: "Earnings" },
]

const dateRangeOptions = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "all", label: "All time" },
] as const

const typeLabels: Record<NotificationItem["type"], string> = {
  cost_basis_move: "Cost basis",
  daily_move: "Price move",
  earnings_upcoming: "Earnings",
  price_threshold: "Price threshold",
  target_zone: "Target zone",
}

const ruleKindLabels: Record<AlertRuleKind, string> = {
  cost_basis_move: "Cost basis",
  daily_move: "Daily move",
  earnings_lead: "Earnings reminder",
  price_threshold: "Price threshold",
  target_zone: "Target zone",
}

const severityLabels: Record<NotificationItem["severity"], string> = {
  critical: "High",
  warning: "Medium",
  info: "Info",
}

const typeColors: Record<NotificationItem["type"], "primary" | "success" | "warning" | "secondary"> = {
  cost_basis_move: "success",
  daily_move: "success",
  earnings_upcoming: "primary",
  price_threshold: "warning",
  target_zone: "secondary",
}

export function NotificationsWorkspace({ inbox, locale, positions, rules }: NotificationsWorkspaceProps) {
  const router = useRouter()
  const { success, error } = useToast()
  const [tab, setTab] = useState<NotificationTab>("all")
  const [searchTerm, setSearchTerm] = useState("")
  const [range, setRange] = useState<DateRange>("30d")
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [selectedTypes, setSelectedTypes] = useState<Set<NotificationItem["type"]>>(new Set())
  const [selectedSeverities, setSelectedSeverities] = useState<Set<NotificationItem["severity"]>>(new Set())
  const [ruleStatuses, setRuleStatuses] = useState<Set<"active" | "disabled">>(new Set())
  const [assetQuery, setAssetQuery] = useState("")
  const [selectedId, setSelectedId] = useState(inbox.notifications[0]?.id ?? null)
  const [pending, startTransition] = useTransition()

  const assets = useMemo(() => positions.flatMap((position): AssetContext[] => {
    if (!position.listing) return []
    return [{ ...position.listing, listing_id: position.listing_id, position_id: position.id, state: position.state, performance: position.performance }]
  }), [positions])

  const assetByListing = useMemo(() => new Map(assets.map((asset) => [asset.listing_id, asset])), [assets])
  const assetByInstrument = useMemo(() => new Map(assets.map((asset) => [asset.instrument_id, asset])), [assets])
  const notificationAssets = useMemo(() => new Map(inbox.notifications.map((item) => {
    const asset = resolveAsset(item, assetByListing, assetByInstrument)
    return [item.id, asset]
  })), [assetByInstrument, assetByListing, inbox.notifications])

  const criteria = { assetIds: selectedAssetIds, range, ruleStatuses, searchTerm, severities: selectedSeverities, tab, types: selectedTypes }
  const filteredNotifications = useMemo(() => inbox.notifications.filter((item) => matchesNotification(item, notificationAssets.get(item.id), criteria, rules)), [criteria, inbox.notifications, notificationAssets, rules])
  const selected = filteredNotifications.find((item) => item.id === selectedId) ?? filteredNotifications[0] ?? inbox.notifications.find((item) => item.id === selectedId) ?? inbox.notifications[0] ?? null
  const selectedAsset = selected ? notificationAssets.get(selected.id) ?? null : null
  const selectedRules = useMemo(() => selectedAsset ? rulesForAsset(rules, selectedAsset) : [], [rules, selectedAsset])
  const triggeredRule = selected && selectedAsset ? findTriggeredRule(selected, selectedAsset, selectedRules) : null

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const triggeredToday = inbox.notifications.filter((item) => item.created_at.slice(0, 10) === today).length
    const activeRules = rules.filter((rule) => rule.enabled).length
    const disabledRules = rules.filter((rule) => !rule.enabled).length
    return {
      activeRules,
      disabledRules,
      total: inbox.notifications.length,
      triggeredToday,
      unread: inbox.unread_count,
    }
  }, [inbox, rules])

  const typeCounts = useMemo(() => countBy(inbox.notifications, (item) => item.type), [inbox.notifications])
  const severityCounts = useMemo(() => countBy(inbox.notifications, (item) => item.severity), [inbox.notifications])
  const assetCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const notification of inbox.notifications) {
      const asset = notificationAssets.get(notification.id)
      if (!asset) continue
      counts.set(asset.instrument_id, (counts.get(asset.instrument_id) ?? 0) + 1)
    }
    return counts
  }, [inbox.notifications, notificationAssets])
  const ruleStatusCounts = useMemo(() => {
    const counts = new Map<"active" | "disabled", number>([["active", 0], ["disabled", 0]])
    for (const notification of inbox.notifications) {
      const asset = notificationAssets.get(notification.id)
      if (!asset) continue
      const relatedRules = rulesForAsset(rules, asset)
      if (relatedRules.some((rule) => rule.enabled)) counts.set("active", (counts.get("active") ?? 0) + 1)
      if (relatedRules.some((rule) => !rule.enabled)) counts.set("disabled", (counts.get("disabled") ?? 0) + 1)
    }
    return counts
  }, [inbox.notifications, notificationAssets, rules])

  const controlBadges = useMemo<ControlBarFilterBadge[]>(() => [
    ...[...selectedTypes].map((type) => ({
      id: `type-${type}`,
      label: "Type",
      value: typeLabels[type],
      onClear: () => setSelectedTypes((current) => removeSetValue(current, type)),
    })),
    ...[...selectedAssetIds].map((assetId) => ({
      id: `asset-${assetId}`,
      label: "Asset",
      value: assetByInstrument.get(assetId)?.name ?? assetId,
      onClear: () => setSelectedAssetIds((current) => removeSetValue(current, assetId)),
    })),
    ...[...ruleStatuses].map((status) => ({
      id: `rule-status-${status}`,
      label: "Rule status",
      value: status === "active" ? "Active" : "Disabled",
      onClear: () => setRuleStatuses((current) => removeSetValue(current, status)),
    })),
    ...[...selectedSeverities].map((severity) => ({
      id: `severity-${severity}`,
      label: "Severity",
      value: severityLabels[severity],
      onClear: () => setSelectedSeverities((current) => removeSetValue(current, severity)),
    })),
  ], [assetByInstrument, ruleStatuses, selectedAssetIds, selectedSeverities, selectedTypes])

  const visibleAssets = assets
    .filter((asset) => (assetCounts.get(asset.instrument_id) ?? 0) > 0)
    .filter((asset) => {
      const needle = assetQuery.trim().toLowerCase()
      return !needle || asset.name.toLowerCase().includes(needle) || asset.symbol.toLowerCase().includes(needle)
    })
    .sort((a, b) => (assetCounts.get(b.instrument_id) ?? 0) - (assetCounts.get(a.instrument_id) ?? 0) || a.name.localeCompare(b.name))
    .slice(0, 10)

  function toggleSetValue<T>(setter: (next: Set<T>) => void, current: Set<T>, value: T) {
    const next = new Set(current)
    if (next.has(value)) next.delete(value)
    else next.add(value)
    setter(next)
  }

  function clearFilters() {
    setSelectedAssetIds(new Set())
    setSelectedTypes(new Set())
    setSelectedSeverities(new Set())
    setRuleStatuses(new Set())
    setSearchTerm("")
    setAssetQuery("")
    setRange("30d")
    setTab("all")
  }

  function markRead(id: string) {
    startTransition(async () => {
      const result = await markNotificationReadAction(id)
      if (result?.error) error(result.error)
      else {
        success("Notification marked as read.")
        router.refresh()
      }
    })
  }

  function markAllRead() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction()
      if (result?.error) error(result.error)
      else {
        success("Notifications marked as read.")
        router.refresh()
      }
    })
  }

  function toggleRule(rule: AlertRule) {
    startTransition(async () => {
      const result = await toggleRuleAction(rule.id, !rule.enabled)
      if (result?.error) error(result.error)
      else {
        success(rule.enabled ? "Rule disabled." : "Rule enabled.")
        router.refresh()
      }
    })
  }

  function deleteRule(rule: AlertRule) {
    if (!confirm(`Delete rule "${rule.label ?? describeRule(rule)}"?`)) return
    startTransition(async () => {
      const result = await deleteRuleAction(rule.id)
      if (result?.error) error(result.error)
      else {
        success("Rule deleted.")
        router.refresh()
      }
    })
  }

  return (
    <PageShell kind="workspace">
      <Stack spacing={0.5}>
        <Typography sx={{ color: "var(--app-text-muted)", fontSize: 13, fontWeight: 700 }}>
          Portfolio <Box component="span" sx={{ color: "var(--app-text-faint)", mx: 1 }}>/</Box>
          <Box component="span" sx={{ color: "var(--app-text)" }}>Notifications</Box>
        </Typography>
      </Stack>

      <PageMetricGrid columns={{ xs: "1fr", md: "repeat(2, minmax(0, 1fr))", lg: "repeat(4, minmax(0, 1fr))" }}>
        <MetricCard label="Unread" value={metrics.unread} detail={`of ${metrics.total} total`} tone="primary" />
        <MetricCard label="Active rules" value={metrics.activeRules} detail={`across ${assets.length} assets`} tone="success" />
        <MetricCard label="Triggered today" value={metrics.triggeredToday} detail="new alerts today" tone="warning" />
        <MetricCard label="Disabled rules" value={metrics.disabledRules} detail="waiting for reactivation" tone="purple" />
      </PageMetricGrid>

      <ControlBar
        addHref="/notifications/settings"
        addLabel="Add rule"
        badges={controlBadges}
        defaultPeriodValue="30d"
        defaultTabValue="all"
        onClearFilters={clearFilters}
        onPeriodChange={setRange}
        onReload={() => router.refresh()}
        onSearchChange={setSearchTerm}
        onTabChange={setTab}
        periodLabel="Range"
        periodOptions={dateRangeOptions}
        periodValue={range}
        reloadLabel="Reload notifications"
        searchPlaceholder="Search alerts, assets, or rules"
        searchValue={searchTerm}
        tabs={notificationTabs.map((option) => ({
          ...option,
          count: option.value === "all" ? undefined : statusCount(option.value, metrics, inbox.notifications),
        }))}
        tabValue={tab}
      />

      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", xl: "280px minmax(760px, 1fr) 480px" }, minHeight: 0 }}>
        <FilterRail
          assetCounts={assetCounts}
          assetQuery={assetQuery}
          onAssetQuery={setAssetQuery}
          onClear={clearFilters}
          onSeverity={(value) => toggleSetValue(setSelectedSeverities, selectedSeverities, value)}
          onStatus={(value) => toggleSetValue(setRuleStatuses, ruleStatuses, value)}
          onType={(value) => toggleSetValue(setSelectedTypes, selectedTypes, value)}
          onAsset={(value) => toggleSetValue(setSelectedAssetIds, selectedAssetIds, value)}
          ruleStatuses={ruleStatuses}
          ruleStatusCounts={ruleStatusCounts}
          selectedAssetIds={selectedAssetIds}
          selectedSeverities={selectedSeverities}
          selectedTypes={selectedTypes}
          severityCounts={severityCounts}
          typeCounts={typeCounts}
          visibleAssets={visibleAssets}
        />
        <NotificationsInbox
          items={filteredNotifications}
          locale={locale}
          notificationAssets={notificationAssets}
          onClearFilters={clearFilters}
          onMarkAllRead={markAllRead}
          onMarkRead={markRead}
          onSelect={(item) => setSelectedId(item.id)}
          pending={pending}
          selectedId={selected?.id ?? null}
        />
        <NotificationDetails
          asset={selectedAsset}
          locale={locale}
          notification={selected}
          onDeleteRule={deleteRule}
          onToggleRule={toggleRule}
          pending={pending}
          rules={selectedRules}
          triggeredRule={triggeredRule}
        />
      </Box>
    </PageShell>
  )
}

function MetricCard({ detail, label, tone, value }: { detail: string; label: string; tone: "primary" | "success" | "warning" | "purple"; value: number }) {
  const toneColor = tone === "primary" ? "var(--app-accent)" : tone === "success" ? "var(--app-positive)" : tone === "warning" ? "var(--app-warning)" : "#9b7cff"
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)", p: 2 }}>
      <Stack direction="row" spacing={2} sx={{ alignItems: "center", height: "100%" }}>
        <Box sx={{ alignItems: "center", bgcolor: `color-mix(in srgb, ${toneColor} 18%, transparent)`, borderRadius: 2, color: toneColor, display: "flex", fontSize: 18, fontWeight: 900, height: 48, justifyContent: "center", width: 48 }}>
          {label.slice(0, 1)}
        </Box>
        <Box>
          <Typography sx={{ color: "var(--app-text-muted)", fontSize: 13, fontWeight: 700 }}>{label}</Typography>
          <Typography sx={{ color: "var(--app-text)", fontSize: 28, fontWeight: 900, lineHeight: 1 }}>{value}</Typography>
          <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12, mt: 0.5 }}>{detail}</Typography>
        </Box>
      </Stack>
    </Card>
  )
}

function FilterRail(props: {
  assetCounts: Map<string, number>
  assetQuery: string
  onAsset: (value: string) => void
  onAssetQuery: (value: string) => void
  onClear: () => void
  onSeverity: (value: NotificationItem["severity"]) => void
  onStatus: (value: "active" | "disabled") => void
  onType: (value: NotificationItem["type"]) => void
  ruleStatuses: Set<"active" | "disabled">
  ruleStatusCounts: Map<"active" | "disabled", number>
  selectedAssetIds: Set<string>
  selectedSeverities: Set<NotificationItem["severity"]>
  selectedTypes: Set<NotificationItem["type"]>
  severityCounts: Map<NotificationItem["severity"], number>
  typeCounts: Map<NotificationItem["type"], number>
  visibleAssets: AssetContext[]
}) {
  return (
    <Card variant="outlined" sx={{ alignSelf: "start", borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 800 }}>Filters</Typography>
        <Button size="small" onClick={props.onClear}>Clear all</Button>
      </Stack>
      <FilterSection title="Type">
        {(Object.keys(typeLabels) as NotificationItem["type"][]).map((type) => (
          <FacetRow key={type} checked={props.selectedTypes.has(type)} count={props.typeCounts.get(type) ?? 0} label={typeLabels[type]} onChange={() => props.onType(type)} />
        ))}
      </FilterSection>
      <FilterSection title="Asset">
        <TextField
          variant="standard"
          value={props.assetQuery}
          onChange={(event) => props.onAssetQuery(event.target.value)}
          placeholder="Search assets..."
          sx={{ mb: 1.25, width: "100%", "& input": { fontSize: 12, py: 0.5 } }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon small /></InputAdornment> } }}
        />
        {props.visibleAssets.map((asset) => (
          <FacetRow key={asset.instrument_id} checked={props.selectedAssetIds.has(asset.instrument_id)} count={props.assetCounts.get(asset.instrument_id) ?? 0} label={asset.name} onChange={() => props.onAsset(asset.instrument_id)} />
        ))}
      </FilterSection>
      <FilterSection title="Rule status">
        <FacetRow checked={props.ruleStatuses.has("active")} count={props.ruleStatusCounts.get("active") ?? 0} label="Active" onChange={() => props.onStatus("active")} />
        <FacetRow checked={props.ruleStatuses.has("disabled")} count={props.ruleStatusCounts.get("disabled") ?? 0} label="Disabled" onChange={() => props.onStatus("disabled")} />
      </FilterSection>
      <FilterSection title="Severity">
        {(Object.keys(severityLabels) as NotificationItem["severity"][]).map((severity) => (
          <FacetRow key={severity} checked={props.selectedSeverities.has(severity)} count={props.severityCounts.get(severity) ?? 0} label={severityLabels[severity]} onChange={() => props.onSeverity(severity)} />
        ))}
      </FilterSection>
    </Card>
  )
}

function FilterSection({ children, title }: { children: React.ReactNode; title: string }) {
  return (
    <Box sx={{ borderBottom: "1px solid var(--app-border)", px: 2, py: 1.75, "&:last-of-type": { borderBottom: 0 } }}>
      <Typography sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 900, mb: 1 }}>{title}</Typography>
      <Stack spacing={0.75}>{children}</Stack>
    </Box>
  )
}

function FacetRow({ checked, count, label, onChange }: { checked: boolean; count: number; label: string; onChange: () => void }) {
  return (
    <Stack component="label" direction="row" spacing={1} sx={{ alignItems: "center", cursor: "pointer", minWidth: 0 }}>
      <Checkbox checked={checked} onChange={onChange} size="small" sx={{ color: "var(--app-text-muted)", p: 0 }} />
      <Typography noWrap sx={{ color: "var(--app-text-muted)", flex: 1, fontSize: 12 }}>{label}</Typography>
      <Chip label={count} size="small" variant="outlined" sx={{ color: "var(--app-text-muted)", height: 22, minWidth: 28 }} />
    </Stack>
  )
}

function NotificationsInbox({
  items,
  locale,
  notificationAssets,
  onClearFilters,
  onMarkAllRead,
  onMarkRead,
  onSelect,
  pending,
  selectedId,
}: {
  items: NotificationItem[]
  locale: string
  notificationAssets: Map<string, AssetContext | undefined>
  onClearFilters: () => void
  onMarkAllRead: () => void
  onMarkRead: (id: string) => void
  onSelect: (item: NotificationItem) => void
  pending: boolean
  selectedId: string | null
}) {
  return (
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Stack direction="row" spacing={1} sx={{ alignItems: "baseline" }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 900 }}>Notification inbox</Typography>
          <Typography sx={{ color: "var(--app-text-faint)", fontSize: 11 }}>{items.length} alerts</Typography>
        </Stack>
        <Button size="small" disabled={pending} onClick={onMarkAllRead}>Mark all read</Button>
      </Stack>
      <Box sx={{ display: "grid", gridTemplateColumns: "minmax(210px, 1.4fr) 150px minmax(210px, 1.2fr) 92px 92px 96px", px: 2, py: 1, borderBottom: "1px solid var(--app-border)" }}>
        {["Type", "Asset", "Alert", "Time", "Value", ""].map((heading) => (
          <Typography key={heading} sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 800 }}>{heading}</Typography>
        ))}
      </Box>
      {items.length === 0 ? (
        <Stack spacing={1.5} sx={{ alignItems: "center", minHeight: 320, justifyContent: "center", px: 2 }}>
          <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 900 }}>No notifications match these filters</Typography>
          <Button onClick={onClearFilters}>Clear filters</Button>
        </Stack>
      ) : (
        <Box>
          {groupNotifications(items).map((group) => (
            <Box key={group.label}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center", bgcolor: "color-mix(in srgb, var(--app-surface-raised) 84%, var(--app-accent) 16%)", borderBottom: "1px solid var(--app-border)", px: 2, py: 1 }}>
                <Typography sx={{ color: "var(--app-text)", fontSize: 13, fontWeight: 900 }}>{group.label}</Typography>
                <Chip label={group.items.length} size="small" variant="outlined" color="primary" sx={{ height: 22 }} />
              </Stack>
              {group.items.map((item) => (
                <NotificationRow
                  key={item.id}
                  asset={notificationAssets.get(item.id)}
                  item={item}
                  locale={locale}
                  onMarkRead={onMarkRead}
                  onSelect={() => onSelect(item)}
                  pending={pending}
                  selected={item.id === selectedId}
                />
              ))}
            </Box>
          ))}
        </Box>
      )}
    </Card>
  )
}

function NotificationRow({ asset, item, locale, onMarkRead, onSelect, pending, selected }: { asset: AssetContext | undefined; item: NotificationItem; locale: string; onMarkRead: (id: string) => void; onSelect: () => void; pending: boolean; selected: boolean }) {
  const unread = item.read_at === null
  return (
    <Box
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect() }}
      sx={{
        bgcolor: selected ? "color-mix(in srgb, var(--app-accent) 20%, transparent)" : "transparent",
        borderBottom: "1px solid var(--app-border)",
        cursor: "pointer",
        display: "grid",
        gridTemplateColumns: "minmax(210px, 1.4fr) 150px minmax(210px, 1.2fr) 92px 92px 96px",
        px: 2,
        py: 1.25,
        transition: "background 120ms ease",
        "&:hover": { bgcolor: selected ? "color-mix(in srgb, var(--app-accent) 24%, transparent)" : "var(--app-surface-hover)" },
      }}
    >
      <Stack direction="row" spacing={1} sx={{ alignItems: "center", minWidth: 0 }}>
        <Box sx={{ bgcolor: unread ? "var(--app-accent)" : "var(--app-border)", borderRadius: "50%", height: 8, width: 8 }} />
        <Chip label={typeLabels[item.type]} color={typeColors[item.type]} size="small" variant="outlined" sx={{ fontWeight: 800 }} />
      </Stack>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800 }}>{asset?.symbol ?? "Global"}</Typography>
        <Typography noWrap sx={{ color: "var(--app-text-faint)", fontSize: 10 }}>{asset?.name ?? "All holdings"}</Typography>
      </Box>
      <Box sx={{ minWidth: 0 }}>
        <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 12, fontWeight: 800 }}>{item.title}</Typography>
        {item.body ? <Typography noWrap sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{item.body}</Typography> : null}
      </Box>
      <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{formatTime(item.created_at, locale)}</Typography>
      <Typography sx={{ color: valueTone(item) === "negative" ? "var(--app-negative)" : valueTone(item) === "positive" ? "var(--app-positive)" : "var(--app-text-muted)", fontSize: 12, fontWeight: 800 }}>
        {formatNotificationValue(item, asset, locale)}
      </Typography>
      <Stack direction="row" spacing={0.5} sx={{ justifyContent: "flex-end" }}>
        {unread ? (
          <Tooltip title="Mark read">
            <IconButton size="small" disabled={pending} onClick={(event) => { event.stopPropagation(); onMarkRead(item.id) }}>
              <MailIcon />
            </IconButton>
          </Tooltip>
        ) : null}
        {asset ? (
          <Tooltip title="Open asset">
            <IconButton component={Link} href={`/positions/${asset.position_id}`} size="small" onClick={(event) => event.stopPropagation()}>
              <OpenIcon />
            </IconButton>
          </Tooltip>
        ) : null}
      </Stack>
    </Box>
  )
}

function NotificationDetails({ asset, locale, notification, onDeleteRule, onToggleRule, pending, rules, triggeredRule }: { asset: AssetContext | null; locale: string; notification: NotificationItem | null; onDeleteRule: (rule: AlertRule) => void; onToggleRule: (rule: AlertRule) => void; pending: boolean; rules: AlertRule[]; triggeredRule: AlertRule | null }) {
  return (
    <Card variant="outlined" sx={{ alignSelf: "start", borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)", overflow: "hidden" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 2, py: 1.5 }}>
        <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 900 }}>Asset rules</Typography>
        <Stack direction="row" spacing={0.75}>
          <IconButton size="small" component={Link} href="/notifications/settings"><OpenIcon /></IconButton>
        </Stack>
      </Stack>
      {!notification ? (
        <Typography sx={{ color: "var(--app-text-faint)", p: 3, textAlign: "center" }}>Select a notification to inspect its rule context.</Typography>
      ) : (
        <Stack spacing={2} sx={{ p: 2 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Box sx={{ alignItems: "center", bgcolor: "var(--app-accent-soft)", borderRadius: "50%", color: "var(--app-accent)", display: "flex", fontSize: 12, fontWeight: 900, height: 48, justifyContent: "center", width: 48 }}>
              {(asset?.symbol ?? "PT").slice(0, 3)}
            </Box>
            <Box sx={{ minWidth: 0 }}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 16, fontWeight: 900 }}>{asset ? `${asset.symbol} · ${asset.name}` : "All holdings"}</Typography>
                {asset ? <Chip label={asset.asset_type} size="small" variant="outlined" /> : null}
              </Stack>
              <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>
                {asset ? `${money(asset.performance.current_price, locale, asset.currency)}${pct(asset.performance.daily_change_pct)}` : "Global notification"}
              </Typography>
            </Box>
          </Stack>

          <Card variant="outlined" sx={{ borderColor: "color-mix(in srgb, var(--app-positive) 40%, var(--app-border))", bgcolor: "color-mix(in srgb, var(--app-positive) 10%, transparent)", p: 1.5 }}>
            <Stack spacing={1}>
              <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                <Chip label={typeLabels[notification.type]} color={typeColors[notification.type]} size="small" variant="outlined" sx={{ fontWeight: 800 }} />
                <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12 }}>{formatDateTime(notification.created_at, locale)}</Typography>
              </Stack>
              <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 900 }}>{notification.title}</Typography>
              {notification.body ? <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>{notification.body}</Typography> : null}
              {triggeredRule ? (
                <Typography sx={{ color: "var(--app-text-muted)", fontSize: 12 }}>Triggered rule: <Box component="span" sx={{ color: "var(--app-text)", fontWeight: 800 }}>{triggeredRule.label ?? describeRule(triggeredRule)}</Box></Typography>
              ) : null}
            </Stack>
          </Card>

          <Divider sx={{ borderColor: "var(--app-border)" }} />
          <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography sx={{ color: "var(--app-text)", fontSize: 14, fontWeight: 900 }}>Rules for this asset</Typography>
            <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12 }}>{rules.length} rules</Typography>
          </Stack>
          {rules.length === 0 ? (
            <Typography sx={{ color: "var(--app-text-faint)", fontSize: 12 }}>No rules are configured for this asset.</Typography>
          ) : (
            <Stack spacing={1}>
              {rules.map((rule) => (
                <RuleCard key={rule.id} pending={pending} rule={rule} triggered={rule.id === triggeredRule?.id} onDelete={() => onDeleteRule(rule)} onToggle={() => onToggleRule(rule)} />
              ))}
            </Stack>
          )}
          <Button component={Link} href="/notifications/settings" variant="outlined" fullWidth>
            Add rule{asset ? ` for ${asset.symbol}` : ""}
          </Button>
        </Stack>
      )}
    </Card>
  )
}

function RuleCard({ onDelete, onToggle, pending, rule, triggered }: { onDelete: () => void; onToggle: () => void; pending: boolean; rule: AlertRule; triggered: boolean }) {
  return (
    <Card variant="outlined" sx={{ borderColor: triggered ? "color-mix(in srgb, var(--app-accent) 60%, var(--app-border))" : "var(--app-border)", bgcolor: "var(--app-bg-muted)", p: 1.25 }}>
      <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
        <Switch checked={rule.enabled} disabled={pending} onChange={onToggle} size="small" />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography noWrap sx={{ color: "var(--app-text)", fontSize: 13, fontWeight: 900 }}>{rule.label ?? ruleKindLabels[rule.kind]}</Typography>
            <Chip label={rule.enabled ? "Active" : triggered ? "Triggered" : "Disabled"} color={rule.enabled ? "success" : triggered ? "primary" : "default"} size="small" variant="outlined" />
            <Chip label={repeatLabel(rule)} size="small" variant="outlined" sx={{ borderColor: "var(--app-border)", color: "var(--app-text-muted)" }} />
          </Stack>
          <Typography noWrap sx={{ color: "var(--app-text-muted)", fontSize: 11 }}>{describeRule(rule)}</Typography>
        </Box>
        <Tooltip title="Delete rule">
          <IconButton disabled={pending} size="small" onClick={onDelete}><TrashIcon /></IconButton>
        </Tooltip>
      </Stack>
    </Card>
  )
}

function statusCount(tab: NotificationTab, metrics: { unread: number }, notifications: NotificationItem[]): number {
  if (tab === "unread") return metrics.unread
  if (tab === "price_moves") return notifications.filter((item) => item.type === "daily_move" || item.type === "cost_basis_move").length
  if (tab === "thresholds") return notifications.filter((item) => item.type === "price_threshold" || item.type === "target_zone").length
  if (tab === "earnings") return notifications.filter((item) => item.type === "earnings_upcoming").length
  return notifications.length
}

function matchesNotification(item: NotificationItem, asset: AssetContext | undefined, criteria: { assetIds: Set<string>; range: DateRange; ruleStatuses: Set<"active" | "disabled">; searchTerm: string; severities: Set<NotificationItem["severity"]>; tab: NotificationTab; types: Set<NotificationItem["type"]> }, rules: AlertRule[]): boolean {
  if (criteria.tab === "unread" && item.read_at !== null) return false
  if (criteria.tab === "price_moves" && item.type !== "daily_move" && item.type !== "cost_basis_move") return false
  if (criteria.tab === "thresholds" && item.type !== "price_threshold" && item.type !== "target_zone") return false
  if (criteria.tab === "earnings" && item.type !== "earnings_upcoming") return false
  if (criteria.types.size > 0 && !criteria.types.has(item.type)) return false
  if (criteria.severities.size > 0 && !criteria.severities.has(item.severity)) return false
  if (criteria.assetIds.size > 0 && (!asset || !criteria.assetIds.has(asset.instrument_id))) return false
  if (!matchesRange(item.created_at, criteria.range)) return false
  if (criteria.ruleStatuses.size > 0 && asset) {
    const relatedRules = rulesForAsset(rules, asset)
    const hasSelectedStatus = relatedRules.some((rule) => criteria.ruleStatuses.has(rule.enabled ? "active" : "disabled"))
    if (!hasSelectedStatus) return false
  }
  const needle = criteria.searchTerm.trim().toLowerCase()
  if (needle) {
    const haystack = [item.title, item.body, item.type, asset?.name, asset?.symbol].filter(Boolean).join(" ").toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

function matchesRange(createdAt: string, range: DateRange): boolean {
  if (range === "all") return true
  const days = range === "7d" ? 7 : 30
  return Date.parse(createdAt) >= Date.now() - days * 24 * 60 * 60 * 1000
}

function resolveAsset(item: NotificationItem, byListing: Map<string, AssetContext>, byInstrument: Map<string, AssetContext>): AssetContext | undefined {
  if (item.listing_id && byListing.has(item.listing_id)) return byListing.get(item.listing_id)
  if (item.instrument_id && byInstrument.has(item.instrument_id)) return byInstrument.get(item.instrument_id)
  return undefined
}

function rulesForAsset(rules: AlertRule[], asset: AssetContext): AlertRule[] {
  return rules.filter((rule) => rule.instrument_id === asset.instrument_id || rule.listing_id === asset.listing_id)
}

function findTriggeredRule(notification: NotificationItem, asset: AssetContext, rules: AlertRule[]): AlertRule | null {
  if (notification.rule_id) {
    const directMatch = rules.find((rule) => rule.id === notification.rule_id)
    if (directMatch) return directMatch
  }
  const kind = notificationTypeToRuleKind(notification.type)
  const candidates = rules.filter((rule) => rule.kind === kind && (rule.instrument_id === asset.instrument_id || rule.listing_id === asset.listing_id))
  return candidates.find((rule) => !rule.enabled && ruleMatchesData(rule, notification.data)) ?? candidates[0] ?? null
}

function notificationTypeToRuleKind(type: NotificationItem["type"]): AlertRuleKind {
  if (type === "earnings_upcoming") return "earnings_lead"
  return type
}

function ruleMatchesData(rule: AlertRule, data: unknown): boolean {
  const payload = isRecord(data) ? data : {}
  if (rule.kind === "price_threshold") return String(rule.params.direction) === String(payload.direction) && Number(rule.params.price) === Number(payload.threshold)
  if (rule.kind === "cost_basis_move") return String(rule.params.direction) === String(payload.direction) && Number(rule.params.threshold_pct) === Number(payload.threshold_pct)
  if (rule.kind === "daily_move") return Number.isFinite(Number(payload.daily_change_pct))
  if (rule.kind === "earnings_lead") return typeof payload.report_date === "string"
  return rule.kind === "target_zone"
}

function describeRule(rule: AlertRule): string {
  const params = rule.params
  if (rule.kind === "price_threshold") return `Price ${String(params.direction)} ${String(params.price)}`
  if (rule.kind === "daily_move") return `Daily move above ${String(params.threshold_pct)}%`
  if (rule.kind === "earnings_lead") return `Earnings ${String(params.days)} day(s) before report`
  if (rule.kind === "cost_basis_move") return `Cost basis ${String(params.direction)} ${String(params.threshold_pct)}%`
  if (rule.kind === "target_zone") return "Target zone"
  return rule.kind
}

function countBy<T, K>(items: T[], key: (item: T) => K): Map<K, number> {
  const map = new Map<K, number>()
  for (const item of items) {
    const k = key(item)
    map.set(k, (map.get(k) ?? 0) + 1)
  }
  return map
}

function removeSetValue<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current)
  next.delete(value)
  return next
}

function groupNotifications(items: NotificationItem[]): Array<{ label: string; items: NotificationItem[] }> {
  const today = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const groups = new Map<string, NotificationItem[]>()
  for (const item of items) {
    const day = item.created_at.slice(0, 10)
    const label = day === today ? "Today" : day === yesterday ? "Yesterday" : "Earlier"
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return ["Today", "Yesterday", "Earlier"].flatMap((label) => {
    const rows = groups.get(label)
    return rows ? [{ label, items: rows }] : []
  })
}

function formatTime(value: string, locale: string): string {
  return new Date(value).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
}

function formatDateTime(value: string, locale: string): string {
  return new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
}

function formatNotificationValue(item: NotificationItem, asset: AssetContext | undefined, locale: string): string {
  const data = isRecord(item.data) ? item.data : {}
  if (typeof data.price === "number" && asset) return money(String(data.price), locale, asset.currency)
  if (typeof data.latest === "number" && asset) return money(String(data.latest), locale, asset.currency)
  if (typeof data.daily_change_pct === "number") return `${data.daily_change_pct >= 0 ? "+" : ""}${data.daily_change_pct.toFixed(2)}%`
  if (typeof data.unrealized_pct === "number") return `${data.unrealized_pct >= 0 ? "+" : ""}${data.unrealized_pct.toFixed(2)}%`
  return "—"
}

function valueTone(item: NotificationItem): "positive" | "negative" | "neutral" {
  const data = isRecord(item.data) ? item.data : {}
  const value = typeof data.daily_change_pct === "number" ? data.daily_change_pct : typeof data.unrealized_pct === "number" ? data.unrealized_pct : null
  if (value === null) return "neutral"
  return value >= 0 ? "positive" : "negative"
}

function money(value: string | null, locale: string, currency: string): string {
  const number = value === null ? null : Number(value)
  if (number === null || Number.isNaN(number)) return "—"
  return new Intl.NumberFormat(locale, { currency, style: "currency" }).format(number)
}

function pct(value: string | null): string {
  const number = value === null ? null : Number(value)
  if (number === null || Number.isNaN(number)) return ""
  return ` · ${number >= 0 ? "+" : ""}${number.toFixed(2)}%`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function SearchIcon({ small = false }: { small?: boolean }) {
  return <AppIcon className={small ? "h-3.5 w-3.5" : "h-4 w-4"} name="search" strokeWidth={1.8} />
}


function MailIcon() {
  return <AppIcon className="h-4 w-4" name="mail" strokeWidth={1.8} />
}

function OpenIcon() {
  return <AppIcon className="h-4 w-4" name="openExternal" strokeWidth={1.8} />
}

function TrashIcon() {
  return <AppIcon className="h-4 w-4" name="trash" strokeWidth={1.8} />
}
