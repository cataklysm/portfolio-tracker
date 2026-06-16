import { redirect } from "next/navigation"
import { apiFetch, fetchMe } from "@/lib/api"
import { SymbolsAdministration } from "@/components/SymbolsAdministration"
import type { AdminSymbolView, ExchangeView, ProviderSettingsView } from "@/lib/types"

export default async function SymbolsAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  const [symbolsResp, exchangesResp, providersResp] = await Promise.all([
    apiFetch("/instruments/admin/symbols", { cache: "no-store" }),
    apiFetch("/exchanges", { cache: "no-store" }),
    apiFetch("/admin/providers", { cache: "no-store" }),
  ])
  const symbols = symbolsResp.ok ? ((await symbolsResp.json()) as AdminSymbolView[]) : []
  const exchanges = exchangesResp.ok ? ((await exchangesResp.json()) as ExchangeView[]) : []
  const providers = providersResp.ok
    ? ((await providersResp.json()) as { providers: ProviderSettingsView[] }).providers
    : []

  return <SymbolsAdministration symbols={symbols} exchanges={exchanges} providers={providers} />
}
