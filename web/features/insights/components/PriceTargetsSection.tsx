"use client"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { createPriceTargetAction, deletePriceTargetAction, updatePriceTargetAction } from "@/features/insights/actions"
import { useLocale } from "@/lib/locale-context"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import { fmtCurrency, num } from "@/lib/format"
import type { ConvertedPriceTarget, PriceTarget } from "@/lib/types"

const inputClass =
  "w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
const labelClass = "mb-1 block text-[11px] text-[var(--app-text-faint)]"
const primaryButtonClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-accent)_42%,var(--app-border))] bg-[var(--app-accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
const secondaryButtonClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-accent)_30%,var(--app-border))] bg-[var(--app-accent-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--app-accent)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)]"
const ghostButtonClass =
  "rounded-md border border-[var(--app-border)] px-2 py-1 text-[11px] font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"
const dangerButtonClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-negative)_30%,var(--app-border))] px-2 py-1 text-[11px] font-semibold text-[var(--app-negative)] transition hover:bg-[color-mix(in_srgb,var(--app-negative)_10%,transparent)] disabled:opacity-50"

const HORIZON_LABEL_KEY: Record<PriceTarget["horizon"], MessageKey> = {
  short: "priceTargets.shortTerm",
  medium: "priceTargets.mediumTerm",
  long: "priceTargets.longTerm",
}
const HORIZON_ORDER: PriceTarget["horizon"][] = ["short", "medium", "long"]

interface Props {
  availableCurrencies: string[]
  detailContext: string
  instrumentId: string
  listingId: string
  currency: string
  currentPrice: number | null
  items: ConvertedPriceTarget[]
}

export function PriceTargetsSection({ availableCurrencies, detailContext, instrumentId, listingId, currency, currentPrice, items }: Props) {
  const locale = useLocale()
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [error, formAction, pending] = useActionState(
    createPriceTargetAction.bind(null, instrumentId, listingId, currency, detailContext),
    null,
  )

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-[var(--app-text-faint)]">{t("priceTargets.empty")}</p>
      ) : (
        <div className="space-y-3">
          {HORIZON_ORDER.filter((h) => items.some((target) => target.horizon === h)).map((h) => (
            <div key={h}>
              <p className="mb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{t(HORIZON_LABEL_KEY[h])}</p>
              <ul className="space-y-2">
                {items
                  .filter((target) => target.horizon === h)
                  .map((target) => (
                    <TargetRow availableCurrencies={availableCurrencies} key={target.id} target={target} detailContext={detailContext} currentPrice={currentPrice} locale={locale} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className={secondaryButtonClass}
        >
          {t("priceTargets.add")}
        </button>
      ) : (
        <form action={formAction} className="app-muted-panel rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--app-text-muted)]">{t("priceTargets.ownZoneTitle", { currency })}</span>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--app-text-faint)] hover:text-[var(--app-text)]">
              {t("common.close")}
            </button>
          </div>
          {error && <p className="mb-2 rounded-md bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] px-3 py-2 text-xs text-[var(--app-negative)]">{error}</p>}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
            <div>
              <label htmlFor="pt-horizon" className={labelClass}>{t("priceTargets.horizon")}</label>
              <select id="pt-horizon" name="horizon" defaultValue="medium" className={inputClass}>
                <option value="short">{t("priceTargets.short")}</option>
                <option value="medium">{t("priceTargets.medium")}</option>
                <option value="long">{t("priceTargets.long")}</option>
              </select>
            </div>
            <div>
              <label htmlFor="pt-currency" className={labelClass}>Currency</label>
              <CurrencySelect currencies={availableCurrencies} id="pt-currency" value={currency} />
            </div>
            <div>
              <label htmlFor="pt-low" className={labelClass}>{t("priceTargets.zoneLow")}</label>
              <input id="pt-low" name="zone_low" type="number" step="any" min="0" required placeholder={t("priceTargets.zoneLowPlaceholder")} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pt-high" className={labelClass}>{t("priceTargets.zoneHigh")}</label>
              <input id="pt-high" name="zone_high" type="number" step="any" min="0" required placeholder={t("priceTargets.zoneHighPlaceholder")} className={inputClass} />
            </div>
          </div>
          <div className="mt-2.5">
            <label htmlFor="pt-note" className={labelClass}>{t("priceTargets.note")}</label>
            <input id="pt-note" name="note" placeholder={t("priceTargets.notePlaceholder")} className={inputClass} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`mt-3 w-full ${primaryButtonClass}`}
          >
            {pending ? t("priceTargets.saving") : t("priceTargets.addTarget")}
          </button>
        </form>
      )}
    </div>
  )
}

function TargetRow({
  availableCurrencies,
  target,
  detailContext,
  currentPrice,
  locale,
}: {
  availableCurrencies: string[]
  target: ConvertedPriceTarget
  detailContext: string
  currentPrice: number | null
  locale: string
}) {
  const tr = useTranslations()
  const [isDeleting, startDelete] = useTransition()
  const [editing, setEditing] = useState(false)
  const originalLow = num(target.zone_low)
  const originalHigh = num(target.zone_high)
  const displayLow = num(target.display_zone_low)
  const displayHigh = num(target.display_zone_high)
  const compareLow = target.fx_status === "unavailable" ? null : displayLow
  const compareHigh = target.fx_status === "unavailable" ? null : displayHigh
  const isOwn = target.user_id !== null && target.source === "own"
  const sourceLabel =
    target.source === "analyst" ? tr("priceTargets.sourceAnalyst") : target.source === "own" ? tr("priceTargets.sourceOwn") : target.source

  const displayedZone =
    displayLow !== null && displayHigh !== null
      ? `${fmtCurrency(locale, displayLow, target.display_currency)} - ${fmtCurrency(locale, displayHigh, target.display_currency)}`
      : displayLow !== null
        ? `>= ${fmtCurrency(locale, displayLow, target.display_currency)}`
        : displayHigh !== null
          ? `<= ${fmtCurrency(locale, displayHigh, target.display_currency)}`
          : "-"
  const sourceZone = formatZone(locale, originalLow, originalHigh, target.currency)
  const zone = target.fx_status === "unavailable" ? sourceZone : displayedZone
  const conversionNote = target.fx_status === "converted"
    ? `from ${sourceZone}`
    : target.fx_status === "unavailable"
      ? `FX unavailable for ${sourceZone}`
      : null

  let marker: { text: string; cls: string } | null = null
  if (currentPrice !== null) {
    if (compareLow !== null && currentPrice < compareLow) marker = { text: tr("priceTargets.belowZone"), cls: "text-[var(--app-positive)]" }
    else if (compareHigh !== null && currentPrice > compareHigh) marker = { text: tr("priceTargets.aboveZone"), cls: "text-[var(--app-negative)]" }
    else if (compareLow !== null || compareHigh !== null) marker = { text: tr("priceTargets.inZone"), cls: "text-[var(--app-warning)]" }
  }

  if (isOwn && editing) {
    return <TargetEditRow availableCurrencies={availableCurrencies} target={target} detailContext={detailContext} onCancel={() => setEditing(false)} />
  }

  return (
    <li className="app-muted-panel flex items-center gap-3 rounded-lg px-3 py-2">
      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${isOwn ? "border-[color-mix(in_srgb,var(--app-accent)_36%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]"}`}>
        {sourceLabel}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tabular-nums text-[var(--app-text)]">
          {zone}
          {marker && <span className={`ml-2 text-xs font-medium ${marker.cls}`}>{marker.text}</span>}
        </p>
        {(target.note || target.effective_date) && (
          <p className="truncate text-[11px] text-[var(--app-text-faint)]">
            {target.effective_date}
            {target.note && <> - {target.note}</>}
            {conversionNote && <> - {conversionNote}</>}
          </p>
        )}
        {!target.note && !target.effective_date && conversionNote && (
          <p className="truncate text-[11px] text-[var(--app-text-faint)]">{conversionNote}</p>
        )}
      </div>
      {isOwn && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className={ghostButtonClass}
          >
            {tr("priceTargets.edit")}
          </button>
          <button
            type="button"
            onClick={() => startDelete(async () => void (await deletePriceTargetAction(detailContext, target.id)))}
            disabled={isDeleting}
            title={tr("priceTargets.deleteTitle")}
            className={dangerButtonClass}
          >
            {isDeleting ? tr("priceTargets.deleting") : tr("priceTargets.delete")}
          </button>
        </div>
      )}
    </li>
  )
}

function TargetEditRow({
  availableCurrencies,
  target,
  detailContext,
  onCancel,
}: {
  availableCurrencies: string[]
  target: PriceTarget
  detailContext: string
  onCancel: () => void
}) {
  const tr = useTranslations()
  const submittedRef = useRef(false)
  const [error, formAction, pending] = useActionState(
    updatePriceTargetAction.bind(null, detailContext, target.id),
    null,
  )

  useEffect(() => {
    if (submittedRef.current && !pending && error === null) onCancel()
  }, [error, onCancel, pending])

  return (
    <li className="app-muted-panel rounded-lg px-3 py-3">
      <form action={formAction} onSubmit={() => { submittedRef.current = true }} className="space-y-2.5">
        <span className="text-xs font-medium text-[var(--app-text-muted)]">{tr("priceTargets.editTitle", { currency: target.currency })}</span>
        {error && <p className="rounded-md bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] px-3 py-2 text-xs text-[var(--app-negative)]">{error}</p>}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-4">
          <div>
            <label htmlFor={`pt-${target.id}-horizon`} className={labelClass}>{tr("priceTargets.horizon")}</label>
            <select id={`pt-${target.id}-horizon`} name="horizon" defaultValue={target.horizon} className={inputClass}>
              <option value="short">{tr("priceTargets.short")}</option>
              <option value="medium">{tr("priceTargets.medium")}</option>
              <option value="long">{tr("priceTargets.long")}</option>
            </select>
          </div>
          <div>
            <label htmlFor={`pt-${target.id}-currency`} className={labelClass}>Currency</label>
            <CurrencySelect currencies={availableCurrencies} id={`pt-${target.id}-currency`} value={target.currency} />
          </div>
          <div>
            <label htmlFor={`pt-${target.id}-low`} className={labelClass}>{tr("priceTargets.zoneLow")}</label>
            <input id={`pt-${target.id}-low`} name="zone_low" type="number" step="any" min="0" required defaultValue={target.zone_low ?? ""} className={inputClass} />
          </div>
          <div>
            <label htmlFor={`pt-${target.id}-high`} className={labelClass}>{tr("priceTargets.zoneHigh")}</label>
            <input id={`pt-${target.id}-high`} name="zone_high" type="number" step="any" min="0" required defaultValue={target.zone_high ?? ""} className={inputClass} />
          </div>
        </div>
        <div>
          <label htmlFor={`pt-${target.id}-note`} className={labelClass}>{tr("priceTargets.note")}</label>
          <input id={`pt-${target.id}-note`} name="note" defaultValue={target.note ?? ""} placeholder={tr("priceTargets.notePlaceholder")} className={inputClass} />
        </div>
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onCancel} className={ghostButtonClass}>
            {tr("common.cancel")}
          </button>
          <button type="submit" disabled={pending} className={primaryButtonClass}>
            {pending ? tr("priceTargets.saving") : tr("priceTargets.save")}
          </button>
        </div>
      </form>
    </li>
  )
}

function CurrencySelect({ currencies: rawCurrencies, id, value }: { currencies: string[]; id: string; value: string }) {
  const normalizedValue = value.toUpperCase()
  const currencies = [...new Set([...rawCurrencies, normalizedValue, "EUR"].map((currency) => currency.toUpperCase()).filter((currency) => /^[A-Z]{3}$/.test(currency)))].sort()
  return (
    <select id={id} name="currency" defaultValue={normalizedValue} className={inputClass}>
      {currencies.map((currency) => (
        <option key={currency} value={currency}>{currency}</option>
      ))}
    </select>
  )
}

function formatZone(locale: string, low: number | null, high: number | null, currency: string): string {
  if (low !== null && high !== null) return `${fmtCurrency(locale, low, currency)} - ${fmtCurrency(locale, high, currency)}`
  if (low !== null) return `>= ${fmtCurrency(locale, low, currency)}`
  if (high !== null) return `<= ${fmtCurrency(locale, high, currency)}`
  return "-"
}
