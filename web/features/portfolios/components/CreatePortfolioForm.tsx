"use client"
import { useActionState } from "react"
import { createPortfolioAction } from "@/features/portfolios/actions"
import { useTranslations } from "@/lib/i18n"

const inputClass =
  "w-full rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-600 transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"

export function CreatePortfolioForm() {
  const t = useTranslations()
  const [error, formAction, isPending] = useActionState(createPortfolioAction, null)

  return (
    <form action={formAction} className="w-full max-w-sm space-y-3">
      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-950/40 px-3 py-2.5 text-sm text-rose-400">{error}</p>
      )}
      <input name="name" placeholder={t("createPortfolio.namePlaceholder")} required maxLength={120} className={inputClass} />
      <button
        type="submit"
        disabled={isPending}
        className="w-full rounded-xl border border-sky-500/30 bg-sky-500/15 py-2.5 text-sm font-semibold text-sky-200 transition-all hover:border-sky-400/50 hover:bg-sky-500/20 disabled:opacity-40"
      >
        {isPending ? t("createPortfolio.creating") : t("createPortfolio.submit")}
      </button>
    </form>
  )
}
