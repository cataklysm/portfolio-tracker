"use client"

import type { ReactNode } from "react"
import { Box, Stack, Typography } from "@mui/material"
import { appTypography } from "@/application/shell/appTypography"

export function AdminInspectorHeader({
  detail,
  meta,
  title,
}: {
  detail?: ReactNode
  meta?: ReactNode
  title: string
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        alignItems: { xs: "stretch", sm: "center" },
        borderBottom: "1px solid var(--app-divider)",
        bgcolor: "var(--app-surface-header)",
        justifyContent: "space-between",
        px: 2,
        py: 1.25,
      }}
    >
      <Stack spacing={0.25} sx={{ minWidth: 0 }}>
        <Typography sx={{ ...appTypography.tablePrimary, fontWeight: 650 }}>
          {title}
        </Typography>
        {detail ? (
          <Typography noWrap sx={appTypography.tableSecondary}>
            {detail}
          </Typography>
        ) : null}
      </Stack>
      {meta ? (
        <Typography sx={{ ...appTypography.panelMeta, textAlign: { xs: "left", sm: "right" } }}>
          {meta}
        </Typography>
      ) : null}
    </Stack>
  )
}

export function AdminInspectorBody({
  children,
  divided = false,
}: {
  children: ReactNode
  divided?: boolean
}) {
  return (
    <Box sx={{ borderBottom: divided ? "1px solid var(--app-divider)" : 0, px: 2, py: 2 }}>
      {children}
    </Box>
  )
}

export function AdminInspectorActions({
  children,
  summary,
}: {
  children: ReactNode
  summary: ReactNode
}) {
  return (
    <Stack
      direction={{ xs: "column", sm: "row" }}
      spacing={1}
      sx={{
        alignItems: { xs: "stretch", sm: "center" },
        borderTop: "1px solid var(--app-divider)",
        bgcolor: "var(--app-surface-header)",
        gap: 1,
        justifyContent: "space-between",
        px: 2,
        py: 1.25,
      }}
    >
      <Typography sx={appTypography.tableSecondary}>
        {summary}
      </Typography>
      <Stack direction="row" spacing={1} sx={{ justifyContent: "flex-end" }}>
        {children}
      </Stack>
    </Stack>
  )
}

export function AdminSectionLabel({ label }: { label: string }) {
  return (
    <Typography
      sx={{
        ...appTypography.sectionLabel,
      }}
    >
      {label}
    </Typography>
  )
}

export const adminInlineEditorCellSx = {
  borderTop: "1px solid var(--app-editor-border)",
  bgcolor: "var(--app-surface-editor)",
  p: 0,
  position: "relative",
  "&::before": {
    bgcolor: "var(--app-accent)",
    bottom: 0,
    content: "\"\"",
    left: 0,
    pointerEvents: "none",
    position: "absolute",
    top: 0,
    width: 3,
    zIndex: 1,
  },
}

export const adminInspectorSectionSx = {
  borderTop: "1px solid var(--app-divider)",
  mt: 2,
  pt: 2,
}
