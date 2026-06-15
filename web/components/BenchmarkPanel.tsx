"use client"
import { useState, useTransition } from "react"
import Link from "next/link"
import { searchInstrumentsAction } from "@/app/positions/add/actions"
import { setPreferredBenchmarkAction } from "@/app/reports/benchmark-actions"
import { fmtPct } from "@/lib/format"
import type { InstrumentWithListings } from "@/lib/types"

/** GET /reporting/benchmark response (kept local to avoid lib/types coupling). */
export interface BenchmarkReport {
  period: string
  reporting_currency: string
  from: string
  to: string
  benchmark_listing_id: string
  portfolio_return_pct: string | null
  benchmark_return_pct: string | null
  excess_return_pct: string | null
  beta: string | null
  correlation: string | null
  tracking_error_pct: string | null
  series: { date: string; portfolio: string | null; benchmark: string | null }[]
}

const PERIODS = ["1W", "1M", "YTD", "1Y", "ALL"] as const
const W = 760
const H = 200

interface Props {
  portfolioId: string
  report: BenchmarkReport | null
  period: string
  /** A friendly label for the saved benchmark when known (else the listing id is shown). */
  benchmarkLabel?: string | null
}

export function BenchmarkPanel({ portfolioId, report, period, benchmarkLabel }: Props) {
  const [open, setOpen] = useState(false)
  // A label the user just chose this session survives revalidation (the picker
  // sets it); on a fresh load we fall back to the prop or the listing id.
  const [pickedLabel, setPickedLabel] = useState<string | null>(null)
  const [isSaving, startSave] = useTransition()
  const [clearError, setClearError] = useState<string | null>(null)
  const label = pickedLabel ?? benchmarkLabel ?? (report ? short(report.benchmark_listing_id) : null)

  function clear() {
    startSave(async () => {
      const err = await setPreferredBenchmarkAction(portfolioId, null)
      if (err) setClearError(err)
      else setPickedLabel(null)
    })
  }

  return (
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--app-border)] px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-xs font-semibold text-[var(--app-text)]">Benchmark</h2>
          {label && <span className="text-[10px] text-[var(--app-text-muted)]">vs {label}</span>}
        </div>
        <div className="flex items-center gap-2">
          {report && (
            <div className="flex gap-1">
              {PERIODS.map((p) => (
                <Link
                  key={p}
                  href={`/reports?portfolio=${portfolioId}&bperiod=${p}`}
                  scroll={false}
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-medium transition ${
                    p === period
                      ? "border-[color-mix(in_srgb,var(--app-accent)_48%,var(--app-border))] bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
                      : "border-[var(--app-border)] bg-[var(--app-surface)] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
                  }`}
                >
                  {p}
                </Link>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-text)]"
          >
            {report ? "Change" : "Set benchmark"}
          </button>
          {report && (
            <button
              type="button"
              onClick={clear}
              disabled={isSaving}
              className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-0.5 text-[10px] font-medium text-[var(--app-text-faint)] hover:text-[var(--app-negative)] disabled:opacity-50"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {clearError && <p className="border-b border-[var(--app-border)] bg-rose-950/40 px-4 py-2 text-[10px] text-rose-400">{clearError}</p>}

      {open && (
        <BenchmarkPicker
          portfolioId={portfolioId}
          onPicked={(lbl) => {
            setPickedLabel(lbl)
            setOpen(false)
          }}
        />
      )}

      {report ? (
        <>
          <div className="grid grid-cols-2 gap-px bg-[var(--app-border)] sm:grid-cols-3 lg:grid-cols-6">
            <Cell label="Portfolio" value={pct(report.portfolio_return_pct)} tone={signTone(report.portfolio_return_pct)} />
            <Cell label="Benchmark" value={pct(report.benchmark_return_pct)} tone={signTone(report.benchmark_return_pct)} />
            <Cell label="Excess" value={pct(report.excess_return_pct)} tone={signTone(report.excess_return_pct)} />
            <Cell label="Beta" value={report.beta ?? "—"} />
            <Cell label="Correlation" value={report.correlation ?? "—"} />
            <Cell label="Tracking error" value={pct(report.tracking_error_pct)} />
          </div>
          {report.series.length >= 2 ? (
            <IndexChart series={report.series} />
          ) : (
            <p className="px-4 py-10 text-center text-xs text-[var(--app-text-muted)]">
              Not enough overlapping history to chart the comparison.
            </p>
          )}
        </>
      ) : (
        !open && (
          <p className="px-4 py-8 text-center text-xs text-[var(--app-text-muted)]">
            No benchmark set for this portfolio. Pick one to compare performance, beta, and tracking error.
          </p>
        )
      )}
    </section>
  )
}

function IndexChart({ series }: { series: BenchmarkReport["series"] }) {
  const pf = series.map((s) => (s.portfolio === null ? null : Number(s.portfolio)))
  const bm = series.map((s) => (s.benchmark === null ? null : Number(s.benchmark)))
  const all = [...pf, ...bm].filter((v): v is number => v !== null && Number.isFinite(v))
  if (all.length === 0) return null
  const min = Math.min(...all)
  const max = Math.max(...all)
  const range = max - min || 1

  const n = series.length
  const x = (i: number) => (i / (n - 1)) * W
  const y = (v: number) => H - ((v - min) / range) * (H - 16) - 8
  const path = (vals: (number | null)[]) => {
    // Break the polyline across gaps (missing closes) instead of bridging them.
    let d = ""
    let pen = false
    vals.forEach((v, i) => {
      if (v === null || !Number.isFinite(v)) {
        pen = false
        return
      }
      d += `${pen ? " L" : " M"} ${x(i).toFixed(1)},${y(v).toFixed(1)}`
      pen = true
    })
    return d.trim()
  }
  const gridYs = [0.25, 0.5, 0.75].map((f) => 8 + (H - 16) * f)
  const baseline = max >= 100 && min <= 100 ? y(100) : null

  return (
    <div className="mt-2">
      <div className="relative px-4">
        <span className="absolute right-5 top-0 text-[10px] tabular-nums text-[var(--app-text-faint)]">{max.toFixed(0)}</span>
        <span className="absolute bottom-0 right-5 text-[10px] tabular-nums text-[var(--app-text-faint)]">{min.toFixed(0)}</span>
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true" className="h-48 w-full">
          {gridYs.map((gy) => (
            <line key={gy} x1="0" y1={gy} x2={W} y2={gy} stroke="var(--app-border)" strokeWidth="1" strokeDasharray="4 6" />
          ))}
          {baseline !== null && (
            <line x1="0" y1={baseline} x2={W} y2={baseline} stroke="var(--app-text-faint)" strokeWidth="1" strokeDasharray="2 4" />
          )}
          <path d={path(bm)} fill="none" stroke="var(--app-text-faint)" strokeWidth="1.5" strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
          <path d={path(pf)} fill="none" stroke="var(--app-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
      </div>
      <div className="mt-1.5 flex items-center justify-between px-4 pb-3 text-[10px] text-[var(--app-text-faint)]">
        <span>{fmtDate(series[0]!.date)}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 rounded" style={{ background: "var(--app-accent)" }} /> Portfolio
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0 w-3 border-t border-dashed border-[var(--app-text-faint)]" /> Benchmark
          </span>
        </span>
        <span>{fmtDate(series[n - 1]!.date)}</span>
      </div>
    </div>
  )
}

function BenchmarkPicker({
  portfolioId,
  onPicked,
}: {
  portfolioId: string
  onPicked: (label: string) => void
}) {
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<InstrumentWithListings[]>([])
  const [searched, setSearched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isSearching, startSearch] = useTransition()
  const [isSaving, startSave] = useTransition()

  function doSearch() {
    setError(null)
    startSearch(async () => {
      setResults(await searchInstrumentsAction(query))
      setSearched(true)
    })
  }

  function choose(listingId: string, label: string) {
    startSave(async () => {
      const err = await setPreferredBenchmarkAction(portfolioId, listingId)
      if (err) {
        setError(err)
        return
      }
      onPicked(label)
    })
  }

  return (
    <div className="border-b border-[var(--app-border)] bg-[var(--app-surface)] px-4 py-3">
      {error && <p className="mb-2 rounded-md bg-rose-950/50 px-2 py-1 text-[10px] text-rose-400">{error}</p>}
      <div className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              doSearch()
            }
          }}
          placeholder="Search an index, ETF, or ticker to benchmark against…"
          className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-2.5 py-1.5 text-xs text-[var(--app-text)] placeholder-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
        />
        <button
          type="button"
          onClick={doSearch}
          disabled={isSearching}
          className="shrink-0 rounded-lg border border-[var(--app-border)] px-3 text-xs text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] disabled:opacity-50"
        >
          {isSearching ? "…" : "Search"}
        </button>
      </div>
      {searched && results.length === 0 && <p className="mt-2 text-[10px] text-[var(--app-text-faint)]">No matches.</p>}
      <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto">
        {results.map((inst) => (
          <div key={inst.id} className="rounded-lg bg-[var(--app-surface-raised)] p-2">
            <p className="mb-1 text-xs text-[var(--app-text)]">
              {inst.name} <span className="text-[var(--app-text-faint)]">· {inst.asset_type}</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {inst.listings.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  disabled={isSaving}
                  onClick={() => choose(l.id, `${inst.name} (${l.symbol})`)}
                  className="rounded-md border border-[var(--app-border)] bg-[var(--app-surface)] px-2 py-1 text-[10px] text-[var(--app-text-muted)] hover:border-[var(--app-border-strong)] hover:text-[var(--app-accent)] disabled:opacity-50"
                >
                  {l.symbol} · {l.exchange_mic ?? "?"} · {l.currency}
                </button>
              ))}
              {inst.listings.length === 0 && <span className="text-[10px] text-[var(--app-text-faint)]">No listings</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Cell({ label, value, tone }: { label: string; value: string; tone?: "positive" | "negative" }) {
  const color =
    tone === "positive" ? "text-[var(--app-positive)]" : tone === "negative" ? "text-[var(--app-negative)]" : "text-[var(--app-text)]"
  return (
    <div className="bg-[var(--app-surface)] px-4 py-3">
      <p className="text-[9px] uppercase tracking-wide text-[var(--app-text-faint)]">{label}</p>
      <p className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  )
}

function pct(value: string | null): string {
  if (value === null) return "—"
  return fmtPct(Number(value))
}

function signTone(value: string | null): "positive" | "negative" | undefined {
  if (value === null) return undefined
  const n = Number(value)
  if (!Number.isFinite(n) || n === 0) return undefined
  return n > 0 ? "positive" : "negative"
}

function short(id: string): string {
  return id.length > 12 ? `${id.slice(0, 8)}…` : id
}

function fmtDate(s: string): string {
  return new Date(`${s}T00:00:00Z`).toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "2-digit" })
}
