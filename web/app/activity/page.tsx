import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import type { ActivityPage, BookingChange, CashFlow, Portfolio, PositionView } from "@/lib/types"
import { ActivityWorkspace } from "@/components/ActivityWorkspace"

interface Props {
  searchParams: Promise<{ tab?: string; portfolio?: string; type?: string; entity?: string }>
}

const EMPTY_FEED: ActivityPage = { items: [], next_cursor: null }

async function json<T>(path: string): Promise<T | null> {
  try {
    const response = await apiFetch(path, { cache: "no-store" })
    return response.ok ? await response.json() as T : null
  } catch {
    return null
  }
}

export default async function ActivityPage({ searchParams }: Props) {
  const params = await searchParams
  const tab = params.tab === "changes" ? "changes" : params.tab === "cash" ? "cash" : "feed"
  const cashTypes = ["dividend", "deposit", "withdrawal", "cash_in_lieu"]
  const feedTypes = ["trade", "cash_flow", "tax_event"]
  const selectedType = tab === "feed"
    ? (feedTypes.includes(params.type ?? "") ? params.type : undefined)
    : (cashTypes.includes(params.type ?? "") ? params.type : undefined)
  const selectedEntity = ["transaction", "cash_flow", "tax_event"].includes(params.entity ?? "") ? params.entity : undefined
  const [portfolios, positions, locale] = await Promise.all([
    json<Portfolio[]>("/portfolios"),
    json<PositionView[]>("/positions"),
    getLocale(),
  ])
  const activePortfolios = portfolios ?? []
  const selectedPortfolio = activePortfolios.some((portfolio) => portfolio.id === params.portfolio) ? params.portfolio : undefined
  let feed: ActivityPage = EMPTY_FEED
  let cashFlows: CashFlow[] = []
  let changes: BookingChange[] = []

  if (tab === "feed") {
    const query = new URLSearchParams()
    if (selectedPortfolio) query.set("portfolio_id", selectedPortfolio)
    if (selectedType) query.set("type", selectedType)
    feed = await json<ActivityPage>(`/activity${query.size ? `?${query}` : ""}`) ?? EMPTY_FEED
  } else if (tab === "cash") {
    const targets = selectedPortfolio ? [selectedPortfolio] : activePortfolios.map((portfolio) => portfolio.id)
    const suffix = selectedType ? `?type=${encodeURIComponent(selectedType)}` : ""
    const rows = await Promise.all(targets.map((id) => json<CashFlow[]>(`/portfolios/${id}/cash-flows${suffix}`)))
    cashFlows = rows.flatMap((row) => row ?? []).sort((a, b) => b.payment_date.localeCompare(a.payment_date))
  } else {
    const query = new URLSearchParams()
    if (selectedPortfolio) query.set("portfolio_id", selectedPortfolio)
    if (selectedEntity) query.set("entity_type", selectedEntity)
    changes = await json<BookingChange[]>(`/changes${query.size ? `?${query}` : ""}`) ?? []
  }

  const summaryQuery = new URLSearchParams({ limit: "100" })
  if (selectedPortfolio) summaryQuery.set("portfolio_id", selectedPortfolio)
  const summary = tab === "feed" && !selectedType
    ? feed
    : await json<ActivityPage>(`/activity?${summaryQuery}`) ?? EMPTY_FEED

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 lg:px-6">
      <header>
        <h1 className="text-xl font-semibold text-[var(--app-text)]">Activity</h1>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">One chronological stream of trades, cash flows, and tax events, plus cash-flow management and immutable change history.</p>
      </header>
      <ActivityWorkspace
        tab={tab}
        summary={summary}
        feed={feed}
        cashFlows={cashFlows}
        changes={changes}
        portfolios={activePortfolios}
        positions={positions ?? []}
        selectedPortfolio={selectedPortfolio}
        selectedType={selectedType}
        selectedEntity={selectedEntity}
        locale={locale}
      />
    </div>
  )
}
