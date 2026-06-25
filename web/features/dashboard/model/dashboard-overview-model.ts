import { num } from "@/lib/format"
import type { Portfolio, PositionView } from "@/lib/types"

export type DashboardDataTone = "success" | "warning" | "danger" | "neutral"

export interface DashboardAssetRow {
  key: string
  type: string
  listingId: string
  positionId: string
  name: string
  symbol: string
  currency: string
  price: number | null
  value: number
  cost: number
  pnl: number
  dailyAmount: number | null
  dailyPct: number | null
  returnPct: number | null
  allocation: number
  state: PositionView["state"]
  dataStatus: DashboardDataStatus
  portfolios: { id: string; name: string; value: number }[]
}

export interface DashboardDataStatus {
  label: string
  detail: string
  rank: number
  tone: DashboardDataTone
}

export type DashboardOverviewModel = ReturnType<typeof buildDashboardOverviewModel>

export function buildDashboardOverviewModel(positions: PositionView[], portfolios: Portfolio[]) {
  const portfolioNames = new Map(portfolios.map((portfolio) => [portfolio.id, portfolio.name]))
  const openPositions = positions.filter((position) => position.state !== "closed")
  const totalValue = openPositions.reduce((sum, position) => sum + (num(position.performance.current_value_reporting) ?? 0), 0)
  const assetMap = new Map<string, DashboardAssetRow>()

  for (const position of positions) {
    const listing = position.listing
    const type = listing?.asset_type ?? "equity"
    const value = num(position.performance.current_value_reporting) ?? 0
    const cost = num(position.performance.open_cost_basis_reporting) ?? 0
    const pnl = position.state === "closed"
      ? (num(position.performance.realized_pnl_reporting) ?? 0)
      : (num(position.performance.unrealized_pnl_reporting) ?? 0)
    const dailyPct = num(position.performance.daily_change_pct)
    const dailyAmount = num(position.performance.daily_change_amount_reporting) ?? (dailyPct === null ? null : value * (dailyPct / 100))
    const key = listing?.instrument_id ?? position.listing_id
    const existing = assetMap.get(key)
    const portfolioValue = existing?.portfolios.find((portfolio) => portfolio.id === position.portfolio_id)
    const dataStatus = classifyDashboardDataStatus(position)

    if (existing) {
      existing.value += value
      existing.cost += cost
      existing.pnl += pnl
      existing.dailyAmount = dailyAmount === null
        ? existing.dailyAmount
        : (existing.dailyAmount ?? 0) + dailyAmount
      existing.state = existing.state === "open" || position.state === "open" ? "open" : position.state
      existing.dataStatus = dataStatus.rank > existing.dataStatus.rank ? dataStatus : existing.dataStatus
      if (portfolioValue) portfolioValue.value += value
      else existing.portfolios.push({ id: position.portfolio_id, name: portfolioNames.get(position.portfolio_id) ?? "Portfolio", value })
      continue
    }

    assetMap.set(key, {
      allocation: 0,
      cost,
      currency: listing?.currency ?? position.performance.listing_currency,
      dailyAmount,
      dailyPct,
      dataStatus,
      key,
      listingId: position.listing_id,
      name: listing?.name ?? "Unknown asset",
      pnl,
      portfolios: [{ id: position.portfolio_id, name: portfolioNames.get(position.portfolio_id) ?? "Portfolio", value }],
      positionId: position.id,
      price: num(position.performance.current_price),
      returnPct: null,
      state: position.state,
      symbol: listing?.symbol ?? position.listing_id,
      type,
      value,
    })
  }

  const assetRows = [...assetMap.values()]
    .map((assetRow) => ({
      ...assetRow,
      allocation: totalValue > 0 ? (assetRow.value / totalValue) * 100 : 0,
      dailyPct: assetRow.value > 0 && assetRow.dailyAmount !== null ? (assetRow.dailyAmount / assetRow.value) * 100 : null,
      portfolios: assetRow.portfolios.sort((firstPortfolio, secondPortfolio) => secondPortfolio.value - firstPortfolio.value),
      returnPct: assetRow.cost > 0 ? (assetRow.pnl / assetRow.cost) * 100 : null,
    }))
    .sort((firstAssetRow, secondAssetRow) => secondAssetRow.value - firstAssetRow.value)

  const openAssetRows = assetRows.filter((assetRow) => assetRow.state !== "closed")
  const invested = openPositions.reduce((sum, position) => sum + (num(position.performance.open_cost_basis_reporting) ?? 0), 0)
  const unrealized = openPositions.reduce((sum, position) => sum + (num(position.performance.unrealized_pnl_reporting) ?? 0), 0)
  const realized = positions.reduce((sum, position) => sum + (num(position.performance.realized_pnl_reporting) ?? 0), 0)
  const totalPnl = unrealized + realized
  const cash = openAssetRows.filter((assetRow) => assetRow.type === "cash").reduce((sum, assetRow) => sum + assetRow.value, 0)
  const dailyAmount = openAssetRows.reduce<number | null>((sum, assetRow) => assetRow.dailyAmount === null ? sum : (sum ?? 0) + assetRow.dailyAmount, null)
  const dailyPct = totalValue > 0 && dailyAmount !== null ? (dailyAmount / totalValue) * 100 : null
  const biggestMover = [...openAssetRows]
    .filter((assetRow) => assetRow.dailyAmount !== null)
    .sort((firstAssetRow, secondAssetRow) => Math.abs(secondAssetRow.dailyAmount ?? 0) - Math.abs(firstAssetRow.dailyAmount ?? 0))[0] ?? null
  const biggestGainer = [...openAssetRows]
    .filter((assetRow) => (assetRow.dailyPct ?? 0) > 0)
    .sort((firstAssetRow, secondAssetRow) => (secondAssetRow.dailyPct ?? 0) - (firstAssetRow.dailyPct ?? 0))[0] ?? null
  const biggestLoser = [...openAssetRows]
    .filter((assetRow) => (assetRow.dailyPct ?? 0) < 0)
    .sort((firstAssetRow, secondAssetRow) => (firstAssetRow.dailyPct ?? 0) - (secondAssetRow.dailyPct ?? 0))[0] ?? null
  const gainers = openAssetRows.filter((assetRow) => (assetRow.dailyPct ?? 0) > 0).length
  const losers = openAssetRows.filter((assetRow) => (assetRow.dailyPct ?? 0) < 0).length
  const unchanged = openAssetRows.length - gainers - losers
  const warningRows = openAssetRows.filter((assetRow) => assetRow.dataStatus.tone === "warning" || assetRow.dataStatus.tone === "danger")
  const neutralRows = openAssetRows.filter((assetRow) => assetRow.dataStatus.tone === "neutral")

  const byPortfolio = portfolios
    .map((portfolio) => {
      const portfolioPositions = openPositions.filter((position) => position.portfolio_id === portfolio.id)
      const value = portfolioPositions.reduce((sum, position) => sum + (num(position.performance.current_value_reporting) ?? 0), 0)
      const cost = portfolioPositions.reduce((sum, position) => sum + (num(position.performance.open_cost_basis_reporting) ?? 0), 0)
      const pnl = portfolioPositions.reduce((sum, position) => sum + (num(position.performance.unrealized_pnl_reporting) ?? 0), 0)
      return {
        allocation: totalValue > 0 ? (value / totalValue) * 100 : 0,
        id: portfolio.id,
        name: portfolio.name,
        returnPct: cost > 0 ? (pnl / cost) * 100 : null,
        value,
      }
    })
    .filter((portfolio) => portfolio.value > 0)
    .sort((firstPortfolio, secondPortfolio) => secondPortfolio.value - firstPortfolio.value)

  const byType = Object.entries(openAssetRows.reduce<Record<string, number>>((totalsByType, assetRow) => {
    totalsByType[assetRow.type] = (totalsByType[assetRow.type] ?? 0) + assetRow.value
    return totalsByType
  }, {})).sort((firstType, secondType) => secondType[1] - firstType[1])

  return {
    assetRows,
    byPortfolio,
    byType,
    cash,
    dailyAmount,
    dailyPct,
    gainers,
    invested,
    invalidCount: positions.filter((position) => position.state === "invalid").length,
    losers,
    neutralRows,
    openAssetRows,
    totalPnl,
    totalValue,
    unchanged,
    unrealized,
    realized,
    returnPct: invested > 0 ? (totalPnl / invested) * 100 : null,
    biggestGainer,
    biggestLoser,
    biggestMover,
    warningRows,
  }
}

function classifyDashboardDataStatus(position: PositionView): DashboardDataStatus {
  if (position.state === "invalid") return { detail: "Position ledger needs review.", label: "Invalid", rank: 4, tone: "danger" }
  if (position.freshness_status === "fresh") return { detail: "Latest quote accepted.", label: "Fresh", rank: 0, tone: "success" }
  if (position.freshness_status === "unavailable" && position.performance.current_price === null) {
    return { detail: "No usable quote is available for valuation.", label: "Missing", rank: 3, tone: "warning" }
  }
  if (position.freshness_status === "stale" || position.freshness_status === "unavailable") {
    return { detail: "Exchange-aware neutral state; last official close is accepted until the next trading session.", label: "Market closed", rank: 1, tone: "neutral" }
  }
  return { detail: "Quote state is not classified.", label: "Unknown", rank: 2, tone: "neutral" }
}
