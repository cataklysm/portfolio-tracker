"use client"
import { useState } from "react"
import { deletePositionAction } from "@/app/positions/[id]/actions"
import { useTranslations } from "@/lib/i18n"

export function DeletePositionButton({ positionId }: { positionId: string }) {
  const t = useTranslations()
  const [confirming, setConfirming] = useState(false)
  const action = deletePositionAction.bind(null, positionId)

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-lg border border-rose-500/30 px-3 py-1.5 text-sm text-rose-400 hover:border-rose-500/50 hover:bg-rose-950/30"
      >
        {t("deletePosition.delete")}
      </button>
    )
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <span className="text-xs text-[var(--app-text-muted)]">{t("deletePosition.confirm")}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md px-2 py-1 text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
        {t("common.cancel")}
      </button>
      <button type="submit" className="rounded-md bg-rose-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-600">
        {t("deletePosition.confirmDelete")}
      </button>
    </form>
  )
}
