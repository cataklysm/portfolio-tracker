"use client"

import { useEffect, useMemo, useState, useTransition, type FormEvent, type InputHTMLAttributes, type MouseEventHandler, type ReactNode } from "react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { markAllNotificationsReadAction, markNotificationReadAction } from "@/app/notifications/actions"
import {
  createRulePayloadAction,
  deleteRuleAction,
  toggleRuleAction,
  updateRulePayloadAction,
  type AlertRulePayload,
} from "@/app/notifications/settings/actions"
import { PageShell } from "@/application/shell/PageShell"
import { useToast } from "@/application/toast/ToastProvider"
import { AppBadge, type AppBadgeTone } from "@/design/components/AppBadge"
import { ControlBar, type ControlBarFilterBadge } from "@/design/components/ControlBar"
import { MetricBar, MetricBarItem } from "@/design/components/MetricBar"
import { AppIcon, type AppIconName } from "@/design/icons/AppIcon"
import { REPEAT_OPTIONS, repeatLabel } from "@/features/notifications/repeat"
import { fmtPriceAmount, num } from "@/lib/format"
import type {
  AlertRule,
  AlertRuleKind,
  ListingSummary,
  NotificationInbox,
  NotificationItem,
  PositionView,
  PriceTarget,
  WatchlistItemView,
} from "@/lib/types"

export type NotificationView = "all" | "unread" | "price_moves" | "thresholds" | "earnings" | "rules"

interface NotificationsWorkspaceProps {
  inbox: NotificationInbox
  initialView?: NotificationView
  locale: string
  positions: PositionView[]
  priceTargets: PriceTarget[]
  rules: AlertRule[]
  watchlistItems: WatchlistItemView[]
}

interface AssetContext extends ListingSummary {
  listing_id: string
  position_id?: string
  source: "held" | "watchlist"
  state?: PositionView["state"]
  performance?: PositionView["performance"]
}

const notificationTabs: Array<{ value: NotificationView; label: string }> = [
  { value: "all", label: "All" },
  { value: "unread", label: "Unread" },
  { value: "price_moves", label: "Price moves" },
  { value: "thresholds", label: "Thresholds" },
  { value: "earnings", label: "Earnings" },
  { value: "rules", label: "Rules" },
]

const ruleKindOptions: Array<{ value: AlertRuleKind; label: string }> = [
  { value: "price_threshold", label: "Price threshold" },
  { value: "daily_move", label: "Daily move" },
  { value: "earnings_lead", label: "Earnings reminder" },
  { value: "cost_basis_move", label: "Move from cost basis" },
  { value: "target_zone", label: "Target zone" },
]

const typeLabels: Record<NotificationItem["type"], string> = {
  cost_basis_move: "Cost basis",
  daily_move: "Price move",
  earnings_upcoming: "Earnings",
  price_threshold: "Price threshold",
  target_zone: "Target zone",
}

const typeIcons: Record<NotificationItem["type"], AppIconName> = {
  cost_basis_move: "value",
  daily_move: "trendUp",
  earnings_upcoming: "calendar",
  price_threshold: "alert",
  target_zone: "target",
}

const typeTones: Record<NotificationItem["type"], AppBadgeTone> = {
  cost_basis_move: "success",
  daily_move: "success",
  earnings_upcoming: "accent",
  price_threshold: "warning",
  target_zone: "accent",
}

const ruleKindLabels: Record<AlertRuleKind, string> = {
  cost_basis_move: "Cost basis",
  daily_move: "Daily move",
  earnings_lead: "Earnings reminder",
  price_threshold: "Price threshold",
  target_zone: "Target zone",
}

const collapsedGroupsStorageKey = "portfolio-tracker:notifications:collapsed-groups"

export function NotificationsWorkspace({
  inbox,
  initialView = "all",
  locale,
  positions,
  priceTargets,
  rules,
  watchlistItems,
}: NotificationsWorkspaceProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { error, success } = useToast()
  const [view, setView] = useState<NotificationView>(initialView)
  const [searchTerm, setSearchTerm] = useState("")
  const [selectedAssetIds, setSelectedAssetIds] = useState<Set<string>>(new Set())
  const [selectedId, setSelectedId] = useState(inbox.notifications[0]?.id ?? null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addingRule, setAddingRule] = useState(false)
  const [pending, startTransition] = useTransition()

  const assets = useMemo(() => buildAssets(positions, watchlistItems), [positions, watchlistItems])
  const assetByListing = useMemo(() => new Map(assets.map((asset) => [asset.listing_id, asset])), [assets])
  const assetByInstrument = useMemo(() => new Map(assets.map((asset) => [asset.instrument_id, asset])), [assets])
  const targetById = useMemo(() => new Map(priceTargets.map((target) => [target.id, target])), [priceTargets])
  const notificationAssets = useMemo(() => new Map(inbox.notifications.map((item) => [item.id, resolveAsset(item, assetByListing, assetByInstrument)])), [assetByInstrument, assetByListing, inbox.notifications])

  const filteredNotifications = useMemo(() => inbox.notifications.filter((item) => matchesNotification(item, notificationAssets.get(item.id), { assetIds: selectedAssetIds, searchTerm, view })), [inbox.notifications, notificationAssets, searchTerm, selectedAssetIds, view])
  const filteredRules = useMemo(() => filterRules(rules, assets, priceTargets, searchTerm, selectedAssetIds, locale), [assets, locale, priceTargets, rules, searchTerm, selectedAssetIds])
  const selected = filteredNotifications.find((item) => item.id === selectedId) ?? filteredNotifications[0] ?? inbox.notifications.find((item) => item.id === selectedId) ?? inbox.notifications[0] ?? null
  const selectedAsset = selected ? notificationAssets.get(selected.id) ?? null : null
  const selectedRules = selectedAsset ? rulesForAsset(rules, selectedAsset) : []
  const triggeredRule = selected && selectedAsset ? findTriggeredRule(selected, selectedAsset, selectedRules) : null

  const metrics = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10)
    const triggeredToday = inbox.notifications.filter((item) => item.created_at.slice(0, 10) === today).length
    return {
      activeRules: rules.filter((rule) => rule.enabled).length,
      disabledRules: rules.filter((rule) => !rule.enabled).length,
      heldAssets: assets.filter((asset) => asset.source === "held").length,
      total: inbox.notifications.length,
      triggeredToday,
      unread: inbox.unread_count,
    }
  }, [assets, inbox.notifications, inbox.unread_count, rules])

  const controlBadges = useMemo<ControlBarFilterBadge[]>(() => [...selectedAssetIds].map((assetId) => ({
    id: `asset-${assetId}`,
    label: "Asset",
    value: assetByInstrument.get(assetId)?.name ?? assetId,
    onClear: () => setSelectedAssetIds((current) => removeSetValue(current, assetId)),
  })), [assetByInstrument, selectedAssetIds])

  const visibleAssetSuggestions = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase()
    if (needle.length < 2) return []
    return assets
      .filter((asset) => !selectedAssetIds.has(asset.instrument_id))
      .filter((asset) => asset.name.toLowerCase().includes(needle) || asset.symbol.toLowerCase().includes(needle))
      .slice(0, 6)
  }, [assets, searchTerm, selectedAssetIds])

  function clearFilters() {
    setSearchTerm("")
    setSelectedAssetIds(new Set())
    changeView("all")
  }

  function changeView(nextView: NotificationView) {
    setView(nextView)
    const params = new URLSearchParams(searchParams.toString())
    if (nextView === "all") params.delete("view")
    else params.set("view", nextView)
    const query = params.toString()
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false })
  }

  function addAssetFilter(asset: AssetContext) {
    setSelectedAssetIds((current) => new Set(current).add(asset.instrument_id))
    setSearchTerm("")
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
    const asset = resolveRuleAsset(rule, assets)
    if (!confirm(`Delete rule "${rule.label ?? describeRule(rule, targetById, locale, asset)}"?`)) return
    startTransition(async () => {
      const result = await deleteRuleAction(rule.id)
      if (result?.error) error(result.error)
      else {
        success("Rule deleted.")
        router.refresh()
      }
    })
  }

  function submitCreateRule(payload: AlertRulePayload, done: () => void) {
    startTransition(async () => {
      const result = await createRulePayloadAction(payload)
      if (result?.error) error(result.error)
      else {
        success("Rule created.")
        done()
        router.refresh()
      }
    })
  }

  function submitUpdateRule(rule: AlertRule, payload: AlertRulePayload, done: () => void) {
    startTransition(async () => {
      const result = await updateRulePayloadAction(rule.id, {
        label: payload.label,
        notify_once: payload.notify_once,
        params: payload.params,
      })
      if (result?.error) error(result.error)
      else {
        success("Rule updated.")
        done()
        router.refresh()
      }
    })
  }

  const rulesView = view === "rules"

  return (
    <PageShell kind="workspace">
      <div className="flex items-center gap-2 text-[13px] font-bold">
        <span className="text-[var(--app-text-muted)]">Portfolio</span>
        <span className="text-[var(--app-text-faint)]">/</span>
        <span className="text-[var(--app-text)]">Notifications</span>
      </div>

      <MetricBar columns={{ xs: "1fr", md: "repeat(2, minmax(0, 1fr))", xl: "repeat(4, minmax(0, 1fr))" }}>
        <MetricBarItem icon={<AppIcon name="bell" />} label="Unread" primary sub={`of ${metrics.total} total`} tone="accent" value={metrics.unread} />
        <MetricBarItem icon={<AppIcon name="check" />} label="Active rules" sub={`across ${metrics.heldAssets} held assets`} tone="positive" value={metrics.activeRules} />
        <MetricBarItem icon={<AppIcon name="alert" />} label="Triggered today" sub="new alerts today" tone="warning" value={metrics.triggeredToday} />
        <MetricBarItem icon={<AppIcon name="settings" />} label="Disabled rules" sub="waiting for reactivation" tone="neutral" value={metrics.disabledRules} />
      </MetricBar>

      <ControlBar
        addLabel={rulesView ? "Add rule inline" : "Add notification rule"}
        badges={controlBadges}
        defaultTabValue={view}
        onAdd={() => rulesView ? setAddingRule(true) : setDialogOpen(true)}
        onClearFilters={clearFilters}
        onReload={() => router.refresh()}
        onSearchChange={setSearchTerm}
        onTabChange={changeView}
        reloadLabel="Reload notifications"
        searchPlaceholder={rulesView ? "Search rules, assets, or conditions" : "Search notifications, assets, or rules"}
        searchValue={searchTerm}
        tabs={notificationTabs.map((option) => ({
          ...option,
          count: option.value === "all" ? undefined : statusCount(option.value, metrics, inbox.notifications, rules),
        }))}
        tabValue={view}
      />

      {!rulesView && visibleAssetSuggestions.length > 0 ? <AssetSearchSuggestions onPick={addAssetFilter} suggestions={visibleAssetSuggestions} /> : null}

      {rulesView ? (
        <RulesTable
          adding={addingRule}
          assets={assets}
          locale={locale}
          onCancelAdd={() => setAddingRule(false)}
          onCreate={(payload) => submitCreateRule(payload, () => setAddingRule(false))}
          onDelete={deleteRule}
          onToggle={toggleRule}
          onUpdate={submitUpdateRule}
          pending={pending}
          priceTargets={priceTargets}
          rules={filteredRules}
          targetById={targetById}
        />
      ) : (
        <div className="grid min-h-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]">
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
            onAdd={() => setDialogOpen(true)}
            onDeleteRule={deleteRule}
            onToggleRule={toggleRule}
            pending={pending}
            rules={selectedRules}
            targetById={targetById}
            triggeredRule={triggeredRule}
          />
        </div>
      )}

      {dialogOpen ? (
        <RuleDialog
          assets={assets}
          locale={locale}
          onClose={() => setDialogOpen(false)}
          onCreate={(payload) => submitCreateRule(payload, () => setDialogOpen(false))}
          pending={pending}
          priceTargets={priceTargets}
        />
      ) : null}
    </PageShell>
  )
}

function AssetSearchSuggestions({
  onPick,
  suggestions,
}: {
  onPick: (asset: AssetContext) => void
  suggestions: AssetContext[]
}) {
  return (
    <section className="app-panel rounded-lg px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="shrink-0 text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Assets</span>
        <div className="flex min-w-0 flex-1 flex-wrap gap-2">
          {suggestions.map((asset) => (
            <button key={asset.listing_id} className="flex h-8 min-w-0 max-w-[280px] items-center gap-2 rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-2 text-left transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)]" onClick={() => onPick(asset)} type="button">
              <span className="min-w-0 truncate text-[12px] font-extrabold text-[var(--app-text)]">{asset.name}</span>
              <span className="shrink-0 text-[10.5px] font-medium text-[var(--app-text-faint)]">{asset.symbol}</span>
              <AppBadge kind="category" label={asset.source === "held" ? "Held" : "Watchlist"} tone={asset.source === "held" ? "success" : "accent"} />
            </button>
          ))}
        </div>
      </div>
    </section>
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
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const groups = useMemo(() => groupNotifications(items), [items])

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(collapsedGroupsStorageKey)
      const value = raw ? JSON.parse(raw) : []
      if (Array.isArray(value)) setCollapsed(new Set(value.filter((item): item is string => typeof item === "string")))
    } catch {
      setCollapsed(new Set())
    }
  }, [])

  function toggleGroup(label: string) {
    setCollapsed((current) => {
      const next = new Set(current)
      if (next.has(label)) next.delete(label)
      else next.add(label)
      window.localStorage.setItem(collapsedGroupsStorageKey, JSON.stringify([...next]))
      return next
    })
  }

  return (
    <section className="app-panel min-w-0 overflow-hidden rounded-lg">
      <PanelHeader
        action={<TextButton disabled={pending} onClick={onMarkAllRead}>Mark all read</TextButton>}
        subtitle={`${items.length} alerts`}
        title="Notification inbox"
      />
      <div className="grid grid-cols-[140px_minmax(130px,.9fr)_minmax(200px,1.3fr)_70px_72px_56px] gap-x-3 border-b border-[var(--app-border)] px-3 py-2 text-[11px] font-extrabold text-[var(--app-text-faint)]">
        {["Type", "Asset", "Alert", "Time", "Value", ""].map((heading) => <span key={heading}>{heading}</span>)}
      </div>
      {items.length === 0 ? (
        <div className="flex min-h-80 flex-col items-center justify-center gap-3 px-4 text-center">
          <p className="text-[14px] font-extrabold text-[var(--app-text)]">No notifications match these filters</p>
          <TextButton onClick={onClearFilters}>Clear filters</TextButton>
        </div>
      ) : (
        <div>
          {groups.map((group) => {
            const isCollapsed = collapsed.has(group.label)
            return (
              <div key={group.label}>
                <button className="flex h-10 w-full items-center gap-2 border-b border-[var(--app-border)] bg-[var(--app-surface-header)] px-3 text-left text-[12px] font-extrabold text-[var(--app-text)]" onClick={() => toggleGroup(group.label)} type="button">
                  <AppIcon className={`h-4 w-4 transition ${isCollapsed ? "-rotate-90" : ""}`} name="chevronDown" />
                  <span>{group.label}</span>
                  <AppBadge kind="count" label={group.items.length} tone="accent" />
                </button>
                {!isCollapsed ? group.items.map((item) => (
                  <NotificationRow
                    asset={notificationAssets.get(item.id)}
                    item={item}
                    key={item.id}
                    locale={locale}
                    onMarkRead={onMarkRead}
                    onSelect={() => onSelect(item)}
                    pending={pending}
                    selected={item.id === selectedId}
                  />
                )) : null}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}

function NotificationRow({
  asset,
  item,
  locale,
  onMarkRead,
  onSelect,
  pending,
  selected,
}: {
  asset: AssetContext | undefined
  item: NotificationItem
  locale: string
  onMarkRead: (id: string) => void
  onSelect: () => void
  pending: boolean
  selected: boolean
}) {
  const unread = item.read_at === null
  return (
    <div
      className={`grid cursor-pointer grid-cols-[140px_minmax(130px,.9fr)_minmax(200px,1.3fr)_70px_72px_56px] items-center gap-x-3 border-b border-[var(--app-border)] px-3 py-2.5 transition last:border-b-0 ${selected ? "bg-[color-mix(in_srgb,var(--app-accent)_18%,transparent)] shadow-[inset_3px_0_0_var(--app-accent)]" : "hover:bg-[var(--app-surface-hover)]"}`}
      onClick={onSelect}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") onSelect() }}
      role="button"
      tabIndex={0}
    >
      <div className="flex min-w-0 items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${unread ? "bg-[var(--app-accent)]" : "bg-[var(--app-border)]"}`} />
        <AppBadge icon={<AppIcon name={typeIcons[item.type]} />} kind="category" label={typeLabels[item.type]} tone={typeTones[item.type]} />
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-extrabold text-[var(--app-text)]">{asset?.name ?? "All holdings"}</p>
        <p className="truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">{asset ? `${asset.symbol} - ${asset.currency}` : "Global"}</p>
      </div>
      <div className="min-w-0">
        <p className="truncate text-[12px] font-extrabold text-[var(--app-text)]">{item.title}</p>
        {item.body ? <p className="truncate text-[11px] font-medium text-[var(--app-text-muted)]">{item.body}</p> : null}
      </div>
      <p className="text-[12px] font-medium tabular-nums text-[var(--app-text-muted)]">{formatTime(item.created_at, locale)}</p>
      <p className={`text-[12px] font-extrabold tabular-nums ${valueToneClass(valueTone(item))}`}>{formatNotificationValue(item, asset, locale)}</p>
      <div className="flex justify-end gap-1">
        {unread ? (
          <AppIconButton disabled={pending} label="Mark read" onClick={(event) => { event.stopPropagation(); onMarkRead(item.id) }}>
            <AppIcon name="mail" />
          </AppIconButton>
        ) : null}
        {asset ? (
          <Link className={iconButtonClass()} href={`/assets/${asset.listing_id}?returnTo=/notifications`} onClick={(event) => event.stopPropagation()} title="Open asset">
            <AppIcon className="h-4 w-4" name="openExternal" />
          </Link>
        ) : null}
      </div>
    </div>
  )
}

function NotificationDetails({
  asset,
  locale,
  notification,
  onAdd,
  onDeleteRule,
  onToggleRule,
  pending,
  rules,
  targetById,
  triggeredRule,
}: {
  asset: AssetContext | null
  locale: string
  notification: NotificationItem | null
  onAdd: () => void
  onDeleteRule: (rule: AlertRule) => void
  onToggleRule: (rule: AlertRule) => void
  pending: boolean
  rules: AlertRule[]
  targetById: Map<string, PriceTarget>
  triggeredRule: AlertRule | null
}) {
  return (
    <section className="app-panel min-w-0 overflow-hidden rounded-lg">
      <PanelHeader action={<TextButton onClick={onAdd}>Add rule</TextButton>} title="Asset rules" />
      {!notification ? (
        <p className="px-4 py-12 text-center text-[12px] font-medium text-[var(--app-text-faint)]">Select a notification to inspect its rule context.</p>
      ) : (
        <div className="space-y-3 p-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--app-accent)_30%,var(--app-border))] bg-[var(--app-accent-soft)] text-[11px] font-extrabold text-[var(--app-accent)]">
              {(asset?.symbol ?? "PT").slice(0, 3)}
            </div>
            <div className="min-w-0">
              <p className="truncate text-[14px] font-extrabold text-[var(--app-text)]">{asset?.name ?? "All holdings"}</p>
              <p className="mt-0.5 text-[11px] font-medium text-[var(--app-text-muted)]">
                {asset ? `${asset.symbol} - ${asset.currency}${asset.performance ? pct(asset.performance.daily_change_pct) : ""}` : "Global notification"}
              </p>
            </div>
          </div>

          <div className="rounded-md border border-[color-mix(in_srgb,var(--app-positive)_34%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_9%,transparent)] p-3">
            <div className="mb-2 flex items-center gap-2">
              <AppBadge icon={<AppIcon name={typeIcons[notification.type]} />} kind="category" label={typeLabels[notification.type]} tone={typeTones[notification.type]} />
              <span className="text-[11px] font-medium text-[var(--app-text-faint)]">{formatDateTime(notification.created_at, locale)}</span>
            </div>
            <p className="text-[13px] font-extrabold text-[var(--app-text)]">{notification.title}</p>
            {notification.body ? <p className="mt-1 text-[12px] font-medium leading-5 text-[var(--app-text-muted)]">{notification.body}</p> : null}
            {triggeredRule ? (
              <p className="mt-2 text-[12px] font-medium text-[var(--app-text-muted)]">
                Triggered rule: <span className="font-extrabold text-[var(--app-text)]">{triggeredRule.label ?? describeRule(triggeredRule, targetById, locale, asset ?? undefined)}</span>
              </p>
            ) : null}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--app-border)] pt-3">
            <p className="text-[13px] font-extrabold text-[var(--app-text)]">Rules for this asset</p>
            <AppBadge kind="count" label={rules.length} tone="neutral" />
          </div>
          {rules.length === 0 ? (
            <p className="text-[12px] font-medium text-[var(--app-text-faint)]">No rules are configured for this asset.</p>
          ) : (
            <div className="space-y-2">
              {rules.map((rule) => (
                <RuleCard asset={asset ?? undefined} key={rule.id} locale={locale} pending={pending} rule={rule} targetById={targetById} triggered={rule.id === triggeredRule?.id} onDelete={() => onDeleteRule(rule)} onToggle={() => onToggleRule(rule)} />
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function RulesTable({
  adding,
  assets,
  locale,
  onCancelAdd,
  onCreate,
  onDelete,
  onToggle,
  onUpdate,
  pending,
  priceTargets,
  rules,
  targetById,
}: {
  adding: boolean
  assets: AssetContext[]
  locale: string
  onCancelAdd: () => void
  onCreate: (payload: AlertRulePayload) => void
  onDelete: (rule: AlertRule) => void
  onToggle: (rule: AlertRule) => void
  onUpdate: (rule: AlertRule, payload: AlertRulePayload, done: () => void) => void
  pending: boolean
  priceTargets: PriceTarget[]
  rules: AlertRule[]
  targetById: Map<string, PriceTarget>
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <section className="app-panel min-w-0 overflow-hidden rounded-lg">
      <PanelHeader subtitle={`${rules.length} rules`} title="Rules" />
      <div className="grid grid-cols-[minmax(220px,1.2fr)_160px_minmax(260px,1.4fr)_120px_100px_104px] border-b border-[var(--app-border)] px-3 py-2 text-[11px] font-extrabold text-[var(--app-text-faint)]">
        {["Asset", "Type", "Condition", "Repeat", "Status", ""].map((heading) => <span key={heading}>{heading}</span>)}
      </div>
      {adding ? (
        <div className="border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-accent)_7%,transparent)] p-3 shadow-[inset_3px_0_0_var(--app-accent)]">
          <RuleForm assets={assets} locale={locale} onCancel={onCancelAdd} onSubmit={onCreate} pending={pending} priceTargets={priceTargets} submitLabel="Create rule" />
        </div>
      ) : null}
      {rules.length === 0 && !adding ? (
        <p className="px-4 py-12 text-center text-[12px] font-medium text-[var(--app-text-faint)]">No rules match these filters.</p>
      ) : (
        rules.map((rule) => {
          const asset = resolveRuleAsset(rule, assets)
          const editing = editingId === rule.id
          return (
            <div key={rule.id}>
              <div className={`grid grid-cols-[minmax(220px,1.2fr)_160px_minmax(260px,1.4fr)_120px_100px_104px] items-center border-b border-[var(--app-border)] px-3 py-2.5 ${editing ? "bg-[color-mix(in_srgb,var(--app-accent)_10%,transparent)] shadow-[inset_3px_0_0_var(--app-accent)]" : ""}`}>
                <AssetCell asset={asset} />
                <div className="justify-self-start">
                  <AppBadge kind="category" label={ruleKindLabels[rule.kind]} tone={rule.kind === "target_zone" ? "accent" : "neutral"} />
                </div>
                <p className="min-w-0 truncate text-[12px] font-semibold text-[var(--app-text-muted)]">{describeRule(rule, targetById, locale, asset)}</p>
                <div className="justify-self-start">
                  <AppBadge kind="category" label={repeatLabel(rule)} tone="neutral" />
                </div>
                <button className={`h-7 rounded-md border px-2 text-[11px] font-extrabold ${rule.enabled ? "border-[color-mix(in_srgb,var(--app-positive)_34%,var(--app-border))] text-[var(--app-positive)]" : "border-[var(--app-border)] text-[var(--app-text-faint)]"}`} disabled={pending} onClick={() => onToggle(rule)} type="button">
                  {rule.enabled ? "Active" : "Disabled"}
                </button>
                <div className="flex justify-end gap-1">
                  <AppIconButton disabled={pending} label={editing ? "Close edit" : "Edit rule"} onClick={() => setEditingId(editing ? null : rule.id)}>
                    <AppIcon name={editing ? "x" : "edit"} />
                  </AppIconButton>
                  <AppIconButton disabled={pending} label="Delete rule" onClick={() => onDelete(rule)} tone="danger">
                    <AppIcon name="trash" />
                  </AppIconButton>
                </div>
              </div>
              {editing ? (
                <div className="border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-accent)_7%,transparent)] p-3 shadow-[inset_3px_0_0_var(--app-accent)]">
                  <RuleForm
                    assets={assets}
                    initialRule={rule}
                    locale={locale}
                    onCancel={() => setEditingId(null)}
                    onSubmit={(payload) => onUpdate(rule, payload, () => setEditingId(null))}
                    pending={pending}
                    priceTargets={priceTargets}
                    submitLabel="Save changes"
                  />
                </div>
              ) : null}
            </div>
          )
        })
      )}
      <div className="app-panel-footer flex min-h-[42px] items-center px-3 text-[11px] font-medium text-[var(--app-text-faint)]">
        Updated {new Date().toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}
      </div>
    </section>
  )
}

function RuleDialog({
  assets,
  locale,
  onClose,
  onCreate,
  pending,
  priceTargets,
}: {
  assets: AssetContext[]
  locale: string
  onClose: () => void
  onCreate: (payload: AlertRulePayload) => void
  pending: boolean
  priceTargets: PriceTarget[]
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 px-4">
      <section className="app-panel w-full max-w-[760px] overflow-hidden rounded-lg shadow-[var(--app-shadow)]">
        <PanelHeader title="Create notification rule" />
        <div className="p-4">
          <RuleForm assets={assets} locale={locale} onCancel={onClose} onSubmit={onCreate} pending={pending} priceTargets={priceTargets} submitLabel="Create rule" />
        </div>
      </section>
    </div>
  )
}

function RuleForm({
  assets,
  initialRule,
  locale,
  onCancel,
  onSubmit,
  pending,
  priceTargets,
  submitLabel,
}: {
  assets: AssetContext[]
  initialRule?: AlertRule
  locale: string
  onCancel: () => void
  onSubmit: (payload: AlertRulePayload) => void
  pending: boolean
  priceTargets: PriceTarget[]
  submitLabel: string
}) {
  const initialAsset = initialRule ? resolveRuleAsset(initialRule, assets) ?? assets[0] : assets[0]
  const [assetKey, setAssetKey] = useState(initialAsset?.listing_id ?? "")
  const [kind, setKind] = useState<AlertRuleKind>(initialRule?.kind ?? "price_threshold")
  const [repeat, setRepeat] = useState(initialRule?.notify_once === false ? "recurring" : "once")
  const selectedAsset = assets.find((asset) => asset.listing_id === assetKey) ?? initialAsset
  const targetOptions = selectedAsset ? ownTargetsForAsset(priceTargets, selectedAsset) : []
  const initialTargetId = typeof initialRule?.params.target_id === "string" ? initialRule.params.target_id : targetOptions[0]?.id ?? ""
  const [targetId, setTargetId] = useState(initialTargetId)
  const selectedTargetId = targetOptions.some((target) => target.id === targetId) ? targetId : targetOptions[0]?.id ?? ""
  const locked = Boolean(initialRule)
  const showDirection = kind === "price_threshold" || kind === "cost_basis_move"

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedAsset) return
    const formData = new FormData(event.currentTarget)
    const payload = buildRulePayload(formData, selectedAsset, kind, repeat, selectedTargetId)
    if (!payload) return
    onSubmit(payload)
  }

  return (
    <form className="space-y-4" onSubmit={submit}>
      <div className="grid gap-3 lg:grid-cols-2">
        <FieldShell label="Asset">
          <select className={inputClass} disabled={locked} onChange={(event) => setAssetKey(event.target.value)} value={assetKey}>
            {assets.map((asset) => (
              <option key={asset.listing_id} value={asset.listing_id}>{asset.name} ({asset.symbol})</option>
            ))}
          </select>
        </FieldShell>
        <FieldShell label="Rule type">
          <select className={inputClass} disabled={locked} name="kind" onChange={(event) => setKind(event.target.value as AlertRuleKind)} value={kind}>
            {ruleKindOptions.map((option) => (
              <option disabled={option.value === "target_zone" && targetOptions.length === 0} key={option.value} value={option.value}>
                {option.label}{option.value === "target_zone" && targetOptions.length === 0 ? " (no zones)" : ""}
              </option>
            ))}
          </select>
        </FieldShell>
      </div>

      {kind === "target_zone" ? (
        <FieldShell label="Target zone">
          <select className={inputClass} name="target_id" onChange={(event) => setTargetId(event.target.value)} required value={selectedTargetId}>
            {targetOptions.map((target) => (
              <option key={target.id} value={target.id}>{formatTarget(target, locale, selectedAsset?.asset_type ?? "equity")}</option>
            ))}
          </select>
        </FieldShell>
      ) : (
        <div className={`grid gap-3 ${showDirection ? "lg:grid-cols-2" : ""}`}>
          {showDirection ? (
            <FieldShell label="Direction">
              <select className={inputClass} defaultValue={String(initialRule?.params.direction ?? "above")} name="direction">
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </FieldShell>
          ) : null}
          {kind === "price_threshold" ? <NumberField defaultValue={String(initialRule?.params.price ?? "")} label={`Price (${selectedAsset?.currency ?? "EUR"})`} min="0.000001" name="price" /> : null}
          {kind === "daily_move" ? <NumberField defaultValue={String(initialRule?.params.threshold_pct ?? "5")} label="Daily move (%)" min="0.1" name="threshold_pct" /> : null}
          {kind === "earnings_lead" ? <NumberField defaultValue={String(initialRule?.params.days ?? "7")} label="Days before earnings" max="365" min="1" name="days" step="1" /> : null}
          {kind === "cost_basis_move" ? <NumberField defaultValue={String(initialRule?.params.threshold_pct ?? "10")} label="Move from cost (%)" min="0.1" name="threshold_pct" /> : null}
        </div>
      )}

      <div className="grid gap-3 lg:grid-cols-2">
        <FieldShell label="Label">
          <input className={inputClass} defaultValue={initialRule?.label ?? ""} maxLength={100} name="label" placeholder="Optional label" />
        </FieldShell>
        <FieldShell label="When it triggers">
          <select className={inputClass} name="repeat" onChange={(event) => setRepeat(event.target.value)} value={repeat}>
            {REPEAT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
        </FieldShell>
      </div>

      <div className="app-panel-footer flex items-center justify-end gap-2 border-t border-[var(--app-border)] pt-3">
        <TextButton disabled={pending} onClick={onCancel}>Cancel</TextButton>
        <button className="h-9 rounded-md bg-[var(--app-accent)] px-4 text-[12px] font-extrabold text-white transition hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,white)] disabled:cursor-not-allowed disabled:opacity-50" disabled={pending || (kind === "target_zone" && targetOptions.length === 0)} type="submit">
          {pending ? "Saving..." : submitLabel}
        </button>
      </div>
    </form>
  )
}

function RuleCard({
  asset,
  locale,
  onDelete,
  onToggle,
  pending,
  rule,
  targetById,
  triggered,
}: {
  asset?: AssetContext
  locale: string
  onDelete: () => void
  onToggle: () => void
  pending: boolean
  rule: AlertRule
  targetById: Map<string, PriceTarget>
  triggered: boolean
}) {
  return (
    <div className={`rounded-md border p-2.5 ${triggered ? "border-[color-mix(in_srgb,var(--app-accent)_56%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_12%,transparent)]" : "border-[var(--app-border)] bg-[var(--app-surface-inset)]"}`}>
      <div className="flex min-w-0 items-center gap-2">
        <button
          aria-label={rule.enabled ? "Disable rule" : "Enable rule"}
          className={`relative h-5 w-9 shrink-0 rounded-full border transition ${rule.enabled ? "border-[color-mix(in_srgb,var(--app-positive)_42%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_24%,transparent)]" : "border-[var(--app-border)] bg-[var(--app-surface-panel)]"}`}
          disabled={pending}
          onClick={onToggle}
          type="button"
        >
          <span className={`absolute top-0.5 h-4 w-4 rounded-full transition ${rule.enabled ? "left-4 bg-[var(--app-positive)]" : "left-0.5 bg-[var(--app-text-faint)]"}`} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p className="truncate text-[12px] font-extrabold text-[var(--app-text)]">{rule.label ?? ruleKindLabels[rule.kind]}</p>
            <AppBadge kind="status" label={rule.enabled ? "Active" : triggered ? "Triggered" : "Disabled"} tone={rule.enabled ? "success" : triggered ? "accent" : "neutral"} />
            <AppBadge kind="category" label={repeatLabel(rule)} tone="neutral" />
          </div>
          <p className="mt-0.5 truncate text-[11px] font-medium text-[var(--app-text-muted)]">{describeRule(rule, targetById, locale, asset)}</p>
        </div>
        <AppIconButton disabled={pending} label="Delete rule" onClick={onDelete} tone="danger">
          <AppIcon name="trash" />
        </AppIconButton>
      </div>
    </div>
  )
}

function PanelHeader({ action, subtitle, title }: { action?: ReactNode; subtitle?: string; title: string }) {
  return (
    <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <div className="flex min-w-0 items-baseline gap-2">
          <h2 className="truncate text-[13px] font-extrabold text-[var(--app-text)]">{title}</h2>
          {subtitle ? <span className="shrink-0 text-[11px] font-semibold text-[var(--app-text-faint)]">{subtitle}</span> : null}
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  )
}

function FieldShell({ children, label }: { children: ReactNode; label: string }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10.5px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</span>
      {children}
    </label>
  )
}

function NumberField({ label, name, ...props }: { label: string; name: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell label={label}>
      <input className={inputClass} name={name} required step="any" type="number" {...props} />
    </FieldShell>
  )
}

const inputClass = "h-10 w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 text-[13px] font-semibold text-[var(--app-text)] outline-none transition focus:border-[color-mix(in_srgb,var(--app-accent)_54%,var(--app-border))] focus:ring-2 focus:ring-[color-mix(in_srgb,var(--app-accent)_18%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"

function TextButton({ children, disabled = false, onClick }: { children: ReactNode; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--app-border)] px-3 text-[12px] font-extrabold text-[var(--app-text-muted)] transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {children}
    </button>
  )
}

function AppIconButton({ children, disabled = false, label, onClick, tone = "neutral" }: { children: ReactNode; disabled?: boolean; label: string; onClick: MouseEventHandler<HTMLButtonElement>; tone?: "danger" | "neutral" }) {
  return (
    <button aria-label={label} className={iconButtonClass(tone)} disabled={disabled} onClick={onClick} title={label} type="button">
      {children}
    </button>
  )
}

function iconButtonClass(tone: "danger" | "neutral" = "neutral") {
  const toneClass = tone === "danger"
    ? "text-[var(--app-negative)] hover:text-[var(--app-negative)]"
    : "text-[var(--app-text-muted)] hover:text-[var(--app-text)]"
  return `flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] ${toneClass} transition hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-50 [&>.app-icon]:h-4 [&>.app-icon]:w-4`
}

function AssetCell({ asset }: { asset: AssetContext | undefined }) {
  return (
    <div className="min-w-0">
      <p className="truncate text-[12px] font-extrabold text-[var(--app-text)]">{asset?.name ?? "Unknown asset"}</p>
      <p className="truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">{asset ? `${asset.symbol} - ${asset.source === "held" ? "Held" : "Watchlist"}` : "Not in current asset set"}</p>
    </div>
  )
}

function buildAssets(positions: PositionView[], watchlistItems: WatchlistItemView[]): AssetContext[] {
  const assets = new Map<string, AssetContext>()
  for (const position of positions) {
    if (!position.listing || position.state !== "open") continue
    assets.set(position.listing_id, {
      ...position.listing,
      listing_id: position.listing_id,
      position_id: position.id,
      performance: position.performance,
      source: "held",
      state: position.state,
    })
  }
  for (const item of watchlistItems) {
    if (!item.listing || assets.has(item.listing_id)) continue
    assets.set(item.listing_id, { ...item.listing, listing_id: item.listing_id, source: "watchlist" })
  }
  return [...assets.values()].sort((first, second) => first.name.localeCompare(second.name))
}

function buildRulePayload(formData: FormData, asset: AssetContext, kind: AlertRuleKind, repeat: string, targetId: string): AlertRulePayload | null {
  const numberValue = (key: string) => Number(formData.get(key))
  let params: Record<string, unknown>
  if (kind === "price_threshold") params = { direction: formData.get("direction"), price: numberValue("price") }
  else if (kind === "daily_move") params = { threshold_pct: numberValue("threshold_pct") }
  else if (kind === "earnings_lead") params = { days: numberValue("days") }
  else if (kind === "cost_basis_move") params = { direction: formData.get("direction"), threshold_pct: numberValue("threshold_pct") }
  else {
    if (!targetId) return null
    params = { target_id: targetId }
  }
  const label = String(formData.get("label") ?? "").trim()
  return {
    kind,
    instrument_id: asset.instrument_id,
    listing_id: asset.listing_id,
    label: label || null,
    notify_once: repeat !== "recurring",
    params,
  }
}

function statusCount(view: NotificationView, metrics: { unread: number }, notifications: NotificationItem[], rules: AlertRule[]): number {
  if (view === "unread") return metrics.unread
  if (view === "price_moves") return notifications.filter((item) => item.type === "daily_move" || item.type === "cost_basis_move").length
  if (view === "thresholds") return notifications.filter((item) => item.type === "price_threshold" || item.type === "target_zone").length
  if (view === "earnings") return notifications.filter((item) => item.type === "earnings_upcoming").length
  if (view === "rules") return rules.length
  return notifications.length
}

function matchesNotification(item: NotificationItem, asset: AssetContext | undefined, criteria: { assetIds: Set<string>; searchTerm: string; view: NotificationView }): boolean {
  if (criteria.view === "rules") return false
  if (criteria.view === "unread" && item.read_at !== null) return false
  if (criteria.view === "price_moves" && item.type !== "daily_move" && item.type !== "cost_basis_move") return false
  if (criteria.view === "thresholds" && item.type !== "price_threshold" && item.type !== "target_zone") return false
  if (criteria.view === "earnings" && item.type !== "earnings_upcoming") return false
  if (criteria.assetIds.size > 0 && (!asset || !criteria.assetIds.has(asset.instrument_id))) return false
  const needle = criteria.searchTerm.trim().toLowerCase()
  if (needle) {
    const haystack = [item.title, item.body, item.type, asset?.name, asset?.symbol].filter(Boolean).join(" ").toLowerCase()
    if (!haystack.includes(needle)) return false
  }
  return true
}

function filterRules(rules: AlertRule[], assets: AssetContext[], priceTargets: PriceTarget[], searchTerm: string, selectedAssetIds: Set<string>, locale: string): AlertRule[] {
  const targetById = new Map(priceTargets.map((target) => [target.id, target]))
  const needle = searchTerm.trim().toLowerCase()
  return rules.filter((rule) => {
    const asset = resolveRuleAsset(rule, assets)
    if (selectedAssetIds.size > 0 && (!asset || !selectedAssetIds.has(asset.instrument_id))) return false
    if (!needle) return true
    const haystack = [
      asset?.name,
      asset?.symbol,
      rule.label,
      ruleKindLabels[rule.kind],
      describeRule(rule, targetById, locale, asset),
    ].filter(Boolean).join(" ").toLowerCase()
    return haystack.includes(needle)
  })
}

function resolveAsset(item: NotificationItem, byListing: Map<string, AssetContext>, byInstrument: Map<string, AssetContext>): AssetContext | undefined {
  if (item.listing_id && byListing.has(item.listing_id)) return byListing.get(item.listing_id)
  if (item.instrument_id && byInstrument.has(item.instrument_id)) return byInstrument.get(item.instrument_id)
  return undefined
}

function resolveRuleAsset(rule: AlertRule, assets: AssetContext[]): AssetContext | undefined {
  return assets.find((asset) => asset.listing_id === rule.listing_id) ?? assets.find((asset) => asset.instrument_id === rule.instrument_id)
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
  if (rule.kind === "target_zone") {
    const targetId = typeof rule.params.target_id === "string" ? rule.params.target_id : null
    return targetId === null || targetId === payload.target_id || (Array.isArray(payload.target_ids) && payload.target_ids.includes(targetId))
  }
  return false
}

function ownTargetsForAsset(priceTargets: PriceTarget[], asset: AssetContext): PriceTarget[] {
  return priceTargets
    .filter((target) => target.source === "own")
    .filter((target) => target.instrument_id === asset.instrument_id)
    .filter((target) => target.listing_id === null || target.listing_id === asset.listing_id)
    .sort((first, second) => first.horizon.localeCompare(second.horizon) || first.effective_date.localeCompare(second.effective_date))
}

function describeRule(rule: AlertRule, targetById: Map<string, PriceTarget>, locale: string, asset?: AssetContext): string {
  const params = rule.params
  if (rule.kind === "price_threshold") {
    const price = readRuleNumber(params.price)
    const value = price === null ? String(params.price) : fmtPriceAmount(locale, price, asset?.currency ?? "EUR", asset?.asset_type ?? "equity")
    return `Price ${String(params.direction)} ${value}`
  }
  if (rule.kind === "daily_move") return `Daily move above ${String(params.threshold_pct)}%`
  if (rule.kind === "earnings_lead") return `Earnings ${String(params.days)} day(s) before report`
  if (rule.kind === "cost_basis_move") return `Cost basis ${String(params.direction)} ${String(params.threshold_pct)}%`
  if (rule.kind === "target_zone") {
    const targetId = typeof params.target_id === "string" ? params.target_id : null
    return targetId ? `Target zone: ${formatTarget(targetById.get(targetId), locale, asset?.asset_type ?? "equity")}` : "Target zone"
  }
  return rule.kind
}

function readRuleNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") return num(value)
  return null
}

function formatTarget(target: PriceTarget | undefined, locale: string, assetType: string): string {
  if (!target) return "Unknown zone"
  const lowValue = num(target.zone_low)
  const highValue = num(target.zone_high)
  const low = lowValue !== null ? fmtPriceAmount(locale, lowValue, target.currency, assetType) : null
  const high = highValue !== null ? fmtPriceAmount(locale, highValue, target.currency, assetType) : null
  const zone = low && high ? `${low} - ${high}` : low ? `from ${low}` : high ? `up to ${high}` : "open zone"
  return `${titleCase(target.horizon)} - ${zone}`
}

function groupNotifications(items: NotificationItem[]): Array<{ label: string; items: NotificationItem[] }> {
  const now = new Date()
  const todayStart = startOfDay(now)
  const thisWeekStart = startOfWeek(todayStart)
  const lastWeekStart = new Date(thisWeekStart)
  lastWeekStart.setDate(thisWeekStart.getDate() - 7)
  const groups = new Map<string, NotificationItem[]>()
  for (const item of items) {
    const date = new Date(item.created_at)
    const label = date >= todayStart ? "Today" : date >= thisWeekStart ? "This week" : date >= lastWeekStart ? "Last week" : "Earlier"
    groups.set(label, [...(groups.get(label) ?? []), item])
  }
  return ["Today", "This week", "Last week", "Earlier"].flatMap((label) => {
    const rows = groups.get(label)
    return rows ? [{ label, items: rows }] : []
  })
}

function startOfDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

function startOfWeek(value: Date): Date {
  const date = startOfDay(value)
  const day = date.getDay() || 7
  date.setDate(date.getDate() - day + 1)
  return date
}

function removeSetValue<T>(current: Set<T>, value: T): Set<T> {
  const next = new Set(current)
  next.delete(value)
  return next
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
  return "-"
}

function valueTone(item: NotificationItem): "positive" | "negative" | "neutral" {
  const data = isRecord(item.data) ? item.data : {}
  const value = typeof data.daily_change_pct === "number" ? data.daily_change_pct : typeof data.unrealized_pct === "number" ? data.unrealized_pct : null
  if (value === null) return "neutral"
  return value >= 0 ? "positive" : "negative"
}

function valueToneClass(tone: "positive" | "negative" | "neutral") {
  if (tone === "positive") return "text-[var(--app-positive)]"
  if (tone === "negative") return "text-[var(--app-negative)]"
  return "text-[var(--app-text-muted)]"
}

function money(value: string | null, locale: string, currency: string): string {
  const number = value === null ? null : Number(value)
  if (number === null || Number.isNaN(number)) return "-"
  return new Intl.NumberFormat(locale, { currency, style: "currency" }).format(number)
}

function pct(value: string | null): string {
  const number = value === null ? null : Number(value)
  if (number === null || Number.isNaN(number)) return ""
  return ` - ${number >= 0 ? "+" : ""}${number.toFixed(2)}%`
}

function titleCase(value: string): string {
  return value.slice(0, 1).toUpperCase() + value.slice(1)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}
