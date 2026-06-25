"use client"
import { useState } from "react"
import { deletePositionAction } from "@/features/positions/actions"
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
        className="rounded-md border border-[color-mix(in_srgb,var(--app-negative)_36%,var(--app-border))] px-3 py-1.5 text-[12px] font-semibold text-[var(--app-negative)] transition hover:bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)]"
      >
        {t("deletePosition.delete")}
      </button>
    )
  }

  return (
    <form action={action} className="flex items-center gap-2">
      <span className="text-xs text-[var(--app-text-muted)]">{t("deletePosition.confirm")}</span>
      <button type="button" onClick={() => setConfirming(false)} className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs font-semibold text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
        {t("common.cancel")}
      </button>
      <button type="submit" className="rounded-md border border-[color-mix(in_srgb,var(--app-negative)_36%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_18%,transparent)] px-2.5 py-1 text-xs font-semibold text-[var(--app-negative)] hover:bg-[color-mix(in_srgb,var(--app-negative)_24%,transparent)]">
        {t("deletePosition.confirmDelete")}
      </button>
    </form>
  )
}
