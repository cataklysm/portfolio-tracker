"use client"
import { useActionState, useState, useTransition } from "react"
import { createPriceTargetAction, deletePriceTargetAction } from "@/app/positions/[id]/insights-actions"
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
          {HORIZON_ORDER.filter((h) => items.some((t) => t.horizon === h)).map((h) => (
            <div key={h}>
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-[var(--app-text-faint)]">{t(HORIZON_LABEL_KEY[h])}</p>
              <ul className="space-y-2">
                {items
                  .filter((t) => t.horizon === h)
                  .map((t) => (
                    <TargetRow key={t.id} t={t} positionId={positionId} currentPrice={currentPrice} locale={locale} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      {!open ? (
        <button
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
          <div className="grid grid-cols-3 gap-2.5">
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
              <input id="pt-low" name="zone_low" type="number" step="any" min="0" placeholder={t("priceTargets.zoneLowPlaceholder")} className={inputClass} />
            </div>
            <div>
              <label htmlFor="pt-high" className={labelClass}>{t("priceTargets.zoneHigh")}</label>
              <input id="pt-high" name="zone_high" type="number" step="any" min="0" placeholder={t("priceTargets.zoneHighPlaceholder")} className={inputClass} />
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
  t,
  positionId,
  currentPrice,
  locale,
}: {
  t: PriceTarget
  positionId: string
  currentPrice: number | null
  locale: string
}) {
  const tr = useTranslations()
  const [isDeleting, startDelete] = useTransition()
  const low = num(t.zone_low)
  const high = num(t.zone_high)
  const isOwn = t.user_id !== null && t.source === "own"
  // Match the Fair Value badge's capitalization ("Analyst", "Own").
  const sourceLabel =
    t.source === "analyst" ? tr("priceTargets.sourceAnalyst") : t.source === "own" ? tr("priceTargets.sourceOwn") : t.source

  const zone =
    low !== null && high !== null
      ? `${fmtCurrency(locale, low, t.currency)} – ${fmtCurrency(locale, high, t.currency)}`
      : low !== null
        ? `≥ ${fmtCurrency(locale, low, t.currency)}`
        : high !== null
          ? `≤ ${fmtCurrency(locale, high, t.currency)}`
          : "—"

  // Where the current price sits relative to the zone.
  let marker: { text: string; cls: string } | null = null
  if (currentPrice !== null) {
    if (low !== null && currentPrice < low) marker = { text: tr("priceTargets.belowZone"), cls: "text-emerald-400" }
    else if (high !== null && currentPrice > high) marker = { text: tr("priceTargets.aboveZone"), cls: "text-rose-400" }
    else if (low !== null || high !== null) marker = { text: tr("priceTargets.inZone"), cls: "text-amber-400" }
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
        {(t.note || t.effective_date) && (
          <p className="truncate text-[11px] text-[var(--app-text-faint)]">
            {t.effective_date}
            {t.note && <> · {t.note}</>}
          </p>
        )}
      </div>
      {isOwn && (
        <button
          onClick={() => startDelete(async () => void (await deletePriceTargetAction(positionId, t.id)))}
          disabled={isDeleting}
          title={tr("priceTargets.deleteTitle")}
          className="rounded-md border border-[var(--app-border)] px-2 py-1 text-xs text-[var(--app-text-muted)] hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          {isDeleting ? "…" : "✕"}
        </button>
      )}
    </li>
  )
}
