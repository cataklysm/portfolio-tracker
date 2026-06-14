"use client"
import { useActionState, useState, useTransition } from "react"
import {
  createRuleAction,
  deleteRuleAction,
  toggleRuleAction,
} from "@/app/notifications/settings/actions"
import { useTranslations } from "@/lib/i18n"
import type { AlertRule, AlertRuleKind } from "@/lib/types"

export interface InstrumentOption {
  instrument_id: string
  listing_id: string
  name: string
  symbol: string
  currency: string
}

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-sm text-[var(--app-text)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
const labelClass = "mb-1 block text-[11px] text-[var(--app-text-faint)]"

const KIND_NEEDS_DIRECTION: AlertRuleKind[] = ["price_threshold", "cost_basis_move"]

interface Props {
  rules: AlertRule[]
  instruments: InstrumentOption[]
}

export function NotificationSettings({ rules, instruments }: Props) {
  return (
    <div className="space-y-6">
      <RulesCard rules={rules} instruments={instruments} />
    </div>
  )
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="border-b border-[var(--app-border)] px-4 py-3">
        <h2 className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">{title}</h2>
        <p className="mt-1 text-[11px] text-[var(--app-text-muted)]">{desc}</p>
      </div>
      <div className="p-4">{children}</div>
    </section>
  )
}

function RulesCard({ rules, instruments }: { rules: AlertRule[]; instruments: InstrumentOption[] }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const symbolFor = (id: string | null) => instruments.find((i) => i.instrument_id === id)?.name ?? id ?? "—"

  return (
    <Card title={t("notificationSettings.rulesTitle")} desc={t("notificationSettings.rulesDesc")}>
      {rules.length === 0 ? (
        <p className="text-sm text-[var(--app-text-faint)]">{t("notificationSettings.noRules")}</p>
      ) : (
        <ul className="mb-3 space-y-2">
          {rules.map((rule) => (
            <RuleRow key={rule.id} rule={rule} symbol={symbolFor(rule.instrument_id)} />
          ))}
        </ul>
      )}

      {open ? (
        <CreateRuleForm instruments={instruments} onClose={() => setOpen(false)} />
      ) : (
        <button onClick={() => setOpen(true)} className="rounded-lg border border-[var(--app-accent)]/40 bg-[var(--app-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--app-accent)] hover:opacity-90">
          + {t("notificationSettings.addRule")}
        </button>
      )}
    </Card>
  )
}

function describe(rule: AlertRule, symbol: string, t: ReturnType<typeof useTranslations>): string {
  const p = rule.params as Record<string, unknown>
  const target = rule.scope === "all_holdings" ? t("notificationSettings.scopeAll") : symbol
  switch (rule.kind) {
    case "price_threshold":
      return `${symbol} ${String(p.direction)} ${String(p.price)}`
    case "daily_move":
      return `${target} · daily move ≥ ${String(p.threshold_pct)}%`
    case "earnings_lead":
      return `${target} · earnings within ${String(p.days)}d`
    case "cost_basis_move":
      return `${target} · ${String(p.direction)} ${String(p.threshold_pct)}% from cost`
    case "target_zone":
      return `${target} · ${t("notificationSettings.kindTargetZone")}`
    default:
      return rule.kind
  }
}

function RuleRow({ rule, symbol }: { rule: AlertRule; symbol: string }) {
  const t = useTranslations()
  const [pending, start] = useTransition()
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2">
      <div className="min-w-0">
        <p className="truncate text-sm text-[var(--app-text)]">{rule.label || describe(rule, symbol, t)}</p>
        {rule.label && <p className="truncate text-[11px] text-[var(--app-text-faint)]">{describe(rule, symbol, t)}</p>}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          onClick={() => start(async () => void (await toggleRuleAction(rule.id, !rule.enabled)))}
          disabled={pending}
          className={`rounded-md border px-2 py-1 text-[10px] font-medium disabled:opacity-50 ${rule.enabled ? "border-[var(--app-positive)]/40 text-[var(--app-positive)]" : "border-[var(--app-border)] text-[var(--app-text-faint)]"}`}
        >
          {rule.enabled ? t("notificationSettings.on") : t("notificationSettings.off")}
        </button>
        <button
          onClick={() => { if (confirm(t("notificationSettings.delete") + "?")) start(async () => void (await deleteRuleAction(rule.id))) }}
          disabled={pending}
          className="rounded-md border border-[var(--app-border)] px-2 py-1 text-[10px] text-[var(--app-text-faint)] hover:border-[var(--app-negative)]/40 hover:text-[var(--app-negative)] disabled:opacity-50"
        >
          ✕
        </button>
      </div>
    </li>
  )
}

function CreateRuleForm({ instruments, onClose }: { instruments: InstrumentOption[]; onClose: () => void }) {
  const t = useTranslations()
  const [state, action, pending] = useActionState(createRuleAction, null)
  const [kind, setKind] = useState<AlertRuleKind>("price_threshold")
  const [scope, setScope] = useState<"instrument" | "all_holdings">("instrument")

  const needsInstrument = kind === "price_threshold" || scope === "instrument"
  const showScope = kind !== "price_threshold"
  const showDirection = KIND_NEEDS_DIRECTION.includes(kind)
  const error = state && "error" in state ? state.error : null

  return (
    <form action={action} className="space-y-3 rounded-xl border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-3">
      {error && <p className="rounded-lg bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] px-3 py-2 text-xs text-[var(--app-negative)]">{error}</p>}
      <div className="grid grid-cols-2 gap-2.5">
        <div>
          <label htmlFor="kind" className={labelClass}>{t("notificationSettings.kind")}</label>
          <select id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as AlertRuleKind)} className={inputClass}>
            <option value="price_threshold">{t("notificationSettings.kindPrice")}</option>
            <option value="daily_move">{t("notificationSettings.kindDaily")}</option>
            <option value="earnings_lead">{t("notificationSettings.kindEarnings")}</option>
            <option value="cost_basis_move">{t("notificationSettings.kindCost")}</option>
            <option value="target_zone">{t("notificationSettings.kindTargetZone")}</option>
          </select>
        </div>
        {showScope && (
          <div>
            <label htmlFor="scope" className={labelClass}>{t("notificationSettings.scope")}</label>
            <select id="scope" name="scope" value={scope} onChange={(e) => setScope(e.target.value as "instrument" | "all_holdings")} className={inputClass}>
              <option value="all_holdings">{t("notificationSettings.scopeAll")}</option>
              <option value="instrument">{t("notificationSettings.scopeInstrument")}</option>
            </select>
          </div>
        )}
      </div>

      {needsInstrument && (
        <div>
          <label htmlFor="instrument_id" className={labelClass}>{t("notificationSettings.instrument")}</label>
          <select id="instrument_id" name="instrument_id" className={inputClass} required>
            <option value="">—</option>
            {instruments.map((i) => (
              <option key={i.instrument_id} value={i.instrument_id} data-listing={i.listing_id}>
                {i.name} · {i.symbol} ({i.currency})
              </option>
            ))}
          </select>
        </div>
      )}

      {kind !== "target_zone" && (
        <div className="grid grid-cols-2 gap-2.5">
          {showDirection && (
            <div>
              <label htmlFor="direction" className={labelClass}>{t("notificationSettings.direction")}</label>
              <select id="direction" name="direction" className={inputClass} defaultValue="above">
                <option value="above">{t("notificationSettings.above")}</option>
                <option value="below">{t("notificationSettings.below")}</option>
              </select>
            </div>
          )}
          {kind === "price_threshold" && (
            <Field name="price" label={t("notificationSettings.price")} type="number" step="any" min="0" />
          )}
          {kind === "daily_move" && (
            <Field name="threshold_pct" label={t("notificationSettings.thresholdPct")} type="number" step="0.1" min="0.1" />
          )}
          {kind === "earnings_lead" && (
            <Field name="days" label={t("notificationSettings.days")} type="number" step="1" min="1" max="365" />
          )}
          {kind === "cost_basis_move" && (
            <Field name="threshold_pct" label={t("notificationSettings.thresholdPct")} type="number" step="0.1" />
          )}
        </div>
      )}

      <div>
        <label htmlFor="label" className={labelClass}>{t("notificationSettings.label")}</label>
        <input id="label" name="label" className={inputClass} maxLength={100} />
      </div>

      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {pending ? t("notificationSettings.creating") : t("notificationSettings.create")}
        </button>
        <button type="button" onClick={onClose} className="text-xs text-[var(--app-text-faint)] hover:text-[var(--app-text)]">
          {t("notificationSettings.cancel")}
        </button>
      </div>
    </form>
  )
}

function Field({ name, label, ...rest }: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label htmlFor={name} className={labelClass}>{label}</label>
      <input id={name} name={name} required className={inputClass} {...rest} />
    </div>
  )
}
