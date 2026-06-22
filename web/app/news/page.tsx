import { NewsWorkspace } from "@/features/news/components/NewsWorkspace"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { fetchPortfolioNews } from "@/lib/portfolio-events"
import type { PositionView } from "@/lib/types"

export default async function NewsPage() {
  const [positionsResponse, locale] = await Promise.all([apiFetch("/positions", { cache: "no-store" }), getLocale()])
  const positions = positionsResponse.ok ? ((await positionsResponse.json()) as PositionView[]) : []
  const news = await fetchPortfolioNews(positions, 12)

  return <NewsWorkspace news={news} locale={locale} />
}
