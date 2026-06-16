import { redirect } from "next/navigation"
import { apiFetch, fetchMe } from "@/lib/api"
import { ExchangeAdministration } from "@/components/ExchangeAdministration"
import type { ExchangeView } from "@/lib/types"

export default async function ExchangesAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  const exchangesResp = await apiFetch("/exchanges", { cache: "no-store" })
  const exchanges = exchangesResp.ok ? ((await exchangesResp.json()) as ExchangeView[]) : []

  return <ExchangeAdministration exchanges={exchanges} />
}
