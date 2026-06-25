"use client"

import type { CSSProperties, MouseEvent, ReactNode } from "react"

export type AppBadgeKind = "count" | "status" | "category" | "data-source" | "destructive-action"
export type AppBadgeTone = "accent" | "success" | "warning" | "danger" | "neutral"

interface AppBadgeProperties {
  accentColor?: string
  className?: string
  clickable?: boolean
  icon?: ReactNode
  kind?: AppBadgeKind
  label: ReactNode
  onClick?: (event: MouseEvent<HTMLElement>) => void
  onDelete?: (event: MouseEvent<HTMLButtonElement>) => void
  sx?: SimpleSx | SimpleSx[]
  title?: string
  tone?: AppBadgeTone
}

type SimpleSx = {
  bgcolor?: string
  borderColor?: string
  color?: string
  flexShrink?: number
  height?: number | string
  justifySelf?: CSSProperties["justifySelf"]
  maxWidth?: number | string
  minWidth?: number | string
  textTransform?: CSSProperties["textTransform"]
  width?: number | string
  [selector: string]: unknown
}

const badgeToneColor: Record<AppBadgeTone, string> = {
  accent: "var(--app-accent)",
  danger: "var(--app-negative)",
  neutral: "var(--app-text-muted)",
  success: "var(--app-positive)",
  warning: "var(--app-warning)",
}

const badgeKindClass: Record<AppBadgeKind, string> = {
  category: "",
  count: "min-w-7 justify-center tabular-nums",
  "data-source": "font-mono",
  "destructive-action": "",
  status: "",
}

export function AppBadge({
  accentColor,
  className = "",
  clickable = false,
  icon,
  kind = "category",
  label,
  onClick,
  onDelete,
  sx,
  title,
  tone = "accent",
}: AppBadgeProperties) {
  const color = accentColor ?? (kind === "destructive-action" ? badgeToneColor.danger : badgeToneColor[tone])
  const style = { ...sxToStyle(sx), "--badge-color": color } as CSSProperties
  const Component = clickable || onClick ? "button" : "span"

  return (
    <Component
      className={`inline-flex h-[22px] max-w-full items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--badge-color)_30%,var(--app-border))] bg-[color-mix(in_srgb,var(--badge-color)_10%,transparent)] px-2 text-[11px] font-extrabold leading-none text-[var(--badge-color)] ${badgeKindClass[kind]} ${clickable || onClick ? "cursor-pointer transition hover:bg-[color-mix(in_srgb,var(--badge-color)_16%,transparent)]" : ""} ${className}`}
      onClick={onClick}
      style={style}
      title={title}
      type={Component === "button" ? "button" : undefined}
    >
      {icon ? <span className="inline-flex h-3.5 w-3.5 shrink-0 items-center justify-center text-[13px] [&>.app-icon]:h-[13px] [&>.app-icon]:w-[13px] [&>.app-icon]:text-[13px] [&>svg]:h-[13px] [&>svg]:w-[13px]">{icon}</span> : null}
      <span className="min-w-0 truncate">{label}</span>
      {onDelete ? (
        <button
          aria-label={`Remove ${String(label)}`}
          className="-mr-1 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--badge-color)]"
          onClick={(event) => {
            event.stopPropagation()
            onDelete(event)
          }}
          type="button"
        >
          x
        </button>
      ) : null}
    </Component>
  )
}

function sxToStyle(sx: AppBadgeProperties["sx"]): CSSProperties {
  if (!sx) return {}
  const entries = Array.isArray(sx) ? sx : [sx]
  return entries.reduce<CSSProperties>((style, item) => {
    if (!item || typeof item !== "object") return style
    if (item.bgcolor) style.backgroundColor = item.bgcolor
    if (item.borderColor) style.borderColor = item.borderColor
    if (item.color) style.color = item.color
    if (item.flexShrink !== undefined) style.flexShrink = item.flexShrink
    if (item.height !== undefined) style.height = item.height
    if (item.justifySelf !== undefined) style.justifySelf = item.justifySelf
    if (item.maxWidth !== undefined) style.maxWidth = item.maxWidth
    if (item.minWidth !== undefined) style.minWidth = item.minWidth
    if (item.textTransform !== undefined) style.textTransform = item.textTransform
    if (item.width !== undefined) style.width = item.width
    return style
  }, {})
}

export function appIconButtonSx(tone: AppBadgeTone | "destructive-action" = "neutral") {
  const color = tone === "destructive-action" ? "var(--app-negative)" : badgeToneColor[tone]
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
