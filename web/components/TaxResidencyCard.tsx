"use client"
import { useState } from "react"
import { useRouter } from "next/navigation"
import { setTaxResidencyAction } from "@/app/settings/actions"
import type { TaxResidencyView } from "@/lib/types"

// A pragmatic subset of ISO 3166-1 alpha-2 codes for the residence selector.
const COUNTRIES: { code: string; name: string }[] = [
  { code: "DE", name: "Germany" },
  { code: "AT", name: "Austria" },
  { code: "CH", name: "Switzerland" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "BE", name: "Belgium" },
  { code: "ES", name: "Spain" },
  { code: "IT", name: "Italy" },
  { code: "IE", name: "Ireland" },
  { code: "LU", name: "Luxembourg" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "SG", name: "Singapore" },
]

const card =
  "relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]"

function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code
}

export function TaxResidencyCard({ residency }: { residency: TaxResidencyView }) {
  const router = useRouter()
  const current = residency.current
  const [country, setCountry] = useState(current?.country_code ?? "DE")
  const [validFrom, setValidFrom] = useState(new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    setSuccess(false)
    const result = await setTaxResidencyAction(new FormData(e.currentTarget))
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
      <h2 className="mb-1 text-sm font-semibold text-slate-300">Tax residence</h2>
      <p className="mb-4 text-xs text-slate-600">
        Your primary country of tax residence. This only controls jurisdiction-specific labels and disclosures — the
        tracker never calculates local tax. It is not inferred from your locale, currency, or broker.
      </p>

      {current ? (
        <div className="mb-4 rounded-xl border border-slate-700/40 bg-slate-900/50 px-3.5 py-2.5 text-sm text-slate-300">
          Currently <span className="font-semibold text-slate-100">{countryName(current.country_code)}</span> ({current.country_code}),
          effective from {current.valid_from}.
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-amber-500/20 bg-amber-950/30 px-3.5 py-2.5 text-sm text-amber-300">
          No tax residence recorded yet. Set one to enable after-tax reporting labels.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-500">Country</span>
            <select
              name="country_code"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/70 px-3.5 py-2.5 text-sm text-slate-200 outline-none transition focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20"
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>{c.name} ({c.code})</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs text-slate-500">Effective from</span>
            <input
              type="date"
              name="valid_from"
              value={validFrom}
              onChange={(e) => setValidFrom(e.target.value)}
              className="w-full rounded-xl border border-slate-700/50 bg-slate-900/70 px-3.5 py-2.5 text-sm text-slate-200 outline-none transition focus:border-sky-500/50 focus:ring-1 focus:ring-sky-500/20"
            />
          </label>
        </div>

        {error && <p className="rounded-lg border border-rose-500/20 bg-rose-950/40 px-4 py-2.5 text-sm text-rose-400">{error}</p>}
        {success && <p className="rounded-lg border border-emerald-500/20 bg-emerald-950/40 px-4 py-2.5 text-sm text-emerald-400">Tax residence updated.</p>}

        <button type="submit" disabled={saving} className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50">
          {saving ? "Saving…" : current ? "Change tax residence" : "Set tax residence"}
        </button>
      </form>

      {residency.history.length > 1 && (
        <div className="mt-4 border-t border-slate-700/40 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.08em] text-slate-600">History</p>
          <ul className="space-y-1 text-xs text-slate-500">
            {residency.history.map((row) => (
              <li key={row.id} className="flex justify-between gap-3">
                <span>{countryName(row.country_code)} ({row.country_code})</span>
                <span className="tabular-nums">{row.valid_from} → {row.valid_until ?? "present"}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
