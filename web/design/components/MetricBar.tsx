import type { ReactNode } from "react"

export type MetricBarTone = "accent" | "danger" | "neutral" | "positive" | "warning"
export type MetricBarColumns = Partial<Record<"xs" | "sm" | "md" | "lg" | "xl", string>>

export function MetricBar({
  children,
  className = "",
  columns = { xs: "1fr" },
}: {
  children: ReactNode
  className?: string
  columns?: MetricBarColumns
}) {
  return (
    <section className={`app-panel grid gap-px overflow-hidden rounded-lg ${metricBarColumnClasses(columns)} ${className}`} data-metric-bar>
      {children}
    </section>
  )
}

export function MetricBarItem({
  icon,
  label,
  primary = false,
  sub,
  tone = "neutral",
  value,
}: {
  icon: ReactNode
  label: string
  primary?: boolean
  sub?: string
  tone?: MetricBarTone
  value: ReactNode
}) {
  const toneClass = metricToneTextClass(tone)

  return (
    <div className="min-w-0 bg-[var(--app-surface-panel)] px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <MetricBarIcon tone={tone}>{icon}</MetricBarIcon>
        <div className="min-w-0">
          <p className="truncate text-[10.5px] font-semibold text-[var(--app-text-muted)]">{label}</p>
          <p className={`mt-1 truncate font-semibold tabular-nums ${primary ? "text-[20px] leading-6" : "text-[16px] leading-6"} ${toneClass}`}>{value}</p>
          {sub ? <p className="mt-0.5 truncate text-[10.5px] font-medium tabular-nums text-[var(--app-text-faint)]">{sub}</p> : null}
        </div>
      </div>
    </div>
  )
}

export function MetricBarIcon({
  children,
  tone = "neutral",
}: {
  children: ReactNode
  tone?: MetricBarTone
}) {
  return (
    <span className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${metricToneIconClass(tone)}`}>
      <span className="flex h-5 w-5 items-center justify-center text-[20px] [&>.app-icon]:h-5 [&>.app-icon]:w-5 [&>.app-icon]:text-[20px] [&>svg]:h-5 [&>svg]:w-5">
        {children}
      </span>
    </span>
  )
}

function metricToneTextClass(tone: MetricBarTone) {
  if (tone === "positive") return "text-[var(--app-positive)]"
  if (tone === "danger") return "text-[var(--app-negative)]"
  if (tone === "warning") return "text-[var(--app-warning)]"
  return "text-[var(--app-text)]"
}

function metricToneIconClass(tone: MetricBarTone) {
  if (tone === "positive") {
    return "border-[color-mix(in_srgb,var(--app-positive)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-positive)_14%,var(--app-surface-panel))] text-[var(--app-positive)]"
  }
  if (tone === "danger") {
    return "border-[color-mix(in_srgb,var(--app-negative)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-negative)_12%,var(--app-surface-panel))] text-[var(--app-negative)]"
  }
  if (tone === "warning") {
    return "border-[color-mix(in_srgb,var(--app-warning)_30%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-warning)_14%,var(--app-surface-panel))] text-[var(--app-warning)]"
  }
  if (tone === "accent") {
    return "border-[color-mix(in_srgb,var(--app-accent)_28%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_13%,var(--app-surface-panel))] text-[var(--app-accent)]"
  }
  return "border-[color-mix(in_srgb,var(--app-accent)_22%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_10%,var(--app-surface-panel))] text-[var(--app-accent)]"
}

function metricBarColumnClasses(columns: MetricBarColumns): string {
  return [
    gridClass("xs", columns.xs ?? "1fr"),
    gridClass("sm", columns.sm),
    gridClass("md", columns.md),
    gridClass("lg", columns.lg),
    gridClass("xl", columns.xl),
  ].filter(Boolean).join(" ")
}

function gridClass(breakpoint: keyof MetricBarColumns, value: string | undefined): string {
  const count = gridColumnCount(value)
  if (!count) return ""
  const classes = metricGridClasses[breakpoint]
  return classes[count] ?? ""
}

function gridColumnCount(value: string | undefined): keyof typeof metricGridClasses.xs | null {
  if (!value) return null
  if (value === "1fr") return 1
  const match = value.match(/repeat\((\d+)/)
  if (!match?.[1]) return null
  const count = Number(match[1])
  return count === 1 || count === 2 || count === 3 || count === 4 || count === 5 || count === 6 ? count : null
}

const metricGridClasses = {
  xs: {
    1: "grid-cols-1",
    2: "grid-cols-2",
    3: "grid-cols-3",
    4: "grid-cols-4",
    5: "grid-cols-5",
    6: "grid-cols-6",
  },
  sm: {
    1: "sm:grid-cols-1",
    2: "sm:grid-cols-2",
    3: "sm:grid-cols-3",
    4: "sm:grid-cols-4",
    5: "sm:grid-cols-5",
    6: "sm:grid-cols-6",
  },
  md: {
    1: "md:grid-cols-1",
    2: "md:grid-cols-2",
    3: "md:grid-cols-3",
    4: "md:grid-cols-4",
    5: "md:grid-cols-5",
    6: "md:grid-cols-6",
  },
  lg: {
    1: "lg:grid-cols-1",
    2: "lg:grid-cols-2",
    3: "lg:grid-cols-3",
    4: "lg:grid-cols-4",
    5: "lg:grid-cols-5",
    6: "lg:grid-cols-6",
  },
  xl: {
    1: "xl:grid-cols-1",
    2: "xl:grid-cols-2",
    3: "xl:grid-cols-3",
    4: "xl:grid-cols-4",
    5: "xl:grid-cols-5",
    6: "xl:grid-cols-6",
  },
} as const
