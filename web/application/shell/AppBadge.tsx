"use client"

import { Chip, type ChipProps } from "@mui/material"
import type { SxProps, Theme } from "@mui/material/styles"

export type AppBadgeKind = "count" | "status" | "category" | "data-source" | "destructive-action"
export type AppBadgeTone = "accent" | "success" | "warning" | "danger" | "neutral"

type AppBadgeProps = Omit<ChipProps, "color" | "size" | "variant"> & {
  accentColor?: string
  kind?: AppBadgeKind
  tone?: AppBadgeTone
}

const toneColor: Record<AppBadgeTone, string> = {
  accent: "var(--app-accent)",
  danger: "var(--app-negative)",
  neutral: "var(--app-text-muted)",
  success: "var(--app-positive)",
  warning: "var(--app-warning)",
}

const kindSx: Record<AppBadgeKind, SxProps<Theme>> = {
  category: { minWidth: 0 },
  count: { minWidth: 28 },
  "data-source": { fontFamily: "monospace", minWidth: 0 },
  "destructive-action": { minWidth: 0 },
  status: { minWidth: 0 },
}

export function AppBadge({
  accentColor,
  kind = "category",
  sx,
  tone = "accent",
  ...props
}: AppBadgeProps) {
  const color = accentColor ?? toneColor[tone]
  return (
    <Chip
      size="small"
      variant="outlined"
      {...props}
      sx={[
        {
          bgcolor: `color-mix(in srgb, ${color} 10%, transparent)`,
          borderColor: `color-mix(in srgb, ${color} 30%, var(--app-border))`,
          borderRadius: 1,
          color,
          fontSize: 11,
          fontWeight: 800,
          height: 22,
          maxWidth: "100%",
          "& .MuiChip-label": {
            lineHeight: 1,
            overflow: "hidden",
            px: 0.8,
            textOverflow: "ellipsis",
          },
          "& .MuiChip-icon": {
            alignItems: "center",
            color,
            display: "inline-flex",
            flexShrink: 0,
            height: 14,
            justifyContent: "center",
            ml: 0.75,
            mr: -0.2,
            width: 14,
            "& svg": {
              height: 13,
              width: 13,
            },
          },
          "& .MuiChip-deleteIcon": {
            color: "var(--app-text-muted)",
            height: 16,
            width: 16,
            "&:hover": { color },
          },
        },
        kindSx[kind],
        kind === "destructive-action"
          ? {
              bgcolor: "color-mix(in srgb, var(--app-negative) 10%, transparent)",
              borderColor: "color-mix(in srgb, var(--app-negative) 34%, var(--app-border))",
              color: "var(--app-negative)",
            }
          : null,
        ...(Array.isArray(sx) ? sx : [sx]),
      ]}
    />
  )
}

export function appIconButtonSx(tone: AppBadgeTone | "destructive-action" = "neutral"): SxProps<Theme> {
  const color = tone === "destructive-action" ? "var(--app-negative)" : toneColor[tone]
  return {
    border: `1px solid color-mix(in srgb, ${color} 34%, var(--app-border))`,
    borderRadius: 1,
    color,
    height: 30,
    width: 30,
    "&:hover": {
      bgcolor: `color-mix(in srgb, ${color} 12%, var(--app-surface-hover))`,
      color,
    },
    "&.Mui-disabled": {
      borderColor: "var(--app-border)",
      color: "var(--app-text-faint)",
      opacity: 0.48,
    },
  }
}
