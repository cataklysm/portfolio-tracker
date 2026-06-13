"use client"
import { useActionState } from "react"
import { updateListingAction, refreshQuotesAction } from "@/app/positions/[id]/actions"
import { useTranslations } from "@/lib/i18n"
import type { ListingDetail } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-sm text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
const labelClass = "mb-1 block text-xs text-[var(--app-text-faint)]"

interface Props {
  positionId: string
  listing: ListingDetail
  instrumentName: string
  /** Date (YYYY-MM-DD) of the position's first transaction, for history backfill. */
  firstTransactionDate: string | null
}

export function ListingSettings({ positionId, listing, instrumentName, firstTransactionDate }: Props) {
  const t = useTranslations()
  const yahoo = listing.provider_identifiers.find((p) => p.provider === "yahoo")?.provider_identifier ?? ""

  const [saveError, saveAction, saving] = useActionState(
    updateListingAction.bind(null, positionId, listing.id, listing.instrument_id),
    null,
  )
  const [refreshError, refreshAction, refreshing] = useActionState(
    refreshQuotesAction.bind(null, positionId, listing.id, firstTransactionDate),
    null,
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--app-text-faint)]">
        {t("listingSettings.help.part1")}
        <span className="text-[var(--app-text-muted)]">SAP.DE</span>, <span className="text-[var(--app-text-muted)]">BTC-EUR</span>
        {t("listingSettings.help.part2")}
        <span className="text-[var(--app-text-muted)]">{t("listingSettings.help.saveToken")}</span>
        {t("listingSettings.help.part3")}
        <span className="text-[var(--app-text-muted)]">{t("listingSettings.help.refreshToken")}</span>
        {t("listingSettings.help.part4")}
      </p>

      <form action={saveAction} className="space-y-3">
        {saveError && <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{saveError}</p>}
        <div>
          <label htmlFor="ls-name" className={labelClass}>{t("listingSettings.instrumentName")}</label>
          <input id="ls-name" name="name" defaultValue={instrumentName} className={inputClass} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="ls-symbol" className={labelClass}>{t("listingSettings.symbol")}</label>
            <input id="ls-symbol" name="symbol" defaultValue={listing.symbol} className={`${inputClass} uppercase`} />
          </div>
          <div>
            <label htmlFor="ls-currency" className={labelClass}>{t("listingSettings.currency")}</label>
            <input id="ls-currency" name="currency" defaultValue={listing.currency} maxLength={3} className={`${inputClass} uppercase`} />
          </div>
          <div>
            <label htmlFor="ls-yahoo" className={labelClass}>{t("listingSettings.yahooTicker")}</label>
            <input id="ls-yahoo" name="yahoo_symbol" defaultValue={yahoo} placeholder={listing.symbol} className={`${inputClass} uppercase`} />
          </div>
        </div>
        <button type="submit" disabled={saving} className="w-full rounded-lg bg-[var(--app-accent)] py-2 text-sm font-semibold text-white disabled:opacity-50">
          {saving ? t("listingSettings.saving") : t("listingSettings.save")}
        </button>
      </form>

      <form action={refreshAction}>
        {refreshError && <p className="mb-2 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{refreshError}</p>}
        <button type="submit" disabled={refreshing} className="w-full rounded-lg border border-[var(--app-border)] py-2 text-sm text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50">
          {refreshing ? t("listingSettings.refreshing") : t("listingSettings.refresh")}
        </button>
      </form>
    </div>
  )
}
