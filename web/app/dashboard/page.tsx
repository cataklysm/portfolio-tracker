import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { DashboardOverview } from "@/components/DashboardOverview"
import { CreatePortfolioForm } from "@/components/CreatePortfolioForm"
import { getTranslations } from "@/lib/i18n"
import type { PositionView, Portfolio, MeData, TaxReport } from "@/lib/types"

interface Props {
  searchParams: Promise<{ portfolio?: string }>
}

async function fetchTaxReport(query: string): Promise<TaxReport | null> {
  try {
    const response = await apiFetch(`/reporting/tax${query}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as TaxReport) : null
  } catch {
    return null
  }
}

export default async function DashboardPage({ searchParams }: Props) {
  const t = getTranslations()
  const { portfolio: selectedRaw } = await searchParams
  const [portfoliosResp, meResp, locale] = await Promise.all([
    apiFetch("/portfolios", { cache: "no-store" }),
    apiFetch("/me", { cache: "no-store" }),
    getLocale(),
  ])
  const portfolios = (await portfoliosResp.json()) as Portfolio[]
  const me = (await meResp.json()) as MeData
  const reporting = me.preferences.reporting_currency

  // No portfolio yet → show the creation form (never auto-create one).
  if (portfolios.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--app-text)]">{t("dashboard.createFirstTitle")}</h1>
        <p className="mb-6 text-sm text-[var(--app-text-muted)]">{t("dashboard.createFirstSubtitle")}</p>
        <CreatePortfolioForm />
      </div>
    )
  }

  const selected = portfolios.find((p) => p.id === selectedRaw)?.id
  const query = selected ? `?portfolio_id=${selected}` : ""
  const [positionsResp, taxReport] = await Promise.all([
    apiFetch(selected ? `/positions${query}` : "/positions", { cache: "no-store" }),
    fetchTaxReport(query),
  ])
  const positions = (await positionsResp.json()) as PositionView[]

  const latestQuote = positions
    .map((p) => p.quote_as_of)
    .filter((d): d is string => d !== null)
    .sort()
    .pop()

  return (
    <div className="mx-auto max-w-[1500px] px-3 py-3 sm:px-4 lg:px-5">
      <header className="mb-3 hidden items-center justify-between gap-4 lg:flex">
        <div className="flex items-center gap-3">
          <h1 className="text-sm font-semibold tracking-tight text-[var(--app-text)]">{t("dashboard.title")}</h1>
          <span className="h-4 w-px bg-[var(--app-border)]" />
          <div className="flex flex-wrap gap-1">
            <FilterPill href="/dashboard" label={t("dashboard.allPortfolios")} active={!selected} />
            {portfolios.map((p) => <FilterPill key={p.id} href={`/dashboard?portfolio=${p.id}`} label={p.name} active={selected === p.id} />)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {latestQuote && <span className="text-[9px] text-[var(--app-text-faint)]">{t("dashboard.quotesAsOf", { time: new Date(latestQuote).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) })}</span>}
          <Link href="/positions/add" className="rounded-lg bg-[var(--app-accent)] px-3 py-2 text-xs font-semibold text-white transition hover:brightness-110">{t("dashboard.addPosition")}</Link>
        </div>
      </header>

      <div className="mb-3 flex flex-wrap gap-1 lg:hidden">
        <FilterPill href="/dashboard" label={t("dashboard.allPortfolios")} active={!selected} />
        {portfolios.map((p) => <FilterPill key={p.id} href={`/dashboard?portfolio=${p.id}`} label={p.name} active={selected === p.id} />)}
        <Link href="/positions/add" className="ml-auto rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-[10px] font-semibold text-white">{t("dashboard.addPosition")}</Link>
      </div>

      {positions.length === 0 ? (
        <div className="app-panel flex flex-col items-center justify-center rounded-xl py-24 text-center">
          <p className="mb-2 text-lg font-medium text-[var(--app-text)]">{t("dashboard.emptyTitle")}</p>
          <p className="mb-6 text-sm text-[var(--app-text-muted)]">{t("dashboard.emptySubtitle")}</p>
          <Link href="/positions/add" className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white">
            {t("dashboard.addFirstPosition")}
          </Link>
        </div>
      ) : (
        <DashboardOverview positions={positions} reportingCurrency={reporting} locale={locale} taxReport={taxReport} />
      )}
    </div>
  )
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      className={`rounded-md border px-2.5 py-1 text-[10px] font-medium transition-all ${
        active
          ? "border-[color-mix(in_srgb,var(--app-accent)_48%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
          : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
      }`}
    >
      {label}
    </Link>
  )
}
