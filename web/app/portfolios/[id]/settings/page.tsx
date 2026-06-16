import { notFound } from "next/navigation"
import Link from "next/link"
import { apiFetch } from "@/lib/api"
import type { ListingDetail, Portfolio } from "@/lib/types"
import { PortfolioBenchmarkSettings } from "@/components/PortfolioBenchmarkSettings"

export default async function PortfolioSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const portfoliosResponse = await apiFetch("/portfolios", { cache: "no-store" })
  const portfolios = portfoliosResponse.ok ? ((await portfoliosResponse.json()) as Portfolio[]) : []
  const portfolio = portfolios.find((item) => item.id === id)
  if (!portfolio) notFound()

  const listingResponse = portfolio.preferred_benchmark
    ? await apiFetch(`/listings/${portfolio.preferred_benchmark}`, { cache: "no-store" })
    : null
  const listing = listingResponse?.ok ? ((await listingResponse.json()) as ListingDetail) : null
  const current = portfolio.preferred_benchmark
    ? { listingId: portfolio.preferred_benchmark, label: listing ? `${listing.symbol} · ${listing.exchange_mic ?? "?"} · ${listing.currency}` : portfolio.preferred_benchmark }
    : null

  return (
    <div className="mx-auto max-w-4xl space-y-4 px-4 py-5 lg:px-6">
      <header className="flex items-start justify-between gap-4">
        <div><h1 className="text-xl font-semibold text-[var(--app-text)]">{portfolio.name} settings</h1><p className="mt-1 text-xs text-[var(--app-text-muted)]">Configuration that applies only to this portfolio.</p></div>
        <Link href={`/dashboard?portfolio=${portfolio.id}`} className="rounded-lg border border-[var(--app-border)] px-3 py-1.5 text-xs text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">Back to portfolio</Link>
      </header>
      <PortfolioBenchmarkSettings portfolioId={portfolio.id} current={current} />
    </div>
  )
}
