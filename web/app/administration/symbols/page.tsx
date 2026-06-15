import { redirect } from "next/navigation"
import { apiFetch, fetchMe } from "@/lib/api"
import { SymbolsAdministration } from "@/components/SymbolsAdministration"
import type { AdminSymbolView, ExchangeView } from "@/lib/types"

export default async function SymbolsAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  const [symbolsResp, exchangesResp] = await Promise.all([
    apiFetch("/instruments/admin/symbols", { cache: "no-store" }),
    apiFetch("/exchanges", { cache: "no-store" }),
  ])
  const symbols = symbolsResp.ok ? ((await symbolsResp.json()) as AdminSymbolView[]) : []
  const exchanges = exchangesResp.ok ? ((await exchangesResp.json()) as ExchangeView[]) : []

  return <SymbolsAdministration symbols={symbols} exchanges={exchanges} />
}
