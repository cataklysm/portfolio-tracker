"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { updatePreferencesAction } from "./actions"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import type { MeData } from "@/lib/types"

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

const card =
  "relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]"
const pill = (active: boolean) =>
  `rounded-full border px-4 py-1.5 text-sm font-medium transition-all ${
    active
      ? "border-sky-400/60 bg-sky-500/15 text-sky-200 shadow-[0_0_10px_rgba(56,189,248,0.2)]"
      : "border-slate-700/50 bg-slate-800/60 text-slate-500 hover:border-slate-600/60 hover:text-slate-300"
  }`

export function SettingsForm({ me }: { me: MeData }) {
  const t = useTranslations()
  const router = useRouter()
  const [displayName, setDisplayName] = useState(me.display_name ?? "")
  const [reportingCurrency, setReportingCurrency] = useState(me.preferences.reporting_currency)
  const [accounting, setAccounting] = useState(me.preferences.realization_accounting_method)
  const [avatarColor, setAvatarColor] = useState(me.preferences.avatar_color)
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
    const result = await updatePreferencesAction(new FormData(e.currentTarget))
    setSaving(false)
    if ("error" in result) setError(result.error)
    else {
      setSuccess(true)
      router.refresh()
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="flex items-center gap-4">
        <div className={`flex h-16 w-16 items-center justify-center rounded-full border-2 text-xl font-bold ${avatarCls}`}>{initials}</div>
        <div>
          <p className="text-sm font-medium text-slate-300">{displayName || me.email.split("@")[0]}</p>
          <p className="text-xs text-slate-600">{me.email}</p>
        </div>
      </div>

      <div className={card}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <h2 className="mb-4 text-sm font-semibold text-slate-300">{t("settings.profile")}</h2>
        <label className="block">
          <span className="mb-1.5 block text-xs text-slate-500">{t("settings.displayName")}</span>
          <input
            type="text"
            name="display_name"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder={me.email.split("@")[0]}
            className="w-full rounded-xl border border-slate-700/50 bg-slate-900/70 px-3.5 py-2.5 text-sm text-slate-200 placeholder-slate-700 outline-none transition focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20"
          />
        </label>
      </div>

      <div className={card}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <h2 className="mb-1 text-sm font-semibold text-slate-300">{t("settings.reportingCurrency")}</h2>
        <p className="mb-4 text-xs text-slate-600">{t("settings.reportingCurrencyDesc")}</p>
        <input type="hidden" name="reporting_currency" value={reportingCurrency} />
        <div className="flex flex-wrap gap-2">
          {SUPPORTED_CURRENCIES.map((cur) => (
            <button key={cur} type="button" onClick={() => setReportingCurrency(cur)} className={pill(reportingCurrency === cur)}>
              {cur}
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <h2 className="mb-1 text-sm font-semibold text-slate-300">{t("settings.accountingMethod")}</h2>
        <p className="mb-4 text-xs text-slate-600">{t("settings.accountingMethodDesc")}</p>
        <input type="hidden" name="realization_accounting_method" value={accounting} />
        <div className="flex flex-wrap gap-2">
          {ACCOUNTING_METHODS.map((m) => (
            <button key={m.id} type="button" onClick={() => setAccounting(m.id)} className={pill(accounting === m.id)}>
              {t(m.labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div className={card}>
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
        <h2 className="mb-4 text-sm font-semibold text-slate-300">{t("settings.avatarColor")}</h2>
        <input type="hidden" name="avatar_color" value={avatarColor} />
        <div className="flex flex-wrap gap-3">
          {AVATAR_COLORS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setAvatarColor(c.id)}
              className={`h-9 w-9 rounded-full transition-all ${c.cls} ${
                avatarColor === c.id ? "scale-110 ring-2 ring-white/50 ring-offset-2 ring-offset-slate-900" : "opacity-50 hover:opacity-80"
              }`}
            />
          ))}
        </div>
      </div>

      {error && <p className="rounded-lg border border-rose-500/20 bg-rose-950/40 px-4 py-2.5 text-sm text-rose-400">{error}</p>}
      {success && <p className="rounded-lg border border-emerald-500/20 bg-emerald-950/40 px-4 py-2.5 text-sm text-emerald-400">{t("settings.saved")}</p>}
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50">
        {saving ? t("settings.saving") : t("settings.saveChanges")}
      </button>
    </form>
  )
}
