"use client"

import type { TaxResidencyView } from "@/lib/types"

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

function countryName(code: string): string {
  return COUNTRIES.find((country) => country.code === code)?.name ?? code
}

export function TaxResidencyCard({
  residency,
  country,
  validFrom,
  onCountryChange,
  onValidFromChange,
}: {
  residency: TaxResidencyView
  country: string
  validFrom: string
  onCountryChange: (country: string) => void
  onValidFromChange: (date: string) => void
}) {
  const current = residency.current
  return (
    <section className="grid gap-4 border-t border-[var(--app-border)] px-5 py-5 lg:grid-cols-[190px_minmax(0,1fr)]">
      <div>
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Tax residence</h2>
        <p className="mt-1 text-[10px] leading-4 text-[var(--app-text-faint)]">
          Your confirmed tax jurisdiction. It is never inferred from locale, reporting currency, or broker.
        </p>
      </div>
      <div>
        {current ? (
          <div className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2.5 text-xs text-[var(--app-text-muted)]">
            Currently <span className="font-semibold text-[var(--app-text)]">{countryName(current.country_code)}</span> ({current.country_code}), effective from {current.valid_from}.
          </div>
        ) : (
          <div className="mb-4 rounded-lg border border-[color-mix(in_srgb,var(--app-warning)_30%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-warning)_10%,transparent)] px-3 py-2.5 text-xs text-[var(--app-warning)]">
            No tax residence recorded yet.
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Country</span>
            <select name="country_code" value={country} onChange={(event) => onCountryChange(event.target.value)} className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]">
              {COUNTRIES.map((item) => <option key={item.code} value={item.code}>{item.name} ({item.code})</option>)}
            </select>
          </label>
          <label>
            <span className="mb-1.5 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Effective from</span>
            <input name="valid_from" type="date" value={validFrom} onChange={(event) => onValidFromChange(event.target.value)} className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none focus:border-[var(--app-accent)]" />
          </label>
        </div>
        {residency.history.length > 1 ? (
          <div className="mt-4 border-t border-[var(--app-border)] pt-3">
            <p className="mb-2 text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">History</p>
            <ul className="space-y-1 text-[10px] text-[var(--app-text-muted)]">
              {residency.history.map((row) => <li key={row.id} className="flex justify-between gap-3"><span>{countryName(row.country_code)} ({row.country_code})</span><span className="tabular-nums">{row.valid_from} to {row.valid_until ?? "present"}</span></li>)}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  )
}
