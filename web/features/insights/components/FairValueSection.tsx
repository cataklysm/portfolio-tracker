"use client"
import { useActionState, useState, useTransition } from "react"
import { createDcfFairValueAction, deleteFairValueAction } from "@/features/insights/actions"
import { useLocale } from "@/lib/locale-context"
import { useTranslations } from "@/lib/i18n"
import { fmtCurrency, num } from "@/lib/format"
import type { FairValueEstimate } from "@/lib/types"

const inputClass =
  "w-full rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-[12px] font-semibold text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
const labelClass = "mb-1 block text-[11px] text-[var(--app-text-faint)]"
const primaryButtonClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-accent)_42%,var(--app-border))] bg-[var(--app-accent)] px-3 py-1.5 text-[12px] font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
const secondaryButtonClass =
  "rounded-md border border-[color-mix(in_srgb,var(--app-accent)_30%,var(--app-border))] bg-[var(--app-accent-soft)] px-3 py-1.5 text-[12px] font-semibold text-[var(--app-accent)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)]"
const ghostButtonClass =
  "rounded-md border border-[var(--app-border)] px-2 py-1 text-[11px] font-semibold text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] disabled:opacity-50"

interface Props {
  detailContext: string
  instrumentId: string
  currency: string
  currentPrice: number | null
  items: FairValueEstimate[]
}

export function FairValueSection({ detailContext, instrumentId, currency, currentPrice, items }: Props) {
  const locale = useLocale()
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [error, formAction, pending] = useActionState(
    createDcfFairValueAction.bind(null, instrumentId, currency, detailContext),
    null,
  )

  return (
    <div className="space-y-3">
      {items.length === 0 ? (
        <p className="text-sm text-[var(--app-text-faint)]">{t("fairValue.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((fv) => (
            <FairValueRow key={fv.id} fv={fv} detailContext={detailContext} currency={currency} currentPrice={currentPrice} locale={locale} />
          ))}
        </ul>
      )}

      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className={secondaryButtonClass}
        >
          {t("fairValue.addEstimate")}
        </button>
      ) : (
        <form action={formAction} className="app-muted-panel rounded-lg p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--app-text-muted)]">{t("fairValue.assumptionsTitle", { currency })}</span>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--app-text-faint)] hover:text-[var(--app-text)]">
              {t("common.close")}
            </button>
          </div>
          {error && <p className="mb-2 rounded-md bg-[color-mix(in_srgb,var(--app-negative)_12%,transparent)] px-3 py-2 text-xs text-[var(--app-negative)]">{error}</p>}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
            <Field name="base_cash_flow" label={t("fairValue.freeCashFlow", { currency })} placeholder="e.g. 1000000000" />
            <Field name="growth_rate" label={t("fairValue.growthRate")} defaultValue="8" />
            <Field name="projection_years" label={t("fairValue.years")} defaultValue="10" step="1" />
            <Field name="discount_rate" label={t("fairValue.discountRate")} defaultValue="9" />
            <Field name="terminal_growth" label={t("fairValue.terminalGrowth")} defaultValue="2.5" />
            <Field name="shares_outstanding" label={t("fairValue.dilutedShares")} placeholder="e.g. 100000000" />
            <Field name="net_debt" label={t("fairValue.netDebt", { currency })} placeholder="0" required={false} />
          </div>
          <button
            type="submit"
            disabled={pending}
            className={`mt-3 w-full ${primaryButtonClass}`}
          >
            {pending ? t("fairValue.computing") : t("fairValue.computeSave")}
          </button>
        </form>
      )}
    </div>
  )
}

function Field({
  name,
  label,
  defaultValue,
  placeholder,
  step = "any",
  required = true,
}: {
  name: string
  label: string
  defaultValue?: string
  placeholder?: string
  step?: string
  required?: boolean
}) {
  return (
    <div>
      <label htmlFor={`fv-${name}`} className={labelClass}>{label}</label>
      <input
        id={`fv-${name}`}
        name={name}
        type="number"
        step={step}
        defaultValue={defaultValue}
        placeholder={placeholder}
        required={required}
        className={inputClass}
      />
    </div>
  )
}

function FairValueRow({
  fv,
  detailContext,
  currency,
  currentPrice,
  locale,
}: {
  fv: FairValueEstimate
  detailContext: string
  currency: string
  currentPrice: number | null
  locale: string
}) {
  const t = useTranslations()
  const [isDeleting, startDelete] = useTransition()
  const value = num(fv.value)
  const sameCcy = fv.currency === currency
  const upside = value !== null && currentPrice && currentPrice > 0 && sameCcy ? ((value - currentPrice) / currentPrice) * 100 : null
  const isOwn = fv.user_id !== null
  const a = fv.assumptions

  return (
    <li className="app-muted-panel flex items-center gap-3 rounded-lg px-3 py-2">
      <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-semibold ${fv.method === "dcf" ? "border-[color-mix(in_srgb,var(--app-accent)_36%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[var(--app-text-muted)]"}`}>
        {fv.method === "dcf" ? t("fairValue.methodDcf") : t("fairValue.methodAnalyst")}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold tabular-nums text-[var(--app-text)]">
          {value !== null ? fmtCurrency(locale, value, fv.currency) : "-"}
          {upside !== null && (
            <span className={`ml-2 text-xs font-medium ${upside >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"}`}>
              {t("fairValue.upsideSuffix", { value: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%` })}
            </span>
          )}
        </p>
        <p className="truncate text-[11px] text-[var(--app-text-faint)]">
          {fv.effective_date}
          {a && fv.method === "dcf" && (
            <> - g {pct(a.growth_rate)} - disc {pct(a.discount_rate)} - {a.projection_years}y</>
          )}
          {fv.source && <> - {fv.source}</>}
        </p>
      </div>
      {isOwn && (
        <button
          onClick={() => startDelete(async () => void (await deleteFairValueAction(detailContext, fv.id)))}
          disabled={isDeleting}
          title={t("fairValue.deleteTitle")}
          className={ghostButtonClass}
        >
          {isDeleting ? "..." : "x"}
        </button>
      )}
    </li>
  )
}

function pct(value: number | undefined): string {
  return value === undefined ? "-" : `${(value * 100).toFixed(1)}%`
}
