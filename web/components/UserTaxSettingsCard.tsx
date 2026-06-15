"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { TaxSettingsForm, taxSettingsDefaults } from "./TaxSettingsForm"
import { saveUserTaxSettingsAction } from "@/app/settings/tax-actions"
import type { TaxSettingsSchema } from "@/lib/types"

const card =
  "relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]"

/**
 * Residence-level tax settings (e.g. church tax, tax currency), rendered entirely
 * from the active tax rule's `userTaxSettingsSchema`. Values are validated again
 * server-side. These are calculation inputs only — residence itself is set above.
 */
export function UserTaxSettingsCard({
  country,
  schema,
  current,
}: {
  country: string | null
  schema: TaxSettingsSchema | null
  current: Record<string, unknown>
}) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, unknown>>(schema ? taxSettingsDefaults(schema, current) : {})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function save() {
    if (!country) return
    setSaving(true)
    setError(null)
    setSuccess(false)
    const result = await saveUserTaxSettingsAction(country, values)
    setSaving(false)
    if ("error" in result) setError(result.error)
    else {
      setSuccess(true)
      router.refresh()
    }
  }

  return (
    <div className={card}>
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
      <h2 className="mb-1 text-sm font-semibold text-slate-300">Tax settings</h2>
      <p className="mb-4 text-xs text-slate-600">
        Inputs used for tax estimates in your residence. Estimates only — never tax advice.
      </p>

      {!country ? (
        <p className="rounded-xl border border-amber-500/20 bg-amber-950/30 px-3.5 py-2.5 text-sm text-amber-300">
          Set your tax residence above to configure tax settings.
        </p>
      ) : !schema ? (
        <p className="rounded-xl border border-slate-700/40 bg-slate-900/50 px-3.5 py-2.5 text-sm text-slate-400">
          Tax settings are not available for residence {country} yet.
        </p>
      ) : (
        <div className="space-y-3">
          <TaxSettingsForm schema={schema} value={values} onChange={setValues} />
          {error && <p className="rounded-lg border border-rose-500/20 bg-rose-950/40 px-4 py-2.5 text-sm text-rose-400">{error}</p>}
          {success && <p className="rounded-lg border border-emerald-500/20 bg-emerald-950/40 px-4 py-2.5 text-sm text-emerald-400">Tax settings saved.</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save tax settings"}
          </button>
        </div>
      )}
    </div>
  )
}
