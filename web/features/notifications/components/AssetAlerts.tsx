"use client"

import Link from "next/link"
import { useActionState, useState, useTransition } from "react"
import {
  createAssetAlertAction,
  deleteAssetAlertAction,
  toggleAssetAlertAction,
} from "@/features/notifications/actions"
import { REPEAT_OPTIONS, repeatLabel } from "@/features/notifications/repeat"
import { fmtPriceAmount, num } from "@/lib/format"
import type { AlertRule, AlertRuleKind, NotificationItem, PriceTarget } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-xs text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
const labelClass = "mb-1 block text-[10px] font-medium text-[var(--app-text-faint)]"

interface Props {
  detailContext: string
  instrumentId: string
  listingId: string
  symbol: string
  currency: string
  assetType: string
  currentPrice: number | null
  locale: string
  rules: AlertRule[]
  priceTargets: PriceTarget[]
  notifications: NotificationItem[]
  notificationPreviewLimit?: number
}

export function AssetAlerts(props: Props) {
  const [open, setOpen] = useState(false)
  const [showAllNotifications, setShowAllNotifications] = useState(false)
  const previewLimit = props.notificationPreviewLimit ?? 5
  const visibleNotifications = showAllNotifications ? props.notifications : props.notifications.slice(0, previewLimit)

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">Configured alerts</p>
          {!open ? (
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="rounded-md border border-[var(--app-accent)]/40 bg-[var(--app-accent-soft)] px-2 py-1 text-[10px] font-semibold text-[var(--app-accent)]"
            >
              + Add alert
            </button>
          ) : null}
        </div>

        {open ? <CreateAlertForm {...props} onClose={() => setOpen(false)} /> : null}

        {props.rules.length === 0 ? (
          <p className="py-2 text-[11px] leading-4 text-[var(--app-text-faint)]">No alerts configured for this asset.</p>
        ) : (
          <ul className="space-y-2">
            {props.rules.map((rule) => <AlertRuleRow assetType={props.assetType} key={rule.id} rule={rule} detailContext={props.detailContext} currency={props.currency} locale={props.locale} />)}
          </ul>
        )}
      </div>

      <div className="border-t border-[var(--app-border)] pt-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">Recent notifications</p>
          <Link href="/notifications" className="text-[10px] font-semibold text-[var(--app-accent)] hover:underline">View all</Link>
        </div>
        {props.notifications.length === 0 ? (
          <p className="py-2 text-[11px] leading-4 text-[var(--app-text-faint)]">No notifications have fired for this asset.</p>
        ) : (
          <ul className="space-y-2">
            {visibleNotifications.map((notification) => (
              <li key={notification.id} className={`rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-2.5 ${notification.read_at ? "opacity-60" : ""}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${severityClass(notification.severity)}`} />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium leading-4 text-[var(--app-text)]">{notification.title}</p>
                    <p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">
                      {new Date(notification.created_at).toLocaleString(props.locale, { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
        {props.notifications.length > previewLimit ? (
          <button
            type="button"
            onClick={() => setShowAllNotifications((value) => !value)}
            className="mt-2 text-[10px] font-semibold text-[var(--app-accent)] hover:underline"
          >
            {showAllNotifications ? "Show recent only" : `Show all ${props.notifications.length} for this asset`}
          </button>
        ) : null}
      </div>
    </div>
  )
}

function CreateAlertForm({ assetType, detailContext, instrumentId, listingId, symbol, currency, currentPrice, locale, onClose, priceTargets }: Props & { onClose: () => void }) {
  const [kind, setKind] = useState<AlertRuleKind>("price_threshold")
  const [error, formAction, pending] = useActionState(
    createAssetAlertAction.bind(null, detailContext, instrumentId, listingId),
    null,
  )
  const showDirection = kind === "price_threshold" || kind === "cost_basis_move"
  const targetOptions = priceTargets.filter((target) => target.source === "own")

  return (
    <form action={formAction} className="mb-3 space-y-2.5 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold text-[var(--app-text)]">New {symbol} alert</p>
        <button type="button" onClick={onClose} className="text-[10px] text-[var(--app-text-faint)] hover:text-[var(--app-text)]">Close</button>
      </div>
      {error ? <p className="rounded-md bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] px-2 py-1.5 text-[10px] text-[var(--app-negative)]">{error}</p> : null}

      <div>
        <label htmlFor="asset-alert-kind" className={labelClass}>Alert type</label>
        <select id="asset-alert-kind" name="kind" value={kind} onChange={(event) => setKind(event.target.value as AlertRuleKind)} className={inputClass}>
          <option value="price_threshold">Price threshold</option>
          <option value="daily_move">Daily move</option>
          <option value="earnings_lead">Upcoming earnings</option>
          <option value="cost_basis_move">Move from cost basis</option>
          <option disabled={targetOptions.length === 0} value="target_zone">Price target zone{targetOptions.length === 0 ? " (no zones)" : ""}</option>
        </select>
      </div>

      {kind !== "target_zone" ? (
        <div className={`grid gap-2 ${showDirection ? "grid-cols-2" : ""}`}>
          {showDirection ? (
            <div>
              <label htmlFor="asset-alert-direction" className={labelClass}>Direction</label>
              <select id="asset-alert-direction" name="direction" defaultValue="above" className={inputClass}>
                <option value="above">Above</option>
                <option value="below">Below</option>
              </select>
            </div>
          ) : null}
          {kind === "price_threshold" ? <Field name="price" label={`Price (${currency})`} min="0.000001" defaultValue={currentPrice?.toString()} /> : null}
          {kind === "daily_move" ? <Field name="threshold_pct" label="Daily move (%)" min="0.1" defaultValue="5" /> : null}
          {kind === "earnings_lead" ? <Field name="days" label="Days before earnings" min="1" max="365" step="1" defaultValue="7" /> : null}
          {kind === "cost_basis_move" ? <Field name="threshold_pct" label="Move from cost (%)" min="0.1" defaultValue="10" /> : null}
        </div>
      ) : (
        <div>
          <label htmlFor="asset-alert-target" className={labelClass}>Target zone</label>
          <select id="asset-alert-target" name="target_id" defaultValue={targetOptions[0]?.id ?? ""} required className={inputClass}>
            {targetOptions.map((target) => (
              <option key={target.id} value={target.id}>{formatTarget(target, locale, assetType)}</option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label htmlFor="asset-alert-label" className={labelClass}>Label (optional)</label>
        <input id="asset-alert-label" name="label" maxLength={100} placeholder="e.g. Review position" className={inputClass} />
      </div>
      <div>
        <label htmlFor="asset-alert-repeat" className={labelClass}>When it triggers</label>
        <select id="asset-alert-repeat" name="repeat" defaultValue="once" className={inputClass}>
          {REPEAT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={pending} className="w-full rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50">
        {pending ? "Creating..." : "Create alert"}
      </button>
    </form>
  )
}

function Field({ name, label, ...props }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={`asset-alert-${name}`} className={labelClass}>{label}</label>
      <input id={`asset-alert-${name}`} name={name} type="number" step="any" required className={inputClass} {...props} />
    </div>
  )
}

function AlertRuleRow({ assetType, rule, detailContext, currency, locale }: { assetType: string; rule: AlertRule; detailContext: string; currency: string; locale: string }) {
  const [pending, startTransition] = useTransition()
  const description = describeRule(rule, currency, locale, assetType)

  return (
    <li className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[11px] font-medium text-[var(--app-text)]">{rule.label || description}</p>
          {rule.label ? <p className="mt-0.5 truncate text-[9px] text-[var(--app-text-faint)]">{description}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--app-text-faint)]" title={rule.notify_once ? "Fires once, then disables" : "Recurring alert"}>
            {repeatLabel(rule)}
          </span>
          <button
            type="button"
            disabled={pending}
            onClick={() => startTransition(async () => void (await toggleAssetAlertAction(detailContext, rule.id, !rule.enabled)))}
            className={`rounded-md border px-1.5 py-0.5 text-[9px] font-semibold disabled:opacity-50 ${rule.enabled ? "border-[var(--app-positive)]/40 text-[var(--app-positive)]" : "border-[var(--app-border)] text-[var(--app-text-faint)]"}`}
          >
            {rule.enabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            disabled={pending}
            aria-label="Delete alert"
            onClick={() => {
              if (confirm("Delete this alert?")) {
                startTransition(async () => void (await deleteAssetAlertAction(detailContext, rule.id)))
              }
            }}
            className="rounded-md border border-[var(--app-border)] px-1.5 py-0.5 text-[9px] text-[var(--app-text-faint)] hover:border-[var(--app-negative)]/40 hover:text-[var(--app-negative)] disabled:opacity-50"
          >
            x
          </button>
        </div>
      </div>
    </li>
  )
}

function describeRule(rule: AlertRule, currency: string, locale: string, assetType: string): string {
  const params = rule.params as Record<string, unknown>
  switch (rule.kind) {
    case "price_threshold": {
      const price = readRuleNumber(params.price)
      const value = price === null ? `${String(params.price)} ${currency}` : fmtPriceAmount(locale, price, currency, assetType)
      return `Price ${String(params.direction)} ${value}`
    }
    case "daily_move":
      return `Daily move at least ${String(params.threshold_pct)}%`
    case "earnings_lead":
      return `Earnings within ${String(params.days)} days`
    case "cost_basis_move":
      return `${String(params.direction)} ${String(params.threshold_pct)}% from cost`
    case "target_zone":
      return "Price enters selected target zone"
  }
}

function readRuleNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") return num(value)
  return null
}

function formatTarget(target: PriceTarget, locale: string, assetType: string): string {
  const lowValue = num(target.zone_low)
  const highValue = num(target.zone_high)
  const low = lowValue !== null ? fmtPriceAmount(locale, lowValue, target.currency, assetType) : null
  const high = highValue !== null ? fmtPriceAmount(locale, highValue, target.currency, assetType) : null
  const zone = low && high ? `${low} - ${high}` : low ? `from ${low}` : high ? `up to ${high}` : "open zone"
  return `${target.horizon.slice(0, 1).toUpperCase()}${target.horizon.slice(1)} - ${zone}`
}

function severityClass(severity: NotificationItem["severity"]): string {
  if (severity === "critical") return "bg-[var(--app-negative)]"
  if (severity === "warning") return "bg-[var(--app-warning)]"
  return "bg-[var(--app-accent)]"
}
