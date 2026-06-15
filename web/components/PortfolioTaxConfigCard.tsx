"use client"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { TaxSettingsForm, taxSettingsDefaults } from "./TaxSettingsForm"
import { savePortfolioTaxSettingsAction } from "@/app/settings/tax-actions"
import type { PortfolioTaxSettings, TaxRule } from "@/lib/types"

const RULE_LABEL: Record<string, string> = {
  de_securities_tax: "German securities (equity)",
  de_crypto_private_disposal: "German crypto (private disposal)",
}

const FIELD =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-[12px] text-[var(--app-text)] outline-none focus:ring-1 focus:ring-[var(--app-accent)]"

/**
 * Configures one portfolio's tax treatment: which rule governs it and the
 * settings that rule's schema defines (e.g. automatic withholding, exemption
 * orders for securities). Shown when a single portfolio is selected.
 */
export function PortfolioTaxConfigCard({
  portfolio,
  rules,
  current,
}: {
  portfolio: { id: string; name: string }
  rules: TaxRule[]
  current: PortfolioTaxSettings | null
}) {
  const router = useRouter()
  const [ruleKey, setRuleKey] = useState<string>(current?.tax_rule_key ?? "")
  const [valuesByRule, setValuesByRule] = useState<Record<string, Record<string, unknown>>>(
    current?.tax_rule_key ? { [current.tax_rule_key]: current.tax_settings ?? {} } : {},
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const rule = useMemo(() => rules.find((r) => r.rule_key === ruleKey) ?? null, [rules, ruleKey])
  const values = rule ? (valuesByRule[rule.rule_key] ?? taxSettingsDefaults(rule.portfolio_settings_schema)) : {}

  function selectRule(key: string) {
    setRuleKey(key)
    const r = rules.find((x) => x.rule_key === key)
    if (r && valuesByRule[key] === undefined) {
      const seed = key === current?.tax_rule_key ? current.tax_settings : undefined
      setValuesByRule((prev) => ({ ...prev, [key]: taxSettingsDefaults(r.portfolio_settings_schema, seed) }))
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    setSuccess(false)
    const result = await savePortfolioTaxSettingsAction(portfolio.id, ruleKey || null, ruleKey ? values : {})
    setSaving(false)
    if ("error" in result) setError(result.error)
    else {
      setSuccess(true)
      router.refresh()
    }
  }

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="border-b border-[var(--app-border)] px-4 py-3">
        <h2 className="text-xs font-semibold text-[var(--app-text)]">Portfolio tax configuration</h2>
        <p className="mt-0.5 text-[10px] text-[var(--app-text-faint)]">
          {portfolio.name} — choose the rule that governs this portfolio and its settings.
        </p>
      </div>

      <div className="space-y-3 px-4 py-3">
        <label className="block">
          <span className="mb-1 block text-[10px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">Tax rule</span>
          <select className={FIELD} value={ruleKey} onChange={(e) => selectRule(e.target.value)}>
            <option value="">None (no estimate)</option>
            {rules.map((r) => (
              <option key={r.rule_key} value={r.rule_key}>
                {RULE_LABEL[r.rule_key] ?? r.rule_key}
              </option>
            ))}
          </select>
        </label>

        {rule && (
          <TaxSettingsForm
            schema={rule.portfolio_settings_schema}
            value={values}
            onChange={(next) => setValuesByRule((prev) => ({ ...prev, [rule.rule_key]: next }))}
          />
        )}

        {error && <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-[11px] text-rose-400">{error}</p>}
        {success && <p className="rounded-lg bg-emerald-950/50 px-3 py-2 text-[11px] text-emerald-400">Saved.</p>}

        <button
          onClick={save}
          disabled={saving}
          className="rounded-md bg-sky-600 px-3 py-1.5 text-[11px] font-semibold text-white transition hover:bg-sky-500 disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save configuration"}
        </button>
      </div>
    </section>
  )
}
