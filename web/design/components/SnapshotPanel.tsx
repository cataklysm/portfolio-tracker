import type { ReactNode } from "react"

export type SnapshotTone = "negative" | "neutral" | "positive" | "warning"

export function SnapshotPanel({
  action,
  children,
  className = "",
  subtitle,
  title,
}: {
  action?: ReactNode
  children: ReactNode
  className?: string
  subtitle?: string
  title: string
}) {
  return (
    <section className={`app-panel overflow-hidden rounded-lg ${className}`}>
      <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">{title}</h2>
          {subtitle ? <p className="mt-0.5 truncate text-[10.5px] font-medium text-[var(--app-text-faint)]">{subtitle}</p> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
      <div className="space-y-3 p-3">{children}</div>
    </section>
  )
}

export function SnapshotKpiGrid({
  children,
  columns = 3,
}: {
  children: ReactNode
  columns?: 2 | 3 | 4
}) {
  return (
    <div className={`grid gap-px overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-border)] ${snapshotGridClass(columns)}`}>
      {children}
    </div>
  )
}

export function SnapshotKpi({
  label,
  sub,
  tone = "neutral",
  value,
}: {
  label: string
  sub?: ReactNode
  tone?: SnapshotTone
  value: ReactNode
}) {
  return (
    <div className="min-w-0 bg-[var(--app-surface-inset)] px-3 py-2.5">
      <p className="truncate text-[10px] font-semibold text-[var(--app-text-muted)]">{label}</p>
      <div className={`mt-1 truncate text-[15px] font-extrabold leading-5 tabular-nums ${snapshotToneClass(tone)}`}>{value}</div>
      {sub ? <div className={`mt-0.5 truncate text-[10px] font-semibold tabular-nums ${snapshotToneClass(tone, true)}`}>{sub}</div> : null}
    </div>
  )
}

export function SnapshotSection({
  children,
  title,
}: {
  children: ReactNode
  title: string
}) {
  return (
    <div className="space-y-2">
      <h3 className="px-0.5 text-[10px] font-extrabold uppercase tracking-[0.12em] text-[var(--app-text-faint)]">{title}</h3>
      {children}
    </div>
  )
}

export function SnapshotRows({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-md border border-[var(--app-border)] bg-[var(--app-surface-inset)]">{children}</div>
}

export function SnapshotRow({
  label,
  meta,
  tone = "neutral",
  value,
}: {
  label: string
  meta?: ReactNode
  tone?: SnapshotTone
  value: ReactNode
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-[var(--app-border)] px-3 py-2.5 last:border-b-0">
      <div className="min-w-0">
        <p className="truncate text-[11px] font-semibold text-[var(--app-text-muted)]">{label}</p>
        {meta ? <p className="mt-0.5 truncate text-[10px] font-medium text-[var(--app-text-faint)]">{meta}</p> : null}
      </div>
      <div className={`min-w-0 max-w-[180px] truncate text-right text-[11.5px] font-extrabold tabular-nums ${snapshotToneClass(tone)}`}>{value}</div>
    </div>
  )
}

function snapshotGridClass(columns: 2 | 3 | 4): string {
  if (columns === 2) return "grid-cols-2"
  if (columns === 4) return "grid-cols-2 lg:grid-cols-4"
  return "grid-cols-3"
}

function snapshotToneClass(tone: SnapshotTone, subtle = false): string {
  if (tone === "positive") return "text-[var(--app-positive)]"
  if (tone === "negative") return "text-[var(--app-negative)]"
  if (tone === "warning") return "text-[var(--app-warning)]"
  return subtle ? "text-[var(--app-text-faint)]" : "text-[var(--app-text)]"
}
