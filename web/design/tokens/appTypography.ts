export const appTypography = {
  breadcrumbCurrent: {
    color: "var(--app-text)",
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.2,
  },
  breadcrumbParent: {
    color: "var(--app-text-faint)",
    fontSize: 11.5,
    fontWeight: 600,
    lineHeight: 1.2,
  },
  metadata: {
    color: "var(--app-text-faint)",
    fontSize: 10.5,
    fontWeight: 500,
    lineHeight: 1.35,
  },
  monoMeta: {
    color: "var(--app-text-faint)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 10.5,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 500,
    lineHeight: 1.35,
  },
  numeric: {
    color: "var(--app-text)",
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
  },
  panelMeta: {
    color: "var(--app-text-faint)",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.25,
  },
  panelTitle: {
    color: "var(--app-text)",
    fontSize: 14,
    fontWeight: 750,
    lineHeight: 1.2,
  },
  sectionLabel: {
    color: "var(--app-text-faint)",
    fontSize: 10.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    lineHeight: 1.2,
    mb: 1.4,
    mt: 0.5,
    textTransform: "uppercase",
  },
  tableHeaderCell: {
    color: "var(--app-text-faint)",
    fontSize: 10.5,
    fontWeight: 650,
    letterSpacing: "0.01em",
    px: 1.5,
    py: 1,
  },
  tableMeta: {
    color: "var(--app-text-faint)",
    fontSize: 10.5,
    fontWeight: 500,
    lineHeight: 1.35,
  },
  tableMono: {
    color: "var(--app-text)",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
    fontSize: 12,
    fontVariantNumeric: "tabular-nums",
    fontWeight: 600,
    lineHeight: 1.25,
  },
  tablePrimary: {
    color: "var(--app-text)",
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.25,
  },
  tableSecondary: {
    color: "var(--app-text-muted)",
    fontSize: 11,
    fontWeight: 500,
    lineHeight: 1.35,
  },
} as const

export const tableHeadSx = {
  bgcolor: "var(--app-surface-inset)",
  "& .MuiTableCell-root": appTypography.tableHeaderCell,
} as const
