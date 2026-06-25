"use client"

import { useActionState, useEffect, useRef, useState } from "react"
import { addTransactionAction } from "@/features/positions/actions"
import { useTranslations } from "@/lib/i18n"

const inputClass =
  "h-[38px] w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)] px-3 text-[13px] font-bold text-[var(--app-text)] outline-none transition placeholder:text-[var(--app-text-faint)] focus:border-[var(--app-accent)]"
const labelClass = "mb-1.5 block text-[10px] font-extrabold uppercase tracking-[0.08em] text-[var(--app-text-faint)]"
const addButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[color-mix(in_srgb,var(--app-accent)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)] text-[var(--app-accent)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_14%,var(--app-surface-hover))]"
const closeButtonClass =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
const cancelButtonClass =
  "inline-flex h-9 items-center justify-center rounded-md px-4 text-[12px] font-extrabold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
const primaryButtonClass =
  "inline-flex h-9 items-center justify-center rounded-md bg-[var(--app-accent)] px-4 text-[12px] font-extrabold text-white transition hover:bg-[color-mix(in_srgb,var(--app-accent)_88%,white)] disabled:opacity-50"
const errorClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-negative)_38%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] px-3 py-2 text-[12px] font-bold text-[var(--app-negative)]"

interface Props {
  positionId: string
  currency: string
}

export function AddTransactionModal({ positionId, currency }: Props) {
  const t = useTranslations()
  const [isOpen, setIsOpen] = useState(false)
  const boundAction = addTransactionAction.bind(null, positionId)
  const [error, formAction, isPending] = useActionState(boundAction, null)
  const prevPending = useRef(false)

  useEffect(() => {
    if (prevPending.current && !isPending && !error) setIsOpen(false)
    prevPending.current = isPending
  }, [isPending, error])

  const today = new Date().toISOString().slice(0, 10)

  return (
    <>
      <button
        className={addButtonClass}
        onClick={() => setIsOpen(true)}
        title={t("transactionModal.addTitle")}
        type="button"
      >
        +
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(event) => event.target === event.currentTarget && setIsOpen(false)}
        >
          <div className="app-panel flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-lg shadow-2xl">
            <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
              <h3 className="text-[14px] font-[750] leading-tight text-[var(--app-text)]">{t("transactionModal.addTitle")}</h3>
              <button aria-label={t("common.cancel")} className={closeButtonClass} onClick={() => setIsOpen(false)} type="button">
                x
              </button>
            </div>

            <form action={formAction} className="min-h-0 overflow-y-auto">
              <div className="space-y-4 bg-[var(--app-surface-raised)] p-4">
                {error ? <p className={errorClass}>{error}</p> : null}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tx-side" className={labelClass}>{t("transactionModal.side")}</label>
                    <select id="tx-side" name="side" className={inputClass}>
                      <option value="buy">{t("transactionModal.buy")}</option>
                      <option value="sell">{t("transactionModal.sell")}</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="tx-date" className={labelClass}>{t("transactionModal.tradeDate")}</label>
                    <input id="tx-date" name="effective_at" type="date" required defaultValue={today} className={inputClass} />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="tx-qty" className={labelClass}>{t("transactionModal.quantity")}</label>
                    <input id="tx-qty" name="quantity" type="number" required step="any" min="0" placeholder={t("transactionModal.quantityPlaceholder")} className={inputClass} />
                  </div>
                  <div>
                    <label htmlFor="tx-price" className={labelClass}>{t("transactionModal.price", { currency })}</label>
                    <input id="tx-price" name="price" type="number" required step="any" min="0" placeholder={t("transactionModal.pricePlaceholder")} className={inputClass} />
                  </div>
                </div>

                <input type="hidden" name="currency" value={currency} />

                <div>
                  <label htmlFor="tx-fee" className={labelClass}>{t("transactionModal.brokerFee", { currency })}</label>
                  <input id="tx-fee" name="fee" type="number" step="any" min="0" defaultValue="0" className={inputClass} />
                </div>

                <div>
                  <label htmlFor="tx-note" className={labelClass}>
                    {t("transactionModal.note")} <span className="text-[var(--app-text-faint)]">{t("transactionModal.optional")}</span>
                  </label>
                  <input id="tx-note" name="note" type="text" placeholder={t("transactionModal.notePlaceholder")} className={inputClass} />
                </div>

                <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--app-text-muted)]">
                  <input type="checkbox" name="savings_plan" className="h-3.5 w-3.5 rounded border-[var(--app-border)] accent-[var(--app-accent)]" />
                  {t("transactionModal.savingsPlan")}
                </label>
              </div>

              <div className="flex justify-end gap-2 border-t border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-surface-header)_82%,var(--app-surface-panel))] px-4 py-3 shadow-[inset_0_1px_0_color-mix(in_srgb,white_4%,transparent)]">
                <button type="button" onClick={() => setIsOpen(false)} disabled={isPending} className={cancelButtonClass}>
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={isPending} className={primaryButtonClass}>
                  {isPending ? t("transactionModal.saving") : t("transactionModal.addSubmit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  )
}
