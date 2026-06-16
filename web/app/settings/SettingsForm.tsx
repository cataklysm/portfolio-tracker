"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { saveSettingsAction } from "./actions"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import type { MeData, TaxResidencyView, TaxSettingsSchema } from "@/lib/types"
import { TaxResidencyCard } from "@/components/TaxResidencyCard"
import { TaxSettingsForm, taxSettingsDefaults } from "@/components/TaxSettingsForm"

const SUPPORTED_CURRENCIES = ["EUR", "USD", "GBP", "CHF", "JPY", "AUD", "CAD"]

const ACCOUNTING_METHODS: { id: MeData["preferences"]["realization_accounting_method"]; labelKey: MessageKey }[] = [
  { id: "fifo", labelKey: "settings.fifo" },
  { id: "lifo", labelKey: "settings.lifo" },
  { id: "average_cost", labelKey: "settings.averageCost" },
]

const AVATAR_COLORS = [
  { id: "sky", cls: "bg-sky-500" },
  { id: "violet", cls: "bg-violet-500" },
  { id: "emerald", cls: "bg-emerald-500" },
  { id: "amber", cls: "bg-amber-500" },
  { id: "rose", cls: "bg-rose-500" },
  { id: "orange", cls: "bg-orange-500" },
  { id: "cyan", cls: "bg-cyan-500" },
]

const AVATAR_BG: Record<string, string> = {
  sky: "bg-sky-500/20 text-sky-300 border-sky-500/30",
  violet: "bg-violet-500/20 text-violet-300 border-violet-500/30",
  emerald: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
  amber: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  rose: "bg-rose-500/20 text-rose-300 border-rose-500/30",
  orange: "bg-orange-500/20 text-orange-300 border-orange-500/30",
  cyan: "bg-cyan-500/20 text-cyan-300 border-cyan-500/30",
}

function getInitials(displayName: string | null, email: string): string {
  if (displayName) {
    const parts = displayName.trim().split(/\s+/)
    if (parts.length >= 2) return `${parts[0]![0]}${parts[1]![0]}`.toUpperCase()
    return displayName.slice(0, 2).toUpperCase()
  }
  return email.slice(0, 2).toUpperCase()
}

const pill = (active: boolean) =>
  `rounded-lg border px-3 py-2 text-xs font-semibold transition ${
    active
      ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
      : "border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
  }`

export function SettingsForm({
  me,
  residency,
  taxSettingsCountry,
  taxSettingsSchema,
  currentTaxSettings,
}: {
  me: MeData
  residency: TaxResidencyView
  taxSettingsCountry: string | null
  taxSettingsSchema: TaxSettingsSchema | null
  currentTaxSettings: Record<string, unknown>
}) {
  const t = useTranslations()
  const router = useRouter()
  const [displayName, setDisplayName] = useState(me.display_name ?? "")
  const [reportingCurrency, setReportingCurrency] = useState(me.preferences.reporting_currency)
  const [accounting, setAccounting] = useState(me.preferences.realization_accounting_method)
  const [avatarColor, setAvatarColor] = useState(me.preferences.avatar_color)
  const [country, setCountry] = useState(residency.current?.country_code ?? "DE")
  const [validFrom, setValidFrom] = useState(residency.current?.valid_from ?? new Date().toISOString().slice(0, 10))
  const [taxSettings, setTaxSettings] = useState<Record<string, unknown>>(taxSettingsSchema ? taxSettingsDefaults(taxSettingsSchema, currentTaxSettings) : {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const initials = getInitials(displayName || null, me.email)
  const avatarCls = AVATAR_BG[avatarColor] ?? AVATAR_BG["sky"]!

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    const result = await saveSettingsAction(taxSettings, new FormData(e.currentTarget))
    setSaving(false)
    if ("error" in result) setError(result.error)
    else {
      setSuccess(true)
      router.refresh()
    }
  }

  return (
    <div className="app-panel overflow-hidden rounded-xl">
      <div className="flex items-center gap-4 border-b border-[var(--app-border)] bg-[var(--app-surface-raised)] px-5 py-5">
        <div className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border text-xl font-bold shadow-sm ${avatarCls}`}>{initials}</div>
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-[var(--app-text)]">{displayName || me.email.split("@")[0]}</p>
          <p className="mt-0.5 truncate text-xs text-[var(--app-text-muted)]">{me.email}</p>
          <p className="mt-2 text-[10px] text-[var(--app-text-faint)]">Your identity and portfolio calculation defaults</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
      <input type="hidden" name="current_country_code" value={residency.current?.country_code ?? ""} />
      <input type="hidden" name="current_valid_from" value={residency.current?.valid_from ?? ""} />
      <input type="hidden" name="tax_settings_country" value={taxSettingsCountry ?? ""} />
      <SettingSection title={t("settings.profile")} detail="Used throughout the application and in account menus.">
        <label className="block">
          <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{t("settings.displayName")}</span>
          <input
            type="text"
            name="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={me.email.split("@")[0]}
            className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2.5 text-sm text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-text-faint)] focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
          />
        </label>
      </SettingSection>

      <SettingSection title={t("settings.avatarColor")} detail="Choose the accent used for your account avatar.">
        <input type="hidden" name="avatar_color" value={avatarColor} />
        <div className="flex flex-wrap gap-3">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAvatarColor(c.id)}
              className={`h-8 w-8 rounded-lg transition ${c.cls} ${
                avatarColor === c.id ? "ring-2 ring-[var(--app-accent)] ring-offset-2 ring-offset-[var(--app-surface)]" : "opacity-45 hover:opacity-80"
              }`}
              aria-label={`${c.id} avatar color`}
            />
          ))}
        </div>
      </SettingSection>

      <SettingSection title={t("settings.accountingMethod")} detail={t("settings.accountingMethodDesc")}>
        <input type="hidden" name="realization_accounting_method" value={accounting} />
        <div className="grid gap-2 sm:grid-cols-3">
          {ACCOUNTING_METHODS.map((m) => (
            <button key={m.id} type="button" onClick={() => setAccounting(m.id)} className={pill(accounting === m.id)}>
              {t(m.labelKey)}
            </button>
          ))}
        </div>
      </SettingSection>

      <SettingSection title={t("settings.reportingCurrency")} detail={t("settings.reportingCurrencyDesc")}>
        <input type="hidden" name="reporting_currency" value={reportingCurrency} />
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SUPPORTED_CURRENCIES.map((cur) => (
            <button key={cur} type="button" onClick={() => setReportingCurrency(cur)} className={pill(reportingCurrency === cur)}>
              {cur}
            </button>
          ))}
        </div>
      </SettingSection>

      <TaxResidencyCard residency={residency} country={country} validFrom={validFrom} onCountryChange={setCountry} onValidFromChange={setValidFrom} />

      <SettingSection title="Tax specific settings" detail="Inputs specific to your residence. Tax currency is derived automatically.">
        {country !== taxSettingsCountry ? (
          <p className="rounded-lg border border-[color-mix(in_srgb,var(--app-warning)_30%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-warning)_10%,transparent)] px-3 py-2.5 text-xs text-[var(--app-warning)]">
            Save the new tax residence first to load its available tax settings.
          </p>
        ) : !taxSettingsSchema ? (
          <p className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2.5 text-xs text-[var(--app-text-muted)]">
            Tax settings are not available for residence {country} yet.
          </p>
        ) : (
          <TaxSettingsForm schema={taxSettingsSchema} value={taxSettings} onChange={setTaxSettings} />
        )}
      </SettingSection>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--app-border)] bg-[var(--app-surface-raised)] px-5 py-4">
        <div>
          {error && <p className="text-xs text-[var(--app-negative)]">{error}</p>}
          {success && <p className="text-xs text-[var(--app-positive)]">{t("settings.saved")}</p>}
          {!error && !success ? <p className="text-[10px] text-[var(--app-text-faint)]">One save applies all profile and tax settings.</p> : null}
        </div>
        <button type="submit" disabled={saving} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">
          {saving ? t("settings.saving") : t("settings.saveChanges")}
        </button>
      </div>
      </form>
    </div>
  )
}

function SettingSection({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-4 border-b border-[var(--app-border)] px-5 py-5 last:border-b-0 lg:grid-cols-[190px_minmax(0,1fr)]">
      <div>
        <h2 className="text-xs font-semibold text-[var(--app-text)]">{title}</h2>
        <p className="mt-1 text-[10px] leading-4 text-[var(--app-text-faint)]">{detail}</p>
      </div>
      <div>{children}</div>
    </section>
  )
}
