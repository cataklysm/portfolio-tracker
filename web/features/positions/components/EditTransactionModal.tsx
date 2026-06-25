"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { deleteTransactionAction, updateTransactionAction } from "@/features/positions/actions"
import { useTranslations } from "@/lib/i18n"
import type { TransactionView } from "@/lib/types"
import type { ReactNode } from "react"

const inputClass =
  "h-[38px] w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 text-[13px] font-bold text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-text-faint)] focus:border-[var(--app-accent)]"
const labelClass = "mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-text-faint)]"
const closeButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
const cancelButtonClass =
  "inline-flex h-9 items-center justify-center rounded-md px-4 text-[12px] font-extrabold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-md bg-[var(--app-accent)] px-4 text-[12px] font-extrabold text-white transition hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,white)] disabled:opacity-50"
const dangerButtonClass =
  "inline-flex h-8 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--app-negative)_42%,var(--app-border))] px-3 text-[11px] font-extrabold text-[var(--app-negative)] transition hover:bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] disabled:opacity-50"
const errorClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-negative)_38%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] px-3 py-2 text-[12px] font-bold text-[var(--app-negative)]"

interface Props {
  positionId: string
  currency: string
  transaction: TransactionView
  triggerClassName?: string
  triggerContent?: ReactNode
}

export function EditTransactionModal({ positionId, currency, transaction: tx, triggerClassName, triggerContent }: Props) {
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
        className={triggerClassName ?? "rounded-md px-2 py-1 text-xs text-[var(--app-text-faint)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}
        title={t("transactions.editTitle")}
        type="button"
      >
        {triggerContent ?? t("transactions.edit")}
      </button>

      {isOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4" onClick={(event) => event.target === event.currentTarget && setIsOpen(false)}>
          <div className="app-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg shadow-2xl">
            <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
              <h3 className="text-[14px] font-[750] leading-tight text-[var(--app-text)]">{t("transactionModal.editTitle")}</h3>
              <button aria-label={t("common.cancel")} className={closeButtonClass} onClick={() => setIsOpen(false)} type="button">
                x
              </button>
            </div>

            <form action={saveAction} className="min-h-0 overflow-y-auto">
              <div className="space-y-4 bg-[var(--app-surface-raised)] p-4">
                {saveError ? <p className={errorClass}>{saveError}</p> : null}

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
                  <label htmlFor={`e-note-${tx.id}`} className={labelClass}>
                    {t("transactionModal.note")} <span className="text-[var(--app-text-faint)]">{t("transactionModal.optional")}</span>
                  </label>
                  <input id={`e-note-${tx.id}`} name="note" type="text" defaultValue={tx.note ?? ""} className={inputClass} />
                </div>

                <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--app-text-muted)]">
                  <input type="checkbox" name="savings_plan" defaultChecked={tx.savings_plan} className="h-3.5 w-3.5 rounded border-[var(--app-border)] accent-[var(--app-accent)]" />
                  {t("transactionModal.savingsPlan")}
                </label>

                <div className="rounded-lg border border-[color-mix(in_srgb,var(--app-negative)_24%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_5%,transparent)] p-3">
                  {deleteError ? <p className={`mb-2 ${errorClass}`}>{deleteError}</p> : null}
                  {confirmDelete ? (
                    <div className="flex items-center gap-2">
                      <span className="flex-1 text-[11px] font-medium text-[var(--app-text-muted)]">{t("transactionModal.deleteConfirm")}</span>
                      <button type="button" onClick={() => setConfirmDelete(false)} className={cancelButtonClass}>{t("common.cancel")}</button>
                      <button form="delete-transaction-form" type="submit" disabled={deleting} className={dangerButtonClass}>
                        {deleting ? t("transactionModal.deleting") : t("transactionModal.delete")}
                      </button>
                    </div>
                  ) : (
                    <button type="button" onClick={() => setConfirmDelete(true)} className={dangerButtonClass}>
                      {t("transactionModal.deleteTransaction")}
                    </button>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-surface-header)_82%,var(--app-surface-panel))] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,white_4%,transparent)]">
                <button type="button" onClick={() => setIsOpen(false)} disabled={saving} className={cancelButtonClass}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={saving} className={primaryButtonClass}>
                  {saving ? t("transactionModal.saving") : t("transactionModal.saveSubmit")}
                </button>
              </div>
            </form>

            <form id="delete-transaction-form" action={deleteAction} />
          </div>
        </div>
      ) : null}
    </>
  )
}
