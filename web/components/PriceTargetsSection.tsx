"use client"
import { useActionState, useEffect, useRef, useState, useTransition } from "react"
import { createPriceTargetAction, deletePriceTargetAction, updatePriceTargetAction } from "@/app/positions/[id]/insights-actions"
import { useLocale } from "@/lib/locale-context"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import { fmtCurrency, num } from "@/lib/format"
import type { PriceTarget } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-sm text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
const labelClass = "mb-1 block text-[11px] text-[var(--app-text-faint)]"

const HORIZON_LABEL_KEY: Record<PriceTarget["horizon"], MessageKey> = {
  short: "priceTargets.shortTerm",
  medium: "priceTargets.mediumTerm",
  long: "priceTargets.longTerm",
}
const HORIZON_ORDER: PriceTarget["horizon"][] = ["short", "medium", "long"]

interface Props {
  positionId: string
  instrumentId: string
  currency: string
  currentPrice: number | null
  items: PriceTarget[]
}

export function PriceTargetsSection({ positionId, instrumentId, currency, currentPrice, items }: Props) {
  const locale = useLocale()
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [error, formAction, pending] = useActionState(
    createPriceTargetAction.bind(null, instrumentId, currency, positionId),
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
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--app-text-faint)]">{t(HORIZON_LABEL_KEY[h])}</p>
              <ul className="space-y-2">
                {items
                  .filter((target) => target.horizon === h)
                  .map((target) => (
                    <TargetRow key={target.id} target={target} positionId={positionId} currentPrice={currentPrice} locale={locale} />
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
          className="rounded-lg border border-[var(--app-border-strong)] bg-[var(--app-accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--app-accent)]"
        >
          {t("priceTargets.add")}
        </button>
      ) : (
        <form action={formAction} className="app-muted-panel rounded-xl p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--app-text-muted)]">{t("priceTargets.ownZoneTitle", { currency })}</span>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--app-text-faint)] hover:text-[var(--app-text)]">
              {t("common.close")}
            </button>
          </div>
          {error && <p className="mb-2 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p>}
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div>
              <label htmlFor="pt-horizon" className={labelClass}>{t("priceTargets.horizon")}</label>
              <select id="pt-horizon" name="horizon" defaultValue="medium" className={inputClass}>
                <option value="short">{t("priceTargets.short")}</option>
                <option value="medium">{t("priceTargets.medium")}</option>
                <option value="long">{t("priceTargets.long")}</option>
              </select>
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
            className="mt-3 w-full rounded-lg bg-sky-600 py-2 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
          >
            {pending ? t("priceTargets.saving") : t("priceTargets.addTarget")}
          </button>
        </form>
      )}
    </div>
  )
}

function TargetRow({
  target,
  positionId,
  currentPrice,
  locale,
}: {
  target: PriceTarget
  positionId: string
  currentPrice: number | null
  locale: string
}) {
  const tr = useTranslations()
  const [isDeleting, startDelete] = useTransition()
  const [editing, setEditing] = useState(false)
  const low = num(target.zone_low)
  const high = num(target.zone_high)
  const isOwn = target.user_id !== null && target.source === "own"
  const sourceLabel =
    target.source === "analyst" ? tr("priceTargets.sourceAnalyst") : target.source === "own" ? tr("priceTargets.sourceOwn") : target.source

  const zone =
    low !== null && high !== null
      ? `${fmtCurrency(locale, low, target.currency)} - ${fmtCurrency(locale, high, target.currency)}`
      : low !== null
        ? `>= ${fmtCurrency(locale, low, target.currency)}`
        : high !== null
          ? `<= ${fmtCurrency(locale, high, target.currency)}`
          : "-"

  let marker: { text: string; cls: string } | null = null
  if (currentPrice !== null) {
    if (low !== null && currentPrice < low) marker = { text: tr("priceTargets.belowZone"), cls: "text-emerald-400" }
    else if (high !== null && currentPrice > high) marker = { text: tr("priceTargets.aboveZone"), cls: "text-rose-400" }
    else if (low !== null || high !== null) marker = { text: tr("priceTargets.inZone"), cls: "text-amber-400" }
  }

  if (isOwn && editing) {
    return <TargetEditRow target={target} positionId={positionId} onCancel={() => setEditing(false)} />
  }

  return (
    <li className="app-muted-panel flex items-center gap-3 rounded-lg px-3 py-2">
      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${isOwn ? "border-sky-500/40 bg-sky-500/10 text-sky-300" : "border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]"}`}>
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
          </p>
        )}
      </div>
      {isOwn && (
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-muted)] hover:border-sky-500/40 hover:text-sky-300"
          >
            {tr("priceTargets.edit")}
          </button>
          <button
            type="button"
            onClick={() => startDelete(async () => void (await deletePriceTargetAction(positionId, target.id)))}
            disabled={isDeleting}
            title={tr("priceTargets.deleteTitle")}
            className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-muted)] hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
          >
            {isDeleting ? tr("priceTargets.deleting") : tr("priceTargets.delete")}
          </button>
        </div>
      )}
    </li>
  )
}

function TargetEditRow({
  target,
  positionId,
  onCancel,
}: {
  target: PriceTarget
  positionId: string
  onCancel: () => void
}) {
  const tr = useTranslations()
  const submittedRef = useRef(false)
  const [error, formAction, pending] = useActionState(
    updatePriceTargetAction.bind(null, positionId, target.id),
    null,
  )

  useEffect(() => {
    if (submittedRef.current && !pending && error === null) onCancel()
  }, [error, onCancel, pending])

  return (
    <li className="app-muted-panel rounded-lg px-3 py-3">
      <form action={formAction} onSubmit={() => { submittedRef.current = true }} className="space-y-2.5">
        <span className="text-xs font-medium text-[var(--app-text-muted)]">{tr("priceTargets.editTitle", { currency: target.currency })}</span>
        {error && <p className="rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p>}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <div>
            <label htmlFor={`pt-${target.id}-horizon`} className={labelClass}>{tr("priceTargets.horizon")}</label>
            <select id={`pt-${target.id}-horizon`} name="horizon" defaultValue={target.horizon} className={inputClass}>
              <option value="short">{tr("priceTargets.short")}</option>
              <option value="medium">{tr("priceTargets.medium")}</option>
              <option value="long">{tr("priceTargets.long")}</option>
            </select>
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
          <button type="button" onClick={onCancel} className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
            {tr("common.cancel")}
          </button>
          <button type="submit" disabled={pending} className="rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 disabled:opacity-50">
            {pending ? tr("priceTargets.saving") : tr("priceTargets.save")}
          </button>
        </div>
      </form>
    </li>
  )
}
