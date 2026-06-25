import type { CSSProperties, ReactNode } from "react"
import { PageMetricGrid, PageShell, PageToolbar, type PageShellKind } from "@/application/shell/PageShell"

export function PageLoadingShell({
  breadcrumb,
  children,
  kind,
  maxWidth,
}: {
  breadcrumb: string[]
  children: ReactNode
  kind: PageShellKind
  maxWidth?: number
}) {
  return (
    <PageShell kind={kind} maxWidth={maxWidth}>
      <nav aria-label="breadcrumb" className="flex items-center gap-2">
        {breadcrumb.map((item, index) => {
          const current = index === breadcrumb.length - 1
          return (
            <span className={current ? "text-[12px] font-bold leading-tight text-[var(--app-text)]" : "text-[11.5px] font-semibold leading-tight text-[var(--app-text-faint)]"} key={`${item}-${index}`}>
              {item}
            </span>
          )
        })}
      </nav>
      {children}
    </PageShell>
  )
}

export function ToolbarSkeleton({
  actions = 0,
  search = false,
  tabs = 0,
}: {
  actions?: number
  search?: boolean
  tabs?: number
}) {
  return (
    <PageToolbar
      right={search ? <SkeletonBlock className="h-8 w-full max-w-[420px]" /> : undefined}
      actions={actions > 0 ? (
        <div className="flex gap-2">
          {Array.from({ length: actions }, (_, index) => <SkeletonBlock className="h-[34px] w-[34px] rounded-md" key={index} />)}
        </div>
      ) : undefined}
    >
      <div className="flex min-h-11">
        {Array.from({ length: tabs }, (_, index) => (
          <SkeletonBlock className={`h-10 w-[136px] rounded-md ${index === 0 ? "" : "ml-0.5"}`} key={index} />
        ))}
      </div>
    </PageToolbar>
  )
}

export function MetricGridSkeleton({
  columns,
  count,
}: {
  columns: Record<string, string>
  count: number
}) {
  return (
    <PageMetricGrid columns={columns}>
      {Array.from({ length: count }, (_, index) => (
        <section className="app-panel min-h-[88px] rounded-lg p-3" key={index}>
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-[46px] w-[46px] rounded-md" />
            <div className="min-w-0 flex-1 space-y-2">
              <SkeletonBlock className="h-4 w-[42%]" />
              <SkeletonBlock className="h-7 w-[68px]" />
              <SkeletonBlock className="h-3 w-[60%]" />
            </div>
          </div>
        </section>
      ))}
    </PageMetricGrid>
  )
}

export function EventsWorkspaceSkeleton() {
  return (
    <div className="grid items-stretch gap-3 xl:grid-cols-[minmax(0,1fr)_480px]">
      <section className="app-panel flex h-[720px] flex-col overflow-hidden rounded-lg">
        <PanelHeaderSkeleton titleWidth={150} />
        <div className="min-h-0 flex-1">
          {Array.from({ length: 11 }, (_, index) => <TableRowSkeleton columns={5} key={index} />)}
        </div>
      </section>
      <div className="flex h-[720px] min-h-0 w-full flex-col gap-3">
        <section className="app-panel flex flex-1 flex-col overflow-hidden rounded-lg">
          <PanelHeaderSkeleton titleWidth={120} />
          <div className="space-y-3 p-3">
            <SkeletonBlock className="h-7 w-4/5" />
            <SkeletonBlock className="h-24 w-full rounded-md" />
            <SkeletonBlock className="h-24 w-full rounded-md" />
          </div>
        </section>
        <section className="app-panel overflow-hidden rounded-lg">
          <PanelHeaderSkeleton titleWidth={170} />
          {Array.from({ length: 4 }, (_, index) => <TableRowSkeleton columns={4} key={index} />)}
        </section>
        <section className="app-panel overflow-hidden rounded-lg">
          <PanelHeaderSkeleton titleWidth={70} />
          <div className="flex gap-4 p-3">
            {Array.from({ length: 3 }, (_, index) => <SkeletonBlock className="h-6 w-[92px] rounded-md" key={index} />)}
          </div>
        </section>
      </div>
    </div>
  )
}

export function NewsWorkspaceSkeleton() {
  return (
    <div className="grid items-stretch gap-4 lg:grid-cols-[280px_minmax(760px,1fr)_520px]">
      <section className="app-panel overflow-hidden rounded-lg">
        <PanelHeaderSkeleton titleWidth={80} />
        <div className="space-y-4 p-3">
          {Array.from({ length: 5 }, (_, sectionIndex) => (
            <div className="space-y-2" key={sectionIndex}>
              <SkeletonBlock className="h-4 w-[38%]" />
              {Array.from({ length: sectionIndex === 4 ? 6 : 3 }, (_, rowIndex) => (
                <div className="flex items-center gap-2" key={rowIndex}>
                  <SkeletonBlock className="h-4 w-4 rounded-md" />
                  <SkeletonBlock className="h-4 w-[70%]" />
                  <SkeletonBlock className="ml-auto h-[22px] w-[34px] rounded-md" />
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="app-panel overflow-hidden rounded-lg">
        <PanelHeaderSkeleton titleWidth={130} />
        {Array.from({ length: 12 }, (_, index) => <TableRowSkeleton columns={5} key={index} />)}
      </section>

      <section className="app-panel overflow-hidden rounded-lg">
        <PanelHeaderSkeleton titleWidth={120} />
        <div className="space-y-3 p-4">
          <SkeletonBlock className="h-7 w-[82%]" />
          <SkeletonBlock className="h-4 w-[48%]" />
          <SkeletonBlock className="h-[66px] w-full rounded-md" />
          <SkeletonBlock className="h-4 w-[32%]" />
          <SkeletonBlock className="h-4 w-full" />
          <SkeletonBlock className="h-4 w-[94%]" />
          <SkeletonBlock className="h-4 w-[86%]" />
        </div>
      </section>
    </div>
  )
}

export function SettingsCardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <section className="app-panel overflow-hidden rounded-lg">
      <div className="space-y-3 p-3">
        {Array.from({ length: count }, (_, index) => (
          <div className="overflow-hidden rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)]" key={index}>
            <div className="flex items-center justify-between px-3 py-3">
              <div className="flex items-center gap-3">
                <SkeletonBlock className="h-7 w-[58px] rounded-md" />
                <SkeletonBlock className="h-6 w-[84px]" />
                <SkeletonBlock className="h-[26px] w-[92px] rounded-md" />
                <SkeletonBlock className="h-[26px] w-[72px] rounded-md" />
              </div>
              <SkeletonBlock className="h-[26px] w-[46px] rounded-md" />
            </div>
            <div className="space-y-3 border-t border-[var(--app-border)] p-3">
              <div className="grid gap-3 md:grid-cols-3">
                <SkeletonBlock className="h-14 w-full rounded-md" />
                <SkeletonBlock className="h-14 w-full rounded-md" />
                <SkeletonBlock className="h-14 w-full rounded-md" />
              </div>
              <SkeletonBlock className="h-[72px] w-full rounded-md" />
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}

export interface TableSkeletonColumn {
  align?: "left" | "right"
  label: string
  width?: number
}

export function TablePanelSkeleton({
  columns,
  rows = 12,
  rightLabel,
  title,
}: {
  columns: TableSkeletonColumn[]
  rows?: number
  rightLabel?: string
  title: string
}) {
  return (
    <section className="app-panel overflow-hidden rounded-lg">
      <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <h2 className="truncate text-[14px] font-[750] leading-tight text-[var(--app-text)]">{title}</h2>
          <span className="inline-flex h-[22px] items-center rounded-md border border-[color-mix(in_srgb,var(--app-accent)_30%,var(--app-border))] bg-[var(--app-accent-soft)] px-2 text-[11px] font-extrabold leading-none text-[var(--app-accent)]">Loading</span>
        </div>
        {rightLabel ? <span className="text-[11px] font-medium leading-tight text-[var(--app-text-faint)]">{rightLabel}</span> : null}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] table-fixed text-[12px]">
          <thead className="bg-[var(--app-surface-inset)]">
            <tr>
              {columns.map((column) => (
                <th
                  className={`px-3 py-2 text-[10.5px] font-semibold text-[var(--app-text-faint)] ${column.align === "right" ? "text-right" : "text-left"}`}
                  key={column.label}
                  style={column.width ? ({ width: column.width } as CSSProperties) : undefined}
                >
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--app-border)]">
            {Array.from({ length: rows }, (_, rowIndex) => (
              <tr key={rowIndex}>
                {columns.map((column, columnIndex) => (
                  <td
                    className={`px-3 py-2.5 ${column.align === "right" ? "text-right" : "text-left"}`}
                    key={column.label}
                    style={column.width ? ({ width: column.width } as CSSProperties) : undefined}
                  >
                    <SkeletonCell align={column.align} columnIndex={columnIndex} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function PanelHeaderSkeleton({ titleWidth }: { titleWidth: number }) {
  return (
    <div className="app-panel-header flex min-h-[43px] items-center justify-between gap-3 px-4 py-2.5">
      <div className="flex items-center gap-2">
        <SkeletonBlock className="h-[22px]" style={{ width: titleWidth }} />
        <SkeletonBlock className="h-6 w-11 rounded-md" />
      </div>
      <SkeletonBlock className="h-[22px] w-[104px]" />
    </div>
  )
}

function TableRowSkeleton({ columns }: { columns: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--app-border)] px-4 py-3">
      <div className="min-w-0 flex-[1.4] space-y-1.5">
        <SkeletonBlock className="h-4 w-[68%]" />
        <SkeletonBlock className="h-3 w-[42%]" />
      </div>
      {Array.from({ length: Math.max(0, columns - 1) }, (_, index) => (
        <SkeletonBlock className={index === columns - 2 ? "h-6 w-[72px] rounded-md" : "h-4 w-[92px]"} key={index} />
      ))}
    </div>
  )
}

function SkeletonCell({ align = "left", columnIndex }: { align?: "left" | "right"; columnIndex: number }) {
  const width = columnIndex === 0 ? "42%" : columnIndex === 1 ? "96px" : columnIndex === 2 ? "48px" : columnIndex === 3 ? "68px" : "78px"
  if (columnIndex === 0) {
    return (
      <div className="space-y-1.5">
        <SkeletonBlock className="h-4 w-[42%]" />
        <SkeletonBlock className="h-3 w-[28%]" />
      </div>
    )
  }
  return <SkeletonBlock className={`${columnIndex >= 2 ? "h-6 rounded-md" : "h-4"} ${align === "right" ? "ml-auto" : ""}`} style={{ width }} />
}

function SkeletonBlock({ className = "", style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden="true" className={`block animate-pulse rounded bg-[color-mix(in_srgb,var(--app-text-faint)_16%,transparent)] ${className}`} style={style} />
}
