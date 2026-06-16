import { apiFetch } from "@/lib/api"
import { SettingsForm } from "./SettingsForm"
import { ApiTokensSection } from "@/components/ApiTokensSection"
import { getTranslations } from "@/lib/i18n"
import type { ApiToken, MeData, TaxRule, TaxResidencyView, TaxSettingsSchema, UserTaxSettings } from "@/lib/types"

function withoutDerivedFields(schema: TaxSettingsSchema | null): TaxSettingsSchema | null {
  return schema ? { ...schema, fields: schema.fields.filter((field) => field.key !== "taxCurrency") } : null
}

export default async function SettingsPage() {
  const t = getTranslations()
  const [resp, tokensResp, scopesResp, residencyResp] = await Promise.all([
    apiFetch("/me", { cache: "no-store" }),
    apiFetch("/me/api-tokens", { cache: "no-store" }),
    apiFetch("/me/api-tokens/scopes", { cache: "no-store" }),
    apiFetch("/tax-residency", { cache: "no-store" }),
  ])
  const me = (await resp.json()) as MeData
  const tokens = tokensResp.ok ? ((await tokensResp.json()) as ApiToken[]) : []
  const availableScopes = scopesResp.ok ? ((await scopesResp.json()) as { scopes: string[] }).scopes : []
  const residency = residencyResp.ok
    ? ((await residencyResp.json()) as TaxResidencyView)
    : { current: null, history: [] }

  // The user tax-settings schema is residence-level: any current rule for the
  // residence supplies it. Saved values come from the portfolio service.
  const country = residency.current?.country_code ?? null
  const [rulesResp, taxSettingsResp] = await Promise.all([
    country ? apiFetch(`/tax-rules?country=${country}`, { cache: "no-store" }) : Promise.resolve(null),
    apiFetch("/tax-settings", { cache: "no-store" }),
  ])
  const rules = rulesResp?.ok ? ((await rulesResp.json()) as TaxRule[]) : []
  const userTaxSettings = taxSettingsResp.ok ? ((await taxSettingsResp.json()) as UserTaxSettings | null) : null

  return (
    <div className="mx-auto max-w-[1320px] px-3 py-4 sm:px-5 sm:py-6">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">{t("settings.title")}</h1>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">{t("settings.subtitle")}</p>
        </div>
        <div className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-right">
          <p className="text-[9px] font-semibold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">Signed in as</p>
          <p className="mt-0.5 text-xs font-medium text-[var(--app-text)]">{me.email}</p>
        </div>
      </header>
      <div className="space-y-4">
        <SettingsForm
          me={me}
          residency={residency}
          taxSettingsCountry={country}
          taxSettingsSchema={withoutDerivedFields(rules[0]?.user_settings_schema ?? null)}
          currentTaxSettings={userTaxSettings?.settings ?? {}}
        />
        <ApiTokensSection tokens={tokens} availableScopes={availableScopes} />
      </div>
    </div>
  )
}
