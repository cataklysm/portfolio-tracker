import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { AddPositionForm } from "@/components/AddPositionForm"
import { CreatePortfolioForm } from "@/components/CreatePortfolioForm"
import { getTranslations } from "@/lib/i18n"
import type { ExchangeView, Portfolio } from "@/lib/types"

export default async function AddPositionPage() {
  const t = getTranslations()
  const [portfoliosResp, exchangesResp] = await Promise.all([
    apiFetch("/portfolios", { cache: "no-store" }),
    apiFetch("/exchanges", { cache: "no-store" }),
  ])
  const portfolios = (await portfoliosResp.json()) as Portfolio[]
  const exchanges = (await exchangesResp.json()) as ExchangeView[]

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <Link href="/dashboard" className="mb-4 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-white">
        {t("common.backToPortfolio")}
      </Link>
      <h1 className="mb-6 text-2xl font-bold tracking-tight text-white">{t("addPosition.title")}</h1>

      <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]">
        <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
        {portfolios.length === 0 ? (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <p className="text-sm text-slate-400">{t("addPosition.createPortfolioFirst")}</p>
            <CreatePortfolioForm />
          </div>
        ) : (
          <AddPositionForm portfolios={portfolios} exchanges={exchanges} />
        )}
      </div>
    </div>
  )
}
