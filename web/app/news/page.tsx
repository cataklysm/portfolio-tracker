import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { fetchPortfolioNews } from "@/lib/portfolio-events"
import type { PositionView } from "@/lib/types"
import { getLocale } from "@/lib/locale"

export default async function NewsPage() {
  const [positionsResponse, locale] = await Promise.all([apiFetch("/positions", { cache: "no-store" }), getLocale()])
  const positions = positionsResponse.ok ? ((await positionsResponse.json()) as PositionView[]) : []
  const news = await fetchPortfolioNews(positions, 12)

  return (
    <div className="mx-auto max-w-[1000px] px-4 py-5 lg:px-6">
      <header className="mb-5">
        <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">News</h1>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">Recent market news relevant to your holdings.</p>
      </header>
      <section className="app-panel overflow-hidden rounded-xl">
        <div className="flex items-center justify-between border-b border-[var(--app-border)] px-4 py-3"><h2 className="text-xs font-semibold text-[var(--app-text)]">Latest headlines</h2><span className="text-[10px] tabular-nums text-[var(--app-text-faint)]">{news.length}</span></div>
        {news.length > 0 ? (
          <div className="divide-y divide-[var(--app-border)]">
            {news.map((item) => (
              <article key={item.id} className="px-4 py-3 transition hover:bg-[var(--app-surface-hover)]">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    {item.url ? <a href={item.url} target="_blank" rel="noopener noreferrer" className="text-sm font-medium leading-5 text-[var(--app-text)] hover:text-[var(--app-accent)]">{item.headline}</a> : <p className="text-sm font-medium leading-5 text-[var(--app-text)]">{item.headline}</p>}
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-[var(--app-text-faint)]"><Link href={`/positions/${item.context.positionId}`} className="font-semibold text-[var(--app-accent)] hover:underline">{item.context.name}</Link><span>{new Date(item.published_at).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</span><span>{item.provider}</span></div>
                  </div>
                </div>
              </article>
            ))}
          </div>
        ) : <p className="px-4 py-12 text-center text-xs text-[var(--app-text-faint)]">No recent news is currently available.</p>}
      </section>
    </div>
  )
}
