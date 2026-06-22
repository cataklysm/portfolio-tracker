import { redirect } from "next/navigation"
import { fetchMe } from "@/lib/api"
import { ProvidersAdministration } from "@/features/administration/providers/components/ProvidersAdministration"

export default async function ProvidersAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  return <ProvidersAdministration providers={[]} capabilityRefresh={[]} />
}
