import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { DashboardOverview, PortfolioIntelligence } from "@/components/DashboardOverview"
import { PerformanceChart } from "@/components/PerformanceChart"
import { CreatePortfolioForm } from "@/components/CreatePortfolioForm"
import { AddPositionModal } from "@/components/AddPositionModal"
import { DashboardPrivacyProvider } from "@/components/DashboardPrivacy"
import { getTranslations } from "@/lib/i18n"
import type { ActivityPage, BenchmarkReport, ExchangeView, IntelligenceReport, NotificationInbox, PositionView, Portfolio, MeData, PerformancePeriod, PerformanceReport } from "@/lib/types"

interface Props {
  searchParams: Promise<{ portfolio?: string; period?: string }>
}

const PERIODS: PerformancePeriod[] = ["1W", "1M", "YTD", "1Y", "ALL"]

function asPeriod(raw: string | undefined): PerformancePeriod {
  return PERIODS.includes(raw as PerformancePeriod) ? (raw as PerformancePeriod) : "1Y"
}

async function fetchIntelligence(query: string): Promise<IntelligenceReport | null> {
  try {
    const response = await apiFetch(`/reporting/intelligence${query}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as IntelligenceReport) : null
  } catch {
    return null
  }
}

async function fetchNotifications(): Promise<NotificationInbox> {
  try {
    const response = await apiFetch("/notifications?limit=50", { cache: "no-store" })
    return response.ok ? ((await response.json()) as NotificationInbox) : { unread_count: 0, notifications: [] }
  } catch {
    return { unread_count: 0, notifications: [] }
  }
}

async function fetchPerformance(query: string): Promise<PerformanceReport | null> {
  try {
    const response = await apiFetch(`/reporting/performance${query}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as PerformanceReport) : null
  } catch {
    return null
  }
}

async function fetchBenchmark(portfolioId: string | undefined, period: PerformancePeriod): Promise<BenchmarkReport | null> {
  if (!portfolioId) return null
  try {
    const response = await apiFetch(`/reporting/benchmark?portfolio_id=${portfolioId}&period=${period}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as BenchmarkReport) : null
  } catch {
    return null
  }
}

async function fetchActivity(query: string): Promise<ActivityPage> {
  try {
    const separator = query ? "&" : "?"
    const response = await apiFetch(`/activity${query}${separator}limit=12`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as ActivityPage) : { items: [], next_cursor: null }
  } catch {
    return { items: [], next_cursor: null }
  }
}

export default async function DashboardPage({ searchParams }: Props) {
  const t = getTranslations()
  const { portfolio: selectedRaw, period: periodRaw } = await searchParams
  const period = asPeriod(periodRaw)
  const [portfoliosResp, meResp, exchangesResp, locale] = await Promise.all([
    apiFetch("/portfolios", { cache: "no-store" }),
    apiFetch("/me", { cache: "no-store" }),
    apiFetch("/exchanges", { cache: "no-store" }),
    getLocale(),
  ])
  const portfolios = (await portfoliosResp.json()) as Portfolio[]
  const me = (await meResp.json()) as MeData
  const exchanges = exchangesResp.ok ? ((await exchangesResp.json()) as ExchangeView[]) : []
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
  const perfQuery = `?period=${period}${selected ? `&portfolio_id=${selected}` : ""}`
  const [positionsResp, intelligence, notifications, performance, benchmark, activity] = await Promise.all([
    apiFetch(selected ? `/positions${query}` : "/positions", { cache: "no-store" }),
    fetchIntelligence(perfQuery),
    fetchNotifications(),
    fetchPerformance(perfQuery),
    fetchBenchmark(selected, period),
    fetchActivity(query),
  ])
  const positions = (await positionsResp.json()) as PositionView[]

  const latestQuote = positions
    .map((p) => p.quote_as_of)
    .filter((d): d is string => d !== null)
    .sort()
    .pop()

  return (
    <div className="mx-auto w-full max-w-[1920px] px-3 py-3 sm:px-4 lg:px-5">
      {positions.length === 0 ? (
        <div className="app-panel flex flex-col items-center justify-center rounded-xl py-24 text-center">
          <p className="mb-2 text-lg font-medium text-[var(--app-text)]">{t("dashboard.emptyTitle")}</p>
          <p className="mb-6 text-sm text-[var(--app-text-muted)]">{t("dashboard.emptySubtitle")}</p>
          <AddPositionModal portfolios={portfolios} exchanges={exchanges} selectedPortfolioId={selected} label={t("dashboard.addFirstPosition")} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white" />
        </div>
      ) : (
        <DashboardPrivacyProvider>
        <div className="space-y-3">
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_320px]">
            <div className="min-w-0 space-y-3">
              <PerformanceChart
                report={performance}
                benchmark={benchmark}
                period={period}
                portfolioId={selected}
                latestQuote={latestQuote}
                currency={reporting}
                locale={locale}
              />
              <DashboardOverview
                positions={positions}
                portfolios={portfolios}
                exchanges={exchanges}
                selectedPortfolioId={selected}
                activity={activity}
                reportingCurrency={reporting}
                locale={locale}
              />
            </div>
            <aside className="space-y-3">
              <PortfolioIntelligence positions={positions} locale={locale} currency={reporting} intelligence={intelligence} notifications={notifications} selectedPortfolioId={selected} />
            </aside>
          </div>
        </div>
        </DashboardPrivacyProvider>
      )}
    </div>
  )
}
