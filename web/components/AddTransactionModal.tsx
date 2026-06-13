"use client"
import { useActionState, useEffect, useRef, useState } from "react"
import { addTransactionAction } from "@/app/positions/[id]/actions"
import { useTranslations } from "@/lib/i18n"

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)] text-sm"
const labelClass = "mb-1 block text-xs text-[var(--app-text-faint)]"

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
        onClick={() => setIsOpen(true)}
        className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-sm leading-none text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]"
        title={t("transactionModal.addTitle")}
      >
        +
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          onClick={(e) => e.target === e.currentTarget && setIsOpen(false)}
        >
          <div className="app-panel max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-[var(--app-text)]">{t("transactionModal.addTitle")}</h3>
              <button onClick={() => setIsOpen(false)} className="text-[var(--app-text-faint)] hover:text-[var(--app-text)]">
                ✕
              </button>
            </div>

            <form action={formAction} className="space-y-3">
              {error && <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p>}

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

              <label className="flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
                <input type="checkbox" name="savings_plan" className="h-3.5 w-3.5 rounded border-[var(--app-border)] accent-[var(--app-accent)]" />
                {t("transactionModal.savingsPlan")}
              </label>

              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setIsOpen(false)} className="flex-1 rounded-lg border border-[var(--app-border)] py-2 text-sm text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)]">
                  {t("common.cancel")}
                </button>
                <button type="submit" disabled={isPending} className="flex-1 rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
                  {isPending ? t("transactionModal.saving") : t("transactionModal.addSubmit")}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
