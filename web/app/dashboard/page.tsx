import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { DashboardOverview, PortfolioIntelligence } from "@/features/dashboard/components/DashboardOverview"
import { DashboardPrivacyProvider } from "@/features/dashboard/components/DashboardPrivacy"
import { CreatePortfolioForm } from "@/features/portfolios/components/CreatePortfolioForm"
import { AddPositionModal } from "@/features/positions/components/AddPositionModal"
import { getTranslations } from "@/lib/i18n"
import { fetchPortfolioEvents } from "@/lib/portfolio-events"
import type { ExchangeView, IntelligenceReport, MeData, NotificationInbox, PerformancePeriod, PerformanceReport, Portfolio, PositionView } from "@/lib/types"

interface DashboardPageProperties {
  searchParams: Promise<{ portfolio?: string; period?: string }>
}

const PERIODS: PerformancePeriod[] = ["1W", "1M", "YTD", "1Y", "ALL"]

function parsePerformancePeriod(rawPeriod: string | undefined): PerformancePeriod {
  return PERIODS.includes(rawPeriod as PerformancePeriod) ? (rawPeriod as PerformancePeriod) : "1Y"
}

async function fetchPortfolioIntelligence(query: string): Promise<IntelligenceReport | null> {
  try {
    const response = await apiFetch(`/reporting/intelligence${query}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as IntelligenceReport) : null
  } catch {
    return null
  }
}

async function fetchNotificationInbox(): Promise<NotificationInbox> {
  try {
    const response = await apiFetch("/notifications?limit=50", { cache: "no-store" })
    return response.ok ? ((await response.json()) as NotificationInbox) : { unread_count: 0, notifications: [] }
  } catch {
    return { unread_count: 0, notifications: [] }
  }
}

async function fetchPerformanceReport(query: string): Promise<PerformanceReport | null> {
  try {
    const response = await apiFetch(`/reporting/performance${query}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as PerformanceReport) : null
  } catch {
    return null
  }
}

export default async function DashboardPage({ searchParams }: DashboardPageProperties) {
  const translations = getTranslations()
  const { portfolio: selectedRawPortfolioId, period: rawPerformancePeriod } = await searchParams
  const performancePeriod = parsePerformancePeriod(rawPerformancePeriod)
  const [portfoliosResponse, profileResponse, exchangesResponse, locale] = await Promise.all([
    apiFetch("/portfolios", { cache: "no-store" }),
    apiFetch("/me", { cache: "no-store" }),
    apiFetch("/exchanges", { cache: "no-store" }),
    getLocale(),
  ])
  const portfolios = (await portfoliosResponse.json()) as Portfolio[]
  const profile = (await profileResponse.json()) as MeData
  const exchanges = exchangesResponse.ok ? ((await exchangesResponse.json()) as ExchangeView[]) : []
  const reportingCurrency = profile.preferences.reporting_currency

  // No portfolio yet: show the creation form and never auto-create one.
  if (portfolios.length === 0) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col items-center px-4 py-24 text-center">
        <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--app-text)]">{translations("dashboard.createFirstTitle")}</h1>
        <p className="mb-6 text-sm text-[var(--app-text-muted)]">{translations("dashboard.createFirstSubtitle")}</p>
        <CreatePortfolioForm />
      </div>
    )
  }

  const selectedPortfolioId = portfolios.find((portfolio) => portfolio.id === selectedRawPortfolioId)?.id
  const positionsQuery = selectedPortfolioId ? `?portfolio_id=${selectedPortfolioId}` : ""
  const performanceQuery = `?period=${performancePeriod}${selectedPortfolioId ? `&portfolio_id=${selectedPortfolioId}` : ""}`
  const [positionsResponse, intelligence, notifications, performance] = await Promise.all([
    apiFetch(selectedPortfolioId ? `/positions${positionsQuery}` : "/positions", { cache: "no-store" }),
    fetchPortfolioIntelligence(performanceQuery),
    fetchNotificationInbox(),
    fetchPerformanceReport(performanceQuery),
  ])
  const positions = (await positionsResponse.json()) as PositionView[]
  const events = await fetchPortfolioEvents(positions)

  const latestQuote = positions
    .map((position) => position.quote_as_of)
    .filter((quoteDate): quoteDate is string => quoteDate !== null)
    .sort()
    .pop()

  return (
    <div className="mx-auto w-full max-w-[1920px] px-3 py-3 sm:px-4 lg:px-5">
      {positions.length === 0 ? (
        <div className="app-panel flex flex-col items-center justify-center rounded-xl py-24 text-center">
          <p className="mb-2 text-lg font-medium text-[var(--app-text)]">{translations("dashboard.emptyTitle")}</p>
          <p className="mb-6 text-sm text-[var(--app-text-muted)]">{translations("dashboard.emptySubtitle")}</p>
          <AddPositionModal portfolios={portfolios} exchanges={exchanges} selectedPortfolioId={selectedPortfolioId} label={translations("dashboard.addFirstPosition")} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-sm font-medium text-white" />
        </div>
      ) : (
        <DashboardPrivacyProvider>
          <div className="space-y-3">
            <DashboardOverview
              positions={positions}
              portfolios={portfolios}
              exchanges={exchanges}
              selectedPortfolioId={selectedPortfolioId}
              performance={performance}
              period={performancePeriod}
              latestQuote={latestQuote}
              reportingCurrency={reportingCurrency}
              locale={locale}
              rail={<PortfolioIntelligence positions={positions} portfolios={portfolios} locale={locale} currency={reportingCurrency} intelligence={intelligence} notifications={notifications} selectedPortfolioId={selectedPortfolioId} events={events} />}
            />
          </div>
        </DashboardPrivacyProvider>
      )}
    </div>
  )
}
