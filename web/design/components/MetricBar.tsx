import type { ReactNode } from "react"

export type MetricBarTone = "accent" | "danger" | "neutral" | "positive" | "warning"

export function MetricBar({
  children,
  className = "",
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <section className={`app-panel overflow-hidden rounded-lg ${className}`} data-metric-bar>
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
