import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import type { AllocationReport, Portfolio, PortfolioReportSummary, ReportHolding, TaxEvent, TaxReport } from "@/lib/types"
import { ReportsOverview } from "@/components/ReportsOverview"
import { TaxCenter } from "@/components/TaxCenter"

interface Props {
  searchParams: Promise<{ portfolio?: string }>
}

async function report<T>(path: string, portfolioId?: string): Promise<T | null> {
  try {
    const query = portfolioId ? `?portfolio_id=${portfolioId}` : ""
    const response = await apiFetch(`${path}${query}`, { cache: "no-store" })
    return response.ok ? ((await response.json()) as T) : null
  } catch {
    return null
  }
}

export default async function ReportsPage({ searchParams }: Props) {
  const { portfolio: selectedRaw } = await searchParams
  const [portfoliosResponse, locale] = await Promise.all([
    apiFetch("/portfolios", { cache: "no-store" }),
    getLocale(),
  ])
  const portfolios = portfoliosResponse.ok ? ((await portfoliosResponse.json()) as Portfolio[]) : []
  const selected = portfolios.find((portfolio) => portfolio.id === selectedRaw)?.id
  const [summary, holdings, allocation, taxReport, taxEvents] = await Promise.all([
    report<PortfolioReportSummary>("/reporting/summary", selected),
    report<ReportHolding[]>("/reporting/holdings", selected),
    report<AllocationReport>("/reporting/allocation", selected),
    report<TaxReport>("/reporting/tax", selected),
    report<TaxEvent[]>("/tax-events", selected),
  ])

  return (
    <div className="mx-auto max-w-[1500px] space-y-4 px-4 py-5 lg:px-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">Portfolio reports</h1>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">Authoritative performance, income, holdings, and allocation reporting.</p>
        </div>
        <div className="flex flex-wrap gap-1">
          <FilterPill href="/reports" label="All portfolios" active={!selected} />
          {portfolios.map((portfolio) => (
            <FilterPill key={portfolio.id} href={`/reports?portfolio=${portfolio.id}`} label={portfolio.name} active={selected === portfolio.id} />
          ))}
        </div>
      </header>

      {summary && holdings && allocation ? (
        <>
          <ReportsOverview summary={summary} holdings={holdings} allocation={allocation} locale={locale} />
          {taxReport ? (
            <TaxCenter
              report={taxReport}
              events={taxEvents ?? []}
              locale={locale}
              portfolios={portfolios.map((p) => ({ id: p.id, name: p.name }))}
              selectedPortfolioId={selected}
            />
          ) : null}
        </>
      ) : (
        <section className="app-panel rounded-xl px-5 py-16 text-center">
          <p className="text-sm font-medium text-[var(--app-text)]">Reporting data is currently unavailable.</p>
          <p className="mt-1 text-xs text-[var(--app-text-muted)]">The portfolio reporting endpoints could not provide a complete report.</p>
        </section>
      )}
    </div>
  )
}

function FilterPill({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`rounded-md border px-2.5 py-1 text-[10px] font-medium transition ${active ? "border-[color-mix(in_srgb,var(--app-accent)_48%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"}`}>
      {label}
    </Link>
  )
}
