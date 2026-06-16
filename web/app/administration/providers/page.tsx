import { redirect } from "next/navigation"
import { apiFetch, fetchMe } from "@/lib/api"
import { ProvidersAdministration } from "@/components/ProvidersAdministration"
import type { ProviderSettingsView } from "@/lib/types"

export default async function ProvidersAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  const providersResp = await apiFetch("/admin/providers", { cache: "no-store" })
  const providerBody = providersResp.ok ? ((await providersResp.json()) as { providers: ProviderSettingsView[] }) : { providers: [] }

  return <ProvidersAdministration providers={providerBody.providers} />
}
