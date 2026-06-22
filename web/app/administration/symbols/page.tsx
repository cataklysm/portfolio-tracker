import { redirect } from "next/navigation"
import { apiFetch, fetchMe } from "@/lib/api"
import { SymbolsAdministration } from "@/features/administration/symbols/components/SymbolsAdministration"
import type { AdminSymbolsPage } from "@/lib/types"

const initialSymbolsPage: AdminSymbolsPage = {
  items: [],
  total: 0,
  limit: 12,
  offset: 0,
  counts: { equity: 0, crypto: 0, fund: 0, index: 0 },
}

export default async function SymbolsAdministrationPage() {
  const me = await fetchMe()
  if (me?.role !== "admin") redirect("/dashboard")

  const symbolsResp = await apiFetch("/instruments/admin/symbols?asset_type=equity&limit=12&offset=0", { cache: "no-store" })
  const symbolsPage = symbolsResp.ok ? ((await symbolsResp.json()) as AdminSymbolsPage) : initialSymbolsPage

  return <SymbolsAdministration initialSymbolsPage={symbolsPage} exchanges={[]} providers={[]} />
}
