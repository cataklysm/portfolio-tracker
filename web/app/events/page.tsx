import { apiFetch } from "@/lib/api"
import { EventsWorkspace } from "@/features/events/components/EventsWorkspace"
import { getLocale } from "@/lib/locale"
import { fetchPortfolioEvents } from "@/lib/portfolio-events"
import type { PositionView } from "@/lib/types"

export default async function EventsPage() {
  const [positionsResponse, locale] = await Promise.all([apiFetch("/positions", { cache: "no-store" }), getLocale()])
  const positions = positionsResponse.ok ? ((await positionsResponse.json()) as PositionView[]) : []
  const { earnings, corporateActions } = await fetchPortfolioEvents(positions)

  return <EventsWorkspace earnings={earnings} corporateActions={corporateActions} locale={locale} />
}
