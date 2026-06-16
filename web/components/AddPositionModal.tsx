"use client"

import { useState } from "react"
import { useTranslations } from "@/lib/i18n"
import type { ExchangeView, Portfolio } from "@/lib/types"
import { AddPositionForm } from "./AddPositionForm"

interface Props {
  portfolios: Portfolio[]
  exchanges: ExchangeView[]
  selectedPortfolioId?: string
  className?: string
  label?: string
}

export function AddPositionModal({ portfolios, exchanges, selectedPortfolioId, className, label }: Props) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const redirectTo = selectedPortfolioId ? `/dashboard?portfolio=${selectedPortfolioId}` : "/dashboard"

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {label ?? t("nav.addPosition")}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4 py-6" onClick={(event) => event.target === event.currentTarget && setOpen(false)}>
          <div className="app-panel max-h-full w-full max-w-xl overflow-y-auto rounded-2xl p-5 shadow-2xl">
            <div className="mb-4 flex items-center justify-between gap-4">
              <h2 className="text-sm font-semibold text-[var(--app-text)]">{t("addPosition.title")}</h2>
              <button type="button" onClick={() => setOpen(false)} className="rounded-md px-2 py-1 text-[var(--app-text-faint)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]" aria-label={t("common.cancel")}>
                ×
              </button>
            </div>
            <AddPositionForm portfolios={portfolios} exchanges={exchanges} defaultPortfolioId={selectedPortfolioId} redirectTo={redirectTo} />
          </div>
        </div>
      ) : null}
    </>
  )
}
