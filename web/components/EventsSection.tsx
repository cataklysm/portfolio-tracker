import type { CorporateAction, EarningsRow, NewsItem } from "@/lib/types"
import { getTranslations } from "@/lib/i18n"
import { fmtCurrency, num } from "@/lib/format"

interface Props {
  earnings: EarningsRow[]
  corporateActions: CorporateAction[]
  news: NewsItem[]
  currency: string
  locale: string
}

function eps(value: string | null): string {
  const n = num(value)
  return n === null ? "—" : n.toFixed(2)
}

/**
 * Read-only events for a position's instrument: earnings (upcoming + recent
 * history with beat/miss), corporate actions (dividends/splits), and news. Data
 * is fetched and refreshed in the background by the events service.
 */
export function EventsSection({ earnings, corporateActions, news, currency, locale }: Props) {
  const t = getTranslations()
  if (earnings.length === 0 && corporateActions.length === 0 && news.length === 0) {
    return <p className="text-sm text-[var(--app-text-faint)]">{t("events.empty")}</p>
  }

  const upcoming = earnings.filter((e) => e.is_upcoming)
  const history = earnings.filter((e) => !e.is_upcoming).slice(0, 6)
  const fmtDate = (iso: string) => new Date(iso).toLocaleDateString(locale)

  return (
    <div className="space-y-4">
      {/* Earnings */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">{t("events.earningsTitle")}</p>
        {upcoming.length === 0 && history.length === 0 ? (
          <p className="text-[11px] text-[var(--app-text-faint)]">{t("events.noEarnings")}</p>
        ) : (
          <div className="space-y-1">
            {upcoming.slice(0, 1).map((e) => (
              <div key={`up-${e.fiscal_year}-${e.fiscal_quarter}`} className="flex items-center justify-between rounded-lg border border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-accent)_8%,transparent)] px-3 py-2 text-[11px]">
                <span className="font-medium text-[var(--app-text)]">
                  {e.report_date ? t("events.reportsOn", { date: fmtDate(e.report_date) }) : t("events.upcoming")}
                </span>
                <span className="tabular-nums text-[var(--app-text-muted)]">{t("events.estimate")} {eps(e.eps_estimate)}</span>
              </div>
            ))}
            {history.length > 0 ? (
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="text-[var(--app-text-faint)]">
                    <th className="py-1 text-left font-medium"> </th>
                    <th className="py-1 text-right font-medium">{t("events.estimate")}</th>
                    <th className="py-1 text-right font-medium">{t("events.actual")}</th>
                    <th className="py-1 text-right font-medium">{t("events.surprise")}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((e) => {
                    const surprise = num(e.surprise_pct)
                    const tone = surprise === null ? "text-[var(--app-text-muted)]" : surprise >= 0 ? "text-[var(--app-positive)]" : "text-[var(--app-negative)]"
                    return (
                      <tr key={`${e.fiscal_year}-${e.fiscal_quarter}`} className="border-t border-[var(--app-border)]">
                        <td className="py-1 text-[var(--app-text-muted)]">FY{e.fiscal_year} Q{e.fiscal_quarter ?? "—"}</td>
                        <td className="py-1 text-right tabular-nums text-[var(--app-text-muted)]">{eps(e.eps_estimate)}</td>
                        <td className="py-1 text-right tabular-nums text-[var(--app-text)]">{eps(e.eps_actual)}</td>
                        <td className={`py-1 text-right tabular-nums ${tone}`}>{surprise === null ? "—" : `${surprise >= 0 ? "+" : ""}${(surprise * 100).toFixed(1)}%`}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            ) : null}
          </div>
        )}
      </div>

      {/* Corporate actions */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">{t("events.corpActionsTitle")}</p>
        {corporateActions.length === 0 ? (
          <p className="text-[11px] text-[var(--app-text-faint)]">{t("events.noCorpActions")}</p>
        ) : (
          <ul className="space-y-1">
            {corporateActions.slice(0, 6).map((a) => (
              <li key={a.stable_action_id} className="flex items-center justify-between text-[11px]">
                <span className="text-[var(--app-text-muted)]">{actionLabel(a, t)}</span>
                <span className="tabular-nums text-[var(--app-text)]">{actionValue(a, currency, locale)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* News */}
      <div>
        <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[var(--app-text-faint)]">{t("events.newsTitle")}</p>
        {news.length === 0 ? (
          <p className="text-[11px] text-[var(--app-text-faint)]">{t("events.noNews")}</p>
        ) : (
          <ul className="space-y-1.5">
            {news.slice(0, 8).map((item) => (
              <li key={item.id} className="text-[11px] leading-4">
                {item.url ? (
                  <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-[var(--app-text)] hover:text-[var(--app-accent)] hover:underline">
                    {item.headline}
                  </a>
                ) : (
                  <span className="text-[var(--app-text)]">{item.headline}</span>
                )}
                <span className="ml-1.5 text-[var(--app-text-faint)]">· {fmtDate(item.published_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function actionLabel(a: CorporateAction, t: ReturnType<typeof getTranslations>): string {
  const ex = new Date(a.ex_date).toISOString().slice(0, 10)
  const type = a.type === "dividend" ? t("events.dividend") : a.type === "reverse_split" ? t("events.reverseSplit") : t("events.split")
  return `${type} · ${ex}`
}

function actionValue(a: CorporateAction, currency: string, locale: string): string {
  if (a.type === "dividend") {
    const amt = num(a.dividend_amount)
    return amt === null ? "—" : fmtCurrency(locale, amt, a.dividend_currency ?? currency)
  }
  const numr = num(a.ratio_numerator)
  const den = num(a.ratio_denominator)
  return numr !== null && den !== null ? `${numr}:${den}` : "—"
}
