import { apiFetch } from "@/lib/api"
import { SettingsForm } from "./SettingsForm"
import { ApiTokensSection } from "@/components/ApiTokensSection"
import { TaxResidencyCard } from "@/components/TaxResidencyCard"
import { getTranslations } from "@/lib/i18n"
import type { ApiToken, MeData, TaxResidencyView } from "@/lib/types"

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

  return (
    <div className="mx-auto max-w-xl px-4 py-8">
      <header className="mb-8">
        <h1 className="text-2xl font-bold tracking-tight text-white">{t("settings.title")}</h1>
        <p className="mt-1 text-xs text-slate-600">{t("settings.subtitle")}</p>
      </header>
      <div className="space-y-6">
        <SettingsForm me={me} />
        <TaxResidencyCard residency={residency} />
        <ApiTokensSection tokens={tokens} availableScopes={availableScopes} />
      </div>
    </div>
  )
}
