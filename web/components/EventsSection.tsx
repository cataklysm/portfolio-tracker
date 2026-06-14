import type { CorporateAction, EarningsRow, NewsItem } from "@/lib/types"
import { getTranslations } from "@/lib/i18n"
import { fmtCurrency, num } from "@/lib/format"

interface EventsProps {
  earnings: EarningsRow[]
  corporateActions: CorporateAction[]
  currency: string
  locale: string
}

interface NewsProps {
  news: NewsItem[]
  locale: string
}

function eps(value: string | null): string {
  const n = num(value)
  return n === null ? "—" : n.toFixed(2)
}

function formatDate(iso: string, locale: string, withYear = true): string {
  return new Date(iso).toLocaleDateString(locale, {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
  })
}

/**
 * High-signal market events only. Historical earnings are progressively
 * disclosed so the default asset detail view stays compact.
 */
export function EventsSection({ earnings, corporateActions, currency, locale }: EventsProps) {
  const t = getTranslations()
  const upcoming = earnings
    .filter((item) => item.is_upcoming)
    .sort((a, b) => (a.report_date ?? "").localeCompare(b.report_date ?? ""))
  const history = earnings.filter((item) => !item.is_upcoming).slice(0, 8)
  const actions = corporateActions.slice(0, 8)

  if (upcoming.length === 0 && history.length === 0 && actions.length === 0) {
    return <EmptyState text={t("events.empty")} />
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(260px,0.85fr)]">
        <div className="app-muted-panel overflow-hidden rounded-xl">
          <SectionHeading title="Next earnings" count={upcoming.length} />
          {upcoming.length > 0 ? (
            <UpcomingEarnings item={upcoming[0]} locale={locale} />
          ) : (
            <CompactEmpty text={t("events.noEarnings")} />
          )}
        </div>

        <div className="app-muted-panel overflow-hidden rounded-xl">
          <SectionHeading title={t("events.corpActionsTitle")} count={actions.length} />
          {actions.length > 0 ? (
            <ul className="divide-y divide-[var(--app-border)]">
              {actions.slice(0, 4).map((action) => (
                <CorporateActionRow key={action.stable_action_id} action={action} currency={currency} locale={locale} />
              ))}
            </ul>
          ) : (
            <CompactEmpty text={t("events.noCorpActions")} />
          )}
          {actions.length > 4 ? (
            <details className="border-t border-[var(--app-border)]">
              <summary className="cursor-pointer list-none px-3 py-2 text-[10px] font-semibold text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]">
                Show {actions.length - 4} older actions
              </summary>
              <ul className="divide-y divide-[var(--app-border)] border-t border-[var(--app-border)]">
                {actions.slice(4).map((action) => (
                  <CorporateActionRow key={action.stable_action_id} action={action} currency={currency} locale={locale} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      </div>

      {history.length > 0 ? (
        <details className="app-muted-panel overflow-hidden rounded-xl">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-3 py-2.5 hover:bg-[var(--app-surface-hover)]">
            <span className="text-[11px] font-semibold text-[var(--app-text)]">Earnings history</span>
            <span className="text-[10px] text-[var(--app-text-faint)]">{history.length} reports · expand</span>
          </summary>
          <div className="overflow-x-auto border-t border-[var(--app-border)]">
            <table className="min-w-[520px] w-full text-[11px]">
              <thead>
                <tr className="bg-[var(--app-surface-raised)] text-[var(--app-text-faint)]">
                  <th className="px-3 py-2 text-left font-medium">Period</th>
                  <th className="px-3 py-2 text-left font-medium">Reported</th>
                  <th className="px-3 py-2 text-right font-medium">{t("events.estimate")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("events.actual")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("events.surprise")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--app-border)]">
                {history.map((item) => <EarningsHistoryRow key={`${item.fiscal_year}-${item.fiscal_quarter}`} item={item} locale={locale} />)}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </div>
  )
}

/** A separate, scan-friendly news feed rather than another event subsection. */
export function NewsSection({ news, locale }: NewsProps) {
  const t = getTranslations()
  if (news.length === 0) return <EmptyState text={t("events.noNews")} />

  const recent = news.slice(0, 4)
  const older = news.slice(4)

  return (
    <div className="space-y-3">
      <ul className="divide-y divide-[var(--app-border)]">
        {recent.map((item, index) => <NewsRow key={item.id} item={item} locale={locale} featured={index === 0} />)}
      </ul>
      {older.length > 0 ? (
        <details className="app-muted-panel overflow-hidden rounded-xl">
          <summary className="cursor-pointer list-none px-3 py-2.5 text-[10px] font-semibold text-[var(--app-accent)] hover:bg-[var(--app-surface-hover)]">
            Show {older.length} older headlines
          </summary>
          <ul className="divide-y divide-[var(--app-border)] border-t border-[var(--app-border)]">
            {older.map((item) => <NewsRow key={item.id} item={item} locale={locale} />)}
          </ul>
        </details>
      ) : null}
    </div>
  )
}

function SectionHeading({ title, count }: { title: string; count: number }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-[var(--app-border)] px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">{title}</p>
      <span className="rounded-md bg-[var(--app-surface)] px-1.5 py-0.5 text-[9px] tabular-nums text-[var(--app-text-faint)]">{count}</span>
    </div>
  )
}

function UpcomingEarnings({ item, locale }: { item: EarningsRow; locale: string }) {
  return (
    <div className="grid gap-3 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <div>
        <p className="text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--app-accent)]">Upcoming report</p>
        <p className="mt-1 text-base font-semibold text-[var(--app-text)]">
          {item.report_date ? formatDate(item.report_date, locale) : "Date not confirmed"}
        </p>
        <p className="mt-1 text-[10px] text-[var(--app-text-faint)]">
          FY{item.fiscal_year}{item.fiscal_quarter ? ` Q${item.fiscal_quarter}` : ""} · {item.provider}
        </p>
      </div>
      <div className="flex gap-5 sm:text-right">
        <EventMetric label="EPS estimate" value={eps(item.eps_estimate)} />
        <EventMetric label="Revenue estimate" value={compactAmount(item.revenue_estimate, locale)} />
      </div>
    </div>
  )
}

function EventMetric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-[0.08em] text-[var(--app-text-faint)]">{label}</p>
      <p className="mt-1 text-xs font-semibold tabular-nums text-[var(--app-text)]">{value}</p>
    </div>
  )
}

function EarningsHistoryRow({ item, locale }: { item: EarningsRow; locale: string }) {
  const surprise = num(item.surprise_pct)
  const tone = surprise === null ? "text-[var(--app-text-muted)]" : surprise >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"
  return (
    <tr>
      <td className="px-3 py-2 text-[var(--app-text-muted)]">FY{item.fiscal_year} Q{item.fiscal_quarter ?? "—"}</td>
      <td className="px-3 py-2 text-[var(--app-text-faint)]">{item.report_date ? formatDate(item.report_date, locale) : "—"}</td>
      <td className="px-3 py-2 text-right tabular-nums text-[var(--app-text-muted)]">{eps(item.eps_estimate)}</td>
      <td className="px-3 py-2 text-right tabular-nums font-medium text-[var(--app-text)]">{eps(item.eps_actual)}</td>
      <td className={`px-3 py-2 text-right tabular-nums font-medium ${tone}`}>
        {surprise === null ? "—" : `${surprise >= 0 ? "+" : ""}${(surprise * 100).toFixed(1)}%`}
      </td>
    </tr>
  )
}

function CorporateActionRow({ action, currency, locale }: { action: CorporateAction; currency: string; locale: string }) {
  const t = getTranslations()
  return (
    <li className="flex items-center justify-between gap-3 px-3 py-2.5">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-medium text-[var(--app-text)]">{actionType(action, t)}</p>
        <p className="mt-0.5 text-[9px] text-[var(--app-text-faint)]">Ex-date · {formatDate(action.ex_date, locale)}</p>
      </div>
      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--app-text)]">{actionValue(action, currency, locale)}</span>
    </li>
  )
}

function NewsRow({ item, locale, featured = false }: { item: NewsItem; locale: string; featured?: boolean }) {
  const content = (
    <>
      <div className="flex min-w-0 items-start gap-2.5">
        <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${sentimentClass(item.sentiment)}`} />
        <div className="min-w-0">
          <p className={`${featured ? "text-sm font-semibold leading-5" : "text-[11px] font-medium leading-4"} text-[var(--app-text)]`}>{item.headline}</p>
          <p className="mt-1 text-[9px] text-[var(--app-text-faint)]">
            {item.provider} · {formatDate(item.published_at, locale)}
            {item.sentiment ? ` · ${capitalize(item.sentiment)}` : ""}
          </p>
        </div>
      </div>
      {item.url ? <span className="shrink-0 text-[10px] font-semibold text-[var(--app-accent)]">Open</span> : null}
    </>
  )
  const className = `flex items-start justify-between gap-4 px-2 py-3 transition hover:bg-[var(--app-surface-hover)] ${featured ? "rounded-lg bg-[color-mix(in_srgb,var(--app-accent)_5%,transparent)] px-3" : ""}`

  return (
    <li>
      {item.url ? (
        <a href={item.url} target="_blank" rel="noopener noreferrer" className={className}>{content}</a>
      ) : (
        <div className={className}>{content}</div>
      )}
    </li>
  )
}

function EmptyState({ text }: { text: string }) {
  return <div className="app-muted-panel rounded-xl px-4 py-6 text-center text-[11px] text-[var(--app-text-faint)]">{text}</div>
}

function CompactEmpty({ text }: { text: string }) {
  return <p className="px-3 py-5 text-[11px] text-[var(--app-text-faint)]">{text}</p>
}

function compactAmount(value: string | null, locale: string): string {
  const amount = num(value)
  if (amount === null) return "—"
  return new Intl.NumberFormat(locale, { notation: "compact", maximumFractionDigits: 1 }).format(amount)
}

function actionType(action: CorporateAction, t: ReturnType<typeof getTranslations>): string {
  if (action.type === "dividend") return t("events.dividend")
  if (action.type === "reverse_split") return t("events.reverseSplit")
  return t("events.split")
}

function actionValue(action: CorporateAction, currency: string, locale: string): string {
  if (action.type === "dividend") {
    const amount = num(action.dividend_amount)
    return amount === null ? "—" : fmtCurrency(locale, amount, action.dividend_currency ?? currency)
  }
  const numerator = num(action.ratio_numerator)
  const denominator = num(action.ratio_denominator)
  return numerator !== null && denominator !== null ? `${numerator}:${denominator}` : "—"
}

function sentimentClass(sentiment: string | null): string {
  if (sentiment === "positive") return "bg-[var(--app-positive)]"
  if (sentiment === "negative") return "bg-[var(--app-negative)]"
  return "bg-[var(--app-text-faint)]"
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1)
}
