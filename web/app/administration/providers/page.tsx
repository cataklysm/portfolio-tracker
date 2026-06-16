import { redirect } from "next/navigation"
import { apiFetch, fetchMe } from "@/lib/api"
import { ProvidersAdministration } from "@/components/ProvidersAdministration"
import type { CapabilityRefreshView, ProviderSettingsView } from "@/lib/types"

export default async function ProvidersAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  const [providersResp, cadenceResp] = await Promise.all([
    apiFetch("/admin/providers", { cache: "no-store" }),
    apiFetch("/admin/providers/capability-refresh", { cache: "no-store" }),
  ])
  const providerBody = providersResp.ok ? ((await providersResp.json()) as { providers: ProviderSettingsView[] }) : { providers: [] }
  const cadence = cadenceResp.ok ? ((await cadenceResp.json()) as { settings: CapabilityRefreshView[] }).settings : []

  return <ProvidersAdministration providers={providerBody.providers} capabilityRefresh={cadence} />
}
