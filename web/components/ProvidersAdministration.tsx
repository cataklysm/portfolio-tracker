"use client"

import { useEffect, useMemo, useState, useTransition, type InputHTMLAttributes } from "react"
import { useRouter } from "next/navigation"
import {
  providerUsageAction,
  updateAdminProviderAction,
  updateCapabilityRefreshAction,
} from "@/app/administration/providers/actions"
import type { CapabilityRefreshView, DataQuality, ProviderSettingsView } from "@/lib/types"

const fieldClass = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--app-text-faint)]"
const storageKey = "administration.providers.expanded.v1"
const providerTabs = [
  { key: "symbol", label: "Symbol" },
  { key: "crypto", label: "Crypto" },
  { key: "reference", label: "Reference" },
] as const

type ProviderTab = (typeof providerTabs)[number]["key"]

export function ProvidersAdministration({
  providers,
  capabilityRefresh,
}: {
  providers: ProviderSettingsView[]
  capabilityRefresh: CapabilityRefreshView[]
}) {
  const router = useRouter()
  const cadenceByProvider = useMemo(() => {
    const map = new Map<string, CapabilityRefreshView[]>()
    for (const row of capabilityRefresh) {
      const list = map.get(row.provider) ?? []
      list.push(row)
      map.set(row.provider, list)
    }
    return map
  }, [capabilityRefresh])
  const [query, setQuery] = useState("")
  const [activeTab, setActiveTab] = useState<ProviderTab>("reference")
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() => Object.fromEntries(providers.map((provider) => [provider.provider, true])))
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  useEffect(() => {
    try {
      const raw = localStorage.getItem(storageKey)
      if (!raw) return
      const parsed = JSON.parse(raw) as Record<string, boolean>
      setExpanded((current) => ({ ...current, ...parsed }))
    } catch {
      localStorage.removeItem(storageKey)
    }
  }, [])

  const tabCounts = useMemo(() => {
    return Object.fromEntries(providerTabs.map((tab) => [
      tab.key,
      providers.filter((provider) => providerTabFor(provider) === tab.key).length,
    ])) as Record<ProviderTab, number>
  }, [providers])

  const visibleTabs = useMemo(() => {
    const populated = providerTabs.filter((tab) => tabCounts[tab.key] > 0)
    return populated.length > 0 ? populated : providerTabs.slice(0, 2)
  }, [tabCounts])
  const activeTabCount = tabCounts[activeTab] ?? 0

  useEffect(() => {
    if (activeTabCount > 0 || visibleTabs.length === 0) return
    setActiveTab(visibleTabs.find((tab) => tabCounts[tab.key] > 0)?.key ?? visibleTabs[0].key)
  }, [activeTab, activeTabCount, visibleTabs, tabCounts])

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const tabProviders = providers.filter((provider) => providerTabFor(provider) === activeTab)
    if (!needle) return tabProviders
    return tabProviders.filter((provider) => {
      return [
        provider.provider,
        provider.providerClass,
        provider.dataQuality,
        ...Object.keys(provider.capabilityQuality),
        ...Object.values(provider.capabilityQuality).filter(Boolean),
      ].some((value) => value.toLowerCase().includes(needle))
    })
  }, [providers, query, activeTab])

  function run(action: () => Promise<string | null>, success: string) {
    setMessage(null)
    startTransition(async () => {
      const error = await action()
      setMessage(error ?? success)
      if (!error) router.refresh()
    })
  }

  function setProviderExpanded(provider: string, nextExpanded: boolean) {
    setExpanded((current) => {
      const next = { ...current, [provider]: nextExpanded }
      localStorage.setItem(storageKey, JSON.stringify(next))
      return next
    })
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
      <header className="mb-6">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]">Administration</p>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">Providers</h1>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">Configure global provider availability, pacing, and data-quality metadata.</p>
      </header>

      {message ? <p className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text-muted)]">{message}</p> : null}

      <section className="app-panel overflow-hidden rounded-xl">
        <div className="flex flex-wrap items-center gap-3 border-b border-[var(--app-border)] p-3">
          <div className="relative min-w-[220px] flex-1">
            <SearchIcon />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search provider, class, quality or capability" className={`${fieldClass} pl-9`} />
          </div>
          <span className="text-[10px] text-[var(--app-text-faint)]">{filtered.length} of {activeTabCount}</span>
        </div>

        <div className="flex gap-1 border-b border-[var(--app-border)] px-3 py-2">
          {visibleTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${activeTab === tab.key ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}`}
            >
              {tab.label} <span className="ml-1 text-[10px] opacity-70">{tabCounts[tab.key]}</span>
            </button>
          ))}
        </div>

        <div className="space-y-3 p-3">
          {filtered.map((provider) => (
            <ProviderSettingsCard
              key={provider.provider}
              provider={provider}
              cadence={cadenceByProvider.get(provider.provider) ?? []}
              expanded={expanded[provider.provider] ?? true}
              pending={pending}
              onToggle={(nextExpanded) => setProviderExpanded(provider.provider, nextExpanded)}
              onRun={run}
            />
          ))}
          {filtered.length === 0 ? <p className="py-16 text-center text-xs text-[var(--app-text-faint)]">No providers match this view.</p> : null}
        </div>
      </section>
    </div>
  )
}

function providerTabFor(provider: ProviderSettingsView): ProviderTab {
  const providerClass = provider.providerClass as string
  if (providerClass === "reference" || providerClass === "symbol" || providerClass === "crypto") return providerClass
  return provider.provider.toLowerCase().includes("crypto") ? "crypto" : "symbol"
}

function ProviderSettingsCard({
  provider,
  cadence,
  expanded,
  pending,
  onToggle,
  onRun,
}: {
  provider: ProviderSettingsView
  cadence: CapabilityRefreshView[]
  expanded: boolean
  pending: boolean
  onToggle: (expanded: boolean) => void
  onRun: (action: () => Promise<string | null>, success: string) => void
}) {
  const [enabled, setEnabled] = useState(provider.enabled)
  const capabilities = Object.keys(provider.capabilityQuality)
  const canExpand = enabled
  const isExpanded = expanded && canExpand

  async function confirmDisableProvider() {
    const result = await providerUsageAction(provider.provider)
    if (result.error) return result.error
    if (result.usage.length > 0) {
      const affected = result.usage.slice(0, 8).map((row) => `${row.instrument_name} (${row.capability})`).join("\n")
      const suffix = result.usage.length > 8 ? `\n...and ${result.usage.length - 8} more` : ""
      if (!confirm(`Disable ${provider.provider}? These selections will stop refreshing until reassigned:\n\n${affected}${suffix}`)) {
        return "Provider disable cancelled."
      }
    }
    return null
  }

  async function submit(formData: FormData) {
    if (provider.enabled && !enabled) {
      const confirmationError = await confirmDisableProvider()
      if (confirmationError) return confirmationError
    }

    return updateAdminProviderAction({
      provider: provider.provider,
      enabled,
      dataQuality: String(formData.get("data_quality") ?? provider.dataQuality),
      maxBatchSize: nullableInt(formData.get("max_batch_size")),
      rateLimitPerMin: nullableInt(formData.get("rate_limit_per_min")),
      maxConcurrency: positiveInt(formData.get("max_concurrency")) ?? provider.maxConcurrency,
    })
  }

  async function updateEnabled(nextEnabled: boolean) {
    if (provider.enabled && !nextEnabled) {
      const confirmationError = await confirmDisableProvider()
      if (confirmationError) return confirmationError
    }

    const error = await updateAdminProviderAction({
      provider: provider.provider,
      enabled: nextEnabled,
      dataQuality: provider.dataQuality,
      maxBatchSize: provider.maxBatchSize,
      rateLimitPerMin: provider.rateLimitPerMin,
      maxConcurrency: provider.maxConcurrency,
    })
    if (!error) {
      setEnabled(nextEnabled)
      onToggle(nextEnabled)
    }
    return error
  }

  function changeEnabled(nextEnabled: boolean) {
    onRun(() => updateEnabled(nextEnabled), `${provider.provider} ${nextEnabled ? "enabled" : "disabled"}.`)
  }

  return (
    <article className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)]">
      <div className="flex items-center justify-between gap-4 px-4 py-3 transition hover:bg-[var(--app-surface-hover)]">
        <div className="flex min-w-0 items-center gap-3">
          <Toggle checked={enabled} disabled={pending} onChange={changeEnabled} ariaLabel={`${provider.provider} availability`} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-[var(--app-text)]">{provider.provider}</h2>
              <StatusBadge label={enabled ? "Enabled" : "Disabled"} tone={enabled ? "positive" : "negative"} />
              <QualityBadge quality={provider.dataQuality} />
            </div>
            {capabilities.length ? <p className="mt-1 text-[10px] text-[var(--app-text-faint)]">{capabilities.join(", ")}</p> : null}
          </div>
        </div>
        <button
          type="button"
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? "Collapse" : "Expand"} ${provider.provider}`}
          disabled={!canExpand}
          onClick={() => onToggle(!isExpanded)}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface)] hover:text-[var(--app-text)] disabled:cursor-not-allowed disabled:opacity-35"
        >
          <ChevronIcon expanded={isExpanded} />
        </button>
      </div>

      {isExpanded ? (
        <>
        <form action={(formData) => onRun(() => submit(formData), `${provider.provider} settings saved.`)} className="border-t border-[var(--app-border)] p-4">
          <fieldset disabled={!enabled} className="contents">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <label className={labelClass}>Quality</label>
                <select name="data_quality" defaultValue={provider.dataQuality} className={fieldClass}>
                  {(["high", "medium", "low", "unknown"] as DataQuality[]).map((quality) => <option key={quality} value={quality}>{quality}</option>)}
                </select>
              </div>
              <Field label="Concurrency" name="max_concurrency" type="number" min={1} defaultValue={provider.maxConcurrency} readOnly={!enabled} />
              <Field label="Batch size" name="max_batch_size" type="number" min={1} defaultValue={provider.maxBatchSize ?? ""} placeholder="single" readOnly={!enabled} />
              <Field label="Rate/min" name="rate_limit_per_min" type="number" min={1} defaultValue={provider.rateLimitPerMin ?? ""} placeholder="unset" readOnly={!enabled} />
            </div>
            <QualityMap provider={provider} />
            <div className="mt-4 flex justify-end">
              <button disabled={pending || !enabled} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{pending ? "Saving..." : "Save provider"}</button>
            </div>
          </fieldset>
        </form>
        <CadenceSection provider={provider.provider} cadence={cadence} pending={pending} onRun={onRun} />
        </>
      ) : null}
    </article>
  )
}

/** Human labels for the schedulable capabilities (feed-group representatives). */
const CAPABILITY_LABELS: Record<string, string> = {
  quotes: "Quotes & chart",
  earnings: "Events (earnings, actions, news)",
  fundamentals: "Fundamentals",
  analyst: "Analyst",
  fx: "FX rates",
}

/**
 * Per-capability refresh cadence for one provider: how often each feed is polled
 * (a freshness threshold — a listing is only re-fetched once its data is older
 * than this), plus the quotes save resolution (intraday points are downsampled to
 * at most one per this span). Each row saves independently.
 */
function CadenceSection({
  provider,
  cadence,
  pending,
  onRun,
}: {
  provider: string
  cadence: CapabilityRefreshView[]
  pending: boolean
  onRun: (action: () => Promise<string | null>, success: string) => void
}) {
  if (cadence.length === 0) return null
  const rows = [...cadence].sort((a, b) => a.capability.localeCompare(b.capability))
  return (
    <div className="border-t border-[var(--app-border)] p-4">
      <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--app-text-faint)]">Refresh cadence</h3>
      <p className="mb-3 text-[10px] text-[var(--app-text-faint)]">
        How often each feed is refreshed. Quotes also has a save resolution — the intraday series is downsampled to one stored point per that span. Chart is excluded (manual / backfill only).
      </p>
      <div className="space-y-2">
        {rows.map((row) => (
          <CadenceRow key={row.capability} provider={provider} row={row} pending={pending} onRun={onRun} />
        ))}
      </div>
    </div>
  )
}

function CadenceRow({
  provider,
  row,
  pending,
  onRun,
}: {
  provider: string
  row: CapabilityRefreshView
  pending: boolean
  onRun: (action: () => Promise<string | null>, success: string) => void
}) {
  const initialInterval = splitDuration(row.refreshIntervalMs)
  const initialResolution = row.saveResolutionMs === null ? null : splitDuration(row.saveResolutionMs)
  const [intervalValue, setIntervalValue] = useState(initialInterval.value)
  const [intervalUnit, setIntervalUnit] = useState(initialInterval.unit)
  const [resolutionValue, setResolutionValue] = useState(initialResolution?.value ?? 1)
  const [resolutionUnit, setResolutionUnit] = useState(initialResolution?.unit ?? "min")
  const [enabled, setEnabled] = useState(row.enabled)
  const isQuotes = row.capability === "quotes"

  function save() {
    const refreshIntervalMs = toMs(intervalValue, intervalUnit)
    const saveResolutionMs = isQuotes ? toMs(resolutionValue, resolutionUnit) : undefined
    onRun(
      () => updateCapabilityRefreshAction({ provider, capability: row.capability, refreshIntervalMs, saveResolutionMs, enabled }),
      `${provider} ${row.capability} cadence saved.`,
    )
  }

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2">
      <div className="min-w-[150px] flex-1">
        <span className="text-xs font-semibold text-[var(--app-text)]">{CAPABILITY_LABELS[row.capability] ?? row.capability}</span>
        <span className="ml-2 text-[10px] text-[var(--app-text-faint)]">{enabled ? "active" : "disabled"}</span>
      </div>
      <DurationField label="Every" value={intervalValue} unit={intervalUnit} onValue={setIntervalValue} onUnit={setIntervalUnit} />
      {isQuotes ? (
        <DurationField label="Save every" value={resolutionValue} unit={resolutionUnit} onValue={setResolutionValue} onUnit={setResolutionUnit} />
      ) : null}
      <label className="flex items-center gap-1.5 text-[10px] text-[var(--app-text-muted)]">
        <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-[var(--app-accent)]" />
        Enabled
      </label>
      <button type="button" disabled={pending} onClick={save} className="rounded-lg border border-[var(--app-border)] px-3 py-2 text-xs font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50">Save</button>
    </div>
  )
}

const DURATION_UNITS = [
  { key: "sec", ms: 1000, label: "sec" },
  { key: "min", ms: 60_000, label: "min" },
  { key: "hour", ms: 3_600_000, label: "hour" },
  { key: "day", ms: 86_400_000, label: "day" },
] as const

type DurationUnit = (typeof DURATION_UNITS)[number]["key"]

function DurationField({
  label,
  value,
  unit,
  onValue,
  onUnit,
}: {
  label: string
  value: number
  unit: DurationUnit
  onValue: (value: number) => void
  onUnit: (unit: DurationUnit) => void
}) {
  return (
    <div>
      <label className={labelClass}>{label}</label>
      <div className="flex gap-1">
        <input
          type="number"
          min={1}
          value={value}
          onChange={(event) => onValue(Math.max(1, Number.parseInt(event.target.value, 10) || 1))}
          className={`${fieldClass} w-20`}
        />
        <select value={unit} onChange={(event) => onUnit(event.target.value as DurationUnit)} className={`${fieldClass} w-20`}>
          {DURATION_UNITS.map((u) => <option key={u.key} value={u.key}>{u.label}</option>)}
        </select>
      </div>
    </div>
  )
}

/** Largest whole unit that divides `ms` evenly (so 3600000 → 1 hour, 90000 → 90 sec). */
function splitDuration(ms: number): { value: number; unit: DurationUnit } {
  for (const u of [...DURATION_UNITS].reverse()) {
    if (ms >= u.ms && ms % u.ms === 0) return { value: ms / u.ms, unit: u.key }
  }
  return { value: Math.max(1, Math.round(ms / 1000)), unit: "sec" }
}

function toMs(value: number, unit: DurationUnit): number {
  const found = DURATION_UNITS.find((u) => u.key === unit) ?? DURATION_UNITS[0]
  return Math.max(1, value) * found.ms
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className={`h-4 w-4 transition-transform ${expanded ? "rotate-180" : ""}`}>
      <path d="m5 8 5 5 5-5" />
    </svg>
  )
}

function QualityMap({ provider }: { provider: ProviderSettingsView }) {
  const entries = Object.entries(provider.capabilityQuality)
  if (entries.length === 0) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {entries.map(([capability, quality]) => <QualityBadge key={capability} label={capability} quality={quality ?? "unknown"} />)}
    </div>
  )
}

function QualityBadge({ quality, label }: { quality: DataQuality; label?: string }) {
  const tone = quality === "high" ? "positive" : quality === "medium" ? "warning" : quality === "low" ? "negative" : "neutral"
  return <StatusBadge label={label ? `${toTitleCase(label)}: ${toTitleCase(quality)}` : toTitleCase(quality)} tone={tone} />
}

function toTitleCase(value: string) {
  return value.charAt(0).toUpperCase() + value.slice(1)
}

function StatusBadge({ label, tone }: { label: string; tone: "positive" | "warning" | "negative" | "neutral" }) {
  const classes = {
    positive: "border-[color-mix(in_srgb,var(--app-positive)_32%,transparent)] bg-[color-mix(in_srgb,var(--app-positive)_12%,transparent)] text-[var(--app-positive)]",
    warning: "border-[color-mix(in_srgb,var(--app-warning)_36%,transparent)] bg-[color-mix(in_srgb,var(--app-warning)_14%,transparent)] text-[var(--app-warning)]",
    negative: "border-[color-mix(in_srgb,var(--app-negative)_34%,transparent)] bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] text-[var(--app-negative)]",
    neutral: "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)]",
  }[tone]
  return <span className={`rounded-full border px-2 py-1 text-[9px] font-semibold ${classes}`}>{label}</span>
}

function Toggle({ checked, disabled, onChange, ariaLabel }: { checked: boolean; disabled?: boolean; onChange: (checked: boolean) => void; ariaLabel: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex h-6 w-10 shrink-0 items-center justify-center rounded-full transition focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-soft)] disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className={`relative inline-block h-5 w-10 shrink-0 rounded-full transition ${checked ? "bg-[var(--app-positive)]" : "bg-[var(--app-surface-hover)]"}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0"}`} />
      </span>
    </button>
  )
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div><label className={labelClass}>{label}</label><input {...props} className={`${fieldClass} ${props.className ?? ""}`} /></div>
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[var(--app-text-faint)]"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>
}

function nullableInt(value: FormDataEntryValue | null): number | null {
  const raw = String(value ?? "").trim()
  if (!raw) return null
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

function positiveInt(value: FormDataEntryValue | null): number | null {
  const parsed = nullableInt(value)
  return parsed && parsed > 0 ? parsed : null
}
