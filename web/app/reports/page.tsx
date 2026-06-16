import Link from "next/link"
import { apiFetch } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import type {
  Portfolio,
  PortfolioTaxSettings,
  ReportingSnapshot,
  TaxEstimate,
  TaxEvent,
  TaxResidencyView,
  TaxRule,
} from "@/lib/types"
import { ReportsOverview } from "@/components/ReportsOverview"
import { RiskPanel, type RiskReport } from "@/components/RiskPanel"
import { TaxCenter } from "@/components/TaxCenter"
import { TaxEstimatePanel } from "@/components/TaxEstimatePanel"
import { PortfolioTaxConfigCard } from "@/components/PortfolioTaxConfigCard"
import { TaxGlossary } from "@/components/TaxGlossary"

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
  const selectedPortfolio = portfolios.find((portfolio) => portfolio.id === selected)
  // One consistent snapshot for summary/holdings/allocation/tax (no cross-request
  // drift); the tax-events/estimate/residency reads are separate concerns.
  const [snapshot, taxEvents, taxEstimate, residency, risk] = await Promise.all([
    report<ReportingSnapshot>("/reporting/snapshot", selected),
    report<TaxEvent[]>("/tax-events", selected),
    report<TaxEstimate>("/reporting/tax/estimate", selected),
    report<TaxResidencyView>("/tax-residency"),
    report<RiskReport>("/reporting/risk", selected),
  ])
  const summary = snapshot?.summary ?? null
  const holdings = snapshot?.holdings ?? null
  const allocation = snapshot?.allocation ?? null
  const taxReport = snapshot?.tax ?? null

  // Per-portfolio tax configuration is only offered when a single portfolio is
  // selected; it needs the residence's rules and the portfolio's saved settings.
  const country = residency?.current?.country_code ?? null
  const [taxRules, portfolioTaxSettings] = await Promise.all([
    selected && country ? report<TaxRule[]>(`/tax-rules?country=${country}`) : Promise.resolve(null),
    selected ? report<PortfolioTaxSettings>(`/portfolios/${selected}/tax-settings`) : Promise.resolve(null),
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
          <RiskPanel report={risk} />
          {taxEstimate ? <TaxEstimatePanel estimate={taxEstimate} locale={locale} /> : null}
          {taxReport ? (
            <TaxCenter
              report={taxReport}
              events={taxEvents ?? []}
              locale={locale}
              portfolios={portfolios.map((p) => ({ id: p.id, name: p.name }))}
              selectedPortfolioId={selected}
            />
          ) : null}
          {selectedPortfolio && taxRules ? (
            <PortfolioTaxConfigCard
              portfolio={{ id: selectedPortfolio.id, name: selectedPortfolio.name }}
              rules={taxRules}
              current={portfolioTaxSettings}
            />
          ) : null}
          <TaxGlossary />
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
