import type { CSSProperties, ReactNode } from "react"

export type PageShellKind = "admin" | "reporting" | "workspace"

const pageShellMaxWidth = {
  admin: 1120,
  reporting: 1640,
  workspace: 1760,
} satisfies Record<PageShellKind, number>

type ResponsiveColumns = Partial<Record<"xs" | "sm" | "md" | "lg" | "xl", string>>

export function PageShell({
  children,
  kind,
  maxWidth,
}: {
  children: ReactNode
  kind: PageShellKind
  maxWidth?: number
}) {
  return (
    <div className="mx-auto w-full max-w-[1760px] px-4 py-4 lg:px-8">
      <div className="flex w-full flex-col gap-4" style={{ maxWidth: maxWidth ?? pageShellMaxWidth[kind] }}>
        {children}
      </div>
    </div>
  )
}

export function PageMetricGrid({
  children,
  columns,
}: {
  children: ReactNode
  columns: ResponsiveColumns
}) {
  return (
    <div className="page-metric-grid" style={gridColumnsStyle(columns)}>
      {children}
    </div>
  )
}

export function PageToolbar({
  actions,
  children,
  right,
}: {
  actions?: ReactNode
  children: ReactNode
  right?: ReactNode
}) {
  return (
    <section className="app-panel rounded-lg bg-[var(--app-surface-toolbar)] p-2">
      <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
        <div className="flex min-w-0 flex-col gap-3 md:flex-row md:items-center">
          {children}
        </div>
        {right || actions ? (
          <div className="flex min-w-0 flex-col justify-end gap-3 md:flex-row md:items-center">
            {right}
            {actions}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function gridColumnsStyle(columns: ResponsiveColumns): CSSProperties {
  return {
    "--page-metric-grid-xs": columns.xs,
    "--page-metric-grid-sm": columns.sm,
    "--page-metric-grid-md": columns.md,
    "--page-metric-grid-lg": columns.lg,
    "--page-metric-grid-xl": columns.xl,
  } as CSSProperties
}
