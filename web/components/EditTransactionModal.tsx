"use client"
import { useActionState, useEffect, useRef, useState } from "react"
import { updateTransactionAction, deleteTransactionAction } from "@/app/positions/[id]/actions"
import { useTranslations } from "@/lib/i18n"
import type { TransactionView } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] text-sm"
const labelClass = "mb-1 block text-xs text-[var(--app-text-faint)]"

interface Props {
  positionId: string
  currency: string
  transaction: TransactionView
}

export function EditTransactionModal({ positionId, currency, transaction: tx }: Props) {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saveError, saveAction, saving] = useActionState(
    updateTransactionAction.bind(null, positionId, tx.id),
    null,
  )
  const [deleteError, deleteAction, deleting] = useActionState(
    deleteTransactionAction.bind(null, positionId, tx.id),
    null,
  )
  const prevSaving = useRef(false)

  useEffect(() => {
    if (prevSaving.current && !saving && !saveError) setIsOpen(false)
    prevSaving.current = saving
  }, [saving, saveError])

  const dateValue = tx.effective_at.slice(0, 10)

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="rounded-md px-2 py-1 text-xs text-[var(--app-text-faint)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
        title={t("transactions.editTitle")}
      >
        {t("transactions.edit")}
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}>
          <div className="app-panel max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--app-text)]">{t("transactionModal.editTitle")}</h3>
              <button onClick={() => setIsOpen(false)} className="text-[var(--app-text-faint)] hover:text-[var(--app-text)]">×</button>
            </div>

            <form action={saveAction} className="space-y-3">
              {saveError && <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{saveError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`e-side-${tx.id}`} className={labelClass}>{t("transactionModal.side")}</label>
                  <select id={`e-side-${tx.id}`} name="side" defaultValue={tx.side} className={inputClass}>
                    <option value="buy">{t("transactionModal.buy")}</option>
                    <option value="sell">{t("transactionModal.sell")}</option>
                  </select>
                </div>
                <div>
                  <label htmlFor={`e-date-${tx.id}`} className={labelClass}>{t("transactionModal.tradeDate")}</label>
                  <input id={`e-date-${tx.id}`} name="effective_at" type="date" required defaultValue={dateValue} className={inputClass} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor={`e-qty-${tx.id}`} className={labelClass}>{t("transactionModal.quantity")}</label>
                  <input id={`e-qty-${tx.id}`} name="quantity" type="number" step="any" min="0" required defaultValue={tx.quantity} className={inputClass} />
                </div>
                <div>
                  <label htmlFor={`e-price-${tx.id}`} className={labelClass}>{t("transactionModal.price", { currency })}</label>
                  <input id={`e-price-${tx.id}`} name="price" type="number" step="any" min="0" required defaultValue={tx.price} className={inputClass} />
                </div>
              </div>
              <input type="hidden" name="currency" value={currency} />
              <div>
                <label htmlFor={`e-fee-${tx.id}`} className={labelClass}>{t("transactionModal.brokerFee", { currency })}</label>
                <input id={`e-fee-${tx.id}`} name="fee" type="number" step="any" min="0" defaultValue={tx.fee} className={inputClass} />
              </div>
              <div>
                <label htmlFor={`e-note-${tx.id}`} className={labelClass}>{t("transactionModal.note")} <span className="text-[var(--app-text-faint)]">{t("transactionModal.optional")}</span></label>
                <input id={`e-note-${tx.id}`} name="note" type="text" defaultValue={tx.note ?? ""} className={inputClass} />
              </div>
              <label className="flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
                <input type="checkbox" name="savings_plan" defaultChecked={tx.savings_plan} className="h-3.5 w-3.5 rounded border-[var(--app-border)] accent-[var(--app-accent)]" />
                {t("transactionModal.savingsPlan")}
              </label>
              <button type="submit" disabled={saving} className="w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
                {saving ? t("transactionModal.saving") : t("transactionModal.saveSubmit")}
              </button>
            </form>

            {/* Danger: delete */}
            <div className="mt-4 border-t border-[var(--app-border)] pt-4">
              {deleteError && <p className="mb-2 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{deleteError}</p>}
              {confirmDelete ? (
                <form action={deleteAction} className="flex items-center gap-2">
                  <span className="flex-1 text-xs text-[var(--app-text-muted)]">{t("transactionModal.deleteConfirm")}</span>
                  <button type="button" onClick={() => setConfirmDelete(false)} className="rounded-md px-2 py-1 text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">{t("common.cancel")}</button>
                  <button type="submit" disabled={deleting} className="rounded-md bg-rose-600/80 px-2.5 py-1 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50">
                    {deleting ? t("transactionModal.deleting") : t("transactionModal.delete")}
                  </button>
                </form>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="text-xs text-rose-400 hover:text-rose-300">
                  {t("transactionModal.deleteTransaction")}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
