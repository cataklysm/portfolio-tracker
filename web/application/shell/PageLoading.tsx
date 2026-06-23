import { Breadcrumbs, Card, Chip, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material"
import type { ReactNode } from "react"
import { PageShell, PageToolbar, type PageShellKind } from "@/application/shell/PageShell"
import { appTypography, tableHeadSx } from "@/application/shell/appTypography"

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
      <Breadcrumbs aria-label="breadcrumb">
        {breadcrumb.map((item, index) => {
          const current = index === breadcrumb.length - 1
          return (
            <Typography key={`${item}-${index}`} sx={current ? appTypography.breadcrumbCurrent : appTypography.breadcrumbParent}>
              {item}
            </Typography>
          )
        })}
      </Breadcrumbs>
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
      right={search ? <Skeleton animation="wave" variant="text" width={420} height={32} sx={{ maxWidth: "100%" }} /> : undefined}
      actions={actions > 0 ? (
        <Stack direction="row" spacing={0.75}>
          {Array.from({ length: actions }, (_, index) => <Skeleton key={index} animation="wave" variant="rounded" width={34} height={34} />)}
        </Stack>
      ) : undefined}
    >
      <Stack direction="row" spacing={0} sx={{ minHeight: 44 }}>
        {Array.from({ length: tabs }, (_, index) => (
          <Skeleton key={index} animation="wave" variant="rounded" width={136} height={40} sx={index === 0 ? undefined : { ml: 0.25 }} />
        ))}
      </Stack>
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
    <Stack
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: columns,
        "& > .MuiCard-root": { minHeight: 88 },
      }}
    >
      {Array.from({ length: count }, (_, index) => (
        <Card key={index} variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface-raised) 92%, transparent)", p: 1.5 }}>
          <Stack direction="row" spacing={1.5} sx={{ alignItems: "center" }}>
            <Skeleton animation="wave" variant="rounded" width={46} height={46} />
            <Stack spacing={0.5} sx={{ minWidth: 0, flex: 1 }}>
              <Skeleton animation="wave" variant="text" width="42%" height={18} />
              <Skeleton animation="wave" variant="text" width={68} height={30} />
              <Skeleton animation="wave" variant="text" width="60%" height={14} />
            </Stack>
          </Stack>
        </Card>
      ))}
    </Stack>
  )
}

export function EventsWorkspaceSkeleton() {
  return (
    <Stack sx={{ alignItems: "stretch", display: "grid", gap: 1.5, gridTemplateColumns: { xs: "1fr", xl: "minmax(0, 1fr) 480px" } }}>
      <Card variant="outlined" sx={{ display: "flex", flexDirection: "column", height: 720, overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)" }}>
        <PanelHeaderSkeleton titleWidth={150} />
        <Stack spacing={0} sx={{ flex: 1, minHeight: 0 }}>
          {Array.from({ length: 11 }, (_, index) => <TableRowSkeleton key={index} columns={5} />)}
        </Stack>
      </Card>
      <Stack spacing={1.5} sx={{ height: 720, minHeight: 0, width: "100%" }}>
        <Card variant="outlined" sx={{ display: "flex", flex: 1, flexDirection: "column", overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)" }}>
          <PanelHeaderSkeleton titleWidth={120} />
          <Stack spacing={1.5} sx={{ p: 1.5 }}>
            <Skeleton animation="wave" variant="text" width="80%" height={28} />
            <Skeleton animation="wave" variant="rounded" height={96} />
            <Skeleton animation="wave" variant="rounded" height={96} />
          </Stack>
        </Card>
        <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)" }}>
          <PanelHeaderSkeleton titleWidth={170} />
          {Array.from({ length: 4 }, (_, index) => <TableRowSkeleton key={index} columns={4} />)}
        </Card>
        <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)" }}>
          <PanelHeaderSkeleton titleWidth={70} />
          <Stack direction="row" spacing={2} sx={{ p: 1.5 }}>
            {Array.from({ length: 3 }, (_, index) => <Skeleton key={index} animation="wave" variant="rounded" width={92} height={24} />)}
          </Stack>
        </Card>
      </Stack>
    </Stack>
  )
}

export function NewsWorkspaceSkeleton() {
  return (
    <Stack sx={{ alignItems: "stretch", display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr", lg: "280px minmax(760px, 1fr) 520px" } }}>
      <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", overflow: "hidden" }}>
        <PanelHeaderSkeleton titleWidth={80} />
        <Stack spacing={1.25} sx={{ p: 1.5 }}>
          {Array.from({ length: 5 }, (_, section) => (
            <Stack key={section} spacing={0.75}>
              <Skeleton animation="wave" variant="text" width="38%" height={18} />
              {Array.from({ length: section === 4 ? 6 : 3 }, (_, row) => (
                <Stack key={row} direction="row" spacing={1} sx={{ alignItems: "center" }}>
                  <Skeleton animation="wave" variant="rounded" width={16} height={16} />
                  <Skeleton animation="wave" variant="text" width="70%" height={18} />
                  <Skeleton animation="wave" variant="rounded" width={34} height={22} sx={{ ml: "auto" }} />
                </Stack>
              ))}
            </Stack>
          ))}
        </Stack>
      </Card>

      <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", overflow: "hidden" }}>
        <PanelHeaderSkeleton titleWidth={130} />
        {Array.from({ length: 12 }, (_, index) => <TableRowSkeleton key={index} columns={5} />)}
      </Card>

      <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", overflow: "hidden" }}>
        <PanelHeaderSkeleton titleWidth={120} />
        <Stack spacing={1.5} sx={{ p: 1.75 }}>
          <Skeleton animation="wave" variant="text" width="82%" height={30} />
          <Skeleton animation="wave" variant="text" width="48%" height={18} />
          <Skeleton animation="wave" variant="rounded" height={66} />
          <Skeleton animation="wave" variant="text" width="32%" height={18} />
          <Skeleton animation="wave" variant="text" width="100%" height={18} />
          <Skeleton animation="wave" variant="text" width="94%" height={18} />
          <Skeleton animation="wave" variant="text" width="86%" height={18} />
        </Stack>
      </Card>
    </Stack>
  )
}

export function SettingsCardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)" }}>
      <Stack spacing={1.5} sx={{ p: 1.5 }}>
        {Array.from({ length: count }, (_, index) => (
          <Card key={index} variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "var(--app-surface-raised)" }}>
            <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", px: 1.5, py: 1.5 }}>
              <Stack direction="row" spacing={1.25} sx={{ alignItems: "center" }}>
                <Skeleton animation="wave" variant="rounded" width={58} height={28} />
                <Skeleton animation="wave" variant="text" width={84} height={24} />
                <Skeleton animation="wave" variant="rounded" width={92} height={26} />
                <Skeleton animation="wave" variant="rounded" width={72} height={26} />
              </Stack>
              <Skeleton animation="wave" variant="rounded" width={46} height={26} />
            </Stack>
            <Stack spacing={1.5} sx={{ borderTop: "1px solid var(--app-border)", p: 1.5 }}>
              <Stack direction={{ xs: "column", md: "row" }} spacing={1.5}>
                <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 1 }} />
                <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 1 }} />
                <Skeleton animation="wave" variant="rounded" height={56} sx={{ flex: 1 }} />
              </Stack>
              <Skeleton animation="wave" variant="rounded" height={72} />
            </Stack>
          </Card>
        ))}
      </Stack>
    </Card>
  )
}

function PanelHeaderSkeleton({ titleWidth }: { titleWidth: number }) {
  return (
    <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
      <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
        <Skeleton animation="wave" variant="text" width={titleWidth} height={22} />
        <Skeleton animation="wave" variant="rounded" width={44} height={24} />
      </Stack>
      <Skeleton animation="wave" variant="text" width={104} height={22} />
    </Stack>
  )
}

function TableRowSkeleton({ columns }: { columns: number }) {
  return (
    <Stack direction="row" spacing={1.25} sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", px: 1.5, py: 1.25 }}>
      <Stack spacing={0.5} sx={{ flex: 1.4, minWidth: 0 }}>
        <Skeleton animation="wave" variant="text" width="68%" height={18} />
        <Skeleton animation="wave" variant="text" width="42%" height={14} />
      </Stack>
      {Array.from({ length: Math.max(0, columns - 1) }, (_, index) => (
        <Skeleton key={index} animation="wave" variant={index === columns - 2 ? "rounded" : "text"} width={index === columns - 2 ? 72 : 92} height={index === columns - 2 ? 24 : 18} />
      ))}
    </Stack>
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
    <Card variant="outlined" sx={{ overflow: "hidden", borderColor: "var(--app-border)", bgcolor: "color-mix(in srgb, var(--app-surface) 94%, transparent)", boxShadow: "var(--app-shadow)" }}>
      <Stack direction="row" sx={{ alignItems: "center", borderBottom: "1px solid var(--app-border)", justifyContent: "space-between", px: 1.5, py: 1.25 }}>
        <Stack direction="row" spacing={0.75} sx={{ alignItems: "center" }}>
          <Typography component="h2" sx={appTypography.panelTitle}>{title}</Typography>
          <Chip label="Loading" color="primary" variant="outlined" size="small" />
        </Stack>
        {rightLabel ? <Typography sx={appTypography.panelMeta}>{rightLabel}</Typography> : null}
      </Stack>

      <TableContainer>
        <Table size="small" sx={{ minWidth: 900 }}>
          <TableHead sx={tableHeadSx}>
            <TableRow>
              {columns.map((column) => (
                <TableCell key={column.label} align={column.align} sx={column.width ? { width: column.width } : undefined}>{column.label}</TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: rows }, (_, row) => (
              <TableRow key={row}>
                {columns.map((column, columnIndex) => (
                  <TableCell key={column.label} align={column.align} sx={column.width ? { width: column.width } : undefined}>
                    <SkeletonCell align={column.align} columnIndex={columnIndex} />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  )
}

function SkeletonCell({ align = "left", columnIndex }: { align?: "left" | "right"; columnIndex: number }) {
  const width = columnIndex === 0 ? "42%" : columnIndex === 1 ? 96 : columnIndex === 2 ? 48 : columnIndex === 3 ? 68 : 78
  if (columnIndex === 0) {
    return (
      <Stack spacing={0.75}>
        <Skeleton animation="wave" variant="text" width="42%" height={18} />
        <Skeleton animation="wave" variant="text" width="28%" height={14} />
      </Stack>
    )
  }
  return <Skeleton animation="wave" variant={columnIndex >= 2 ? "rounded" : "text"} width={width} height={columnIndex >= 2 ? 24 : 18} sx={align === "right" ? { ml: "auto" } : undefined} />
}
