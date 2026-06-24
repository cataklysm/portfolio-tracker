import { Box, Card, Stack } from "@mui/material"
import type { ReactNode } from "react"

export type PageShellKind = "admin" | "reporting" | "workspace"

const pageShellMaxWidth = {
  admin: 1120,
  reporting: 1640,
  workspace: 1760,
} satisfies Record<PageShellKind, number>

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
    <Box
      sx={{
        mx: "auto",
        maxWidth: 1760,
        px: { xs: 2, lg: 4 },
        py: 2,
        width: "100%",
      }}
    >
      <Box
        sx={{
          display: "flex",
          flexDirection: "column",
          gap: 2,
          maxWidth: maxWidth ?? pageShellMaxWidth[kind],
          width: "100%",
        }}
      >
        {children}
      </Box>
    </Box>
  )
}

export function PageMetricGrid({
  children,
  columns,
}: {
  children: ReactNode
  columns: Record<string, string>
}) {
  return (
    <Box
      sx={{
        display: "grid",
        gap: 2,
        gridTemplateColumns: columns,
        "& > .MuiCard-root, & > [data-metric-bar]": {
          minHeight: 88,
        },
      }}
    >
      {children}
    </Box>
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
    <Card variant="outlined" sx={{ borderColor: "var(--app-border)", bgcolor: "var(--app-surface-toolbar)", boxShadow: "var(--app-shadow)", p: 1 }}>
      <Stack direction={{ xs: "column", lg: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", lg: "center" }, justifyContent: "space-between" }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", md: "center" }, minWidth: 0 }}>
          {children}
        </Stack>
        {right || actions ? (
          <Stack direction={{ xs: "column", md: "row" }} spacing={1.25} sx={{ alignItems: { xs: "stretch", md: "center" }, justifyContent: "flex-end", minWidth: 0 }}>
            {right}
            {actions}
          </Stack>
        ) : null}
      </Stack>
    </Card>
  )
}
