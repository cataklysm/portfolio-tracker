import type { CSSProperties } from "react"

export const appIconSymbols = {
  activity: "monitoring",
  administration: "settings",
  alert: "notifications",
  bell: "notifications",
  bookmark: "bookmark",
  building: "apartment",
  calculator: "calculate",
  calendar: "calendar_today",
  cash: "attach_money",
  check: "check",
  chevronDown: "keyboard_arrow_down",
  chevronLeft: "keyboard_arrow_left",
  chevronRight: "keyboard_arrow_right",
  collapse: "keyboard_arrow_left",
  corporateAction: "account_tree",
  duplicate: "content_copy",
  edit: "edit",
  exchange: "event",
  expand: "keyboard_arrow_right",
  exposure: "bar_chart",
  flame: "local_fire_department",
  list: "list",
  logout: "logout",
  mail: "mail",
  moon: "dark_mode",
  news: "article",
  openExternal: "open_in_new",
  plus: "add",
  portfolio: "bar_chart",
  provider: "settings_input_component",
  purge: "delete_sweep",
  rebuild: "sync",
  reload: "refresh",
  reports: "article",
  restore: "restore",
  search: "search",
  settings: "settings",
  split: "call_split",
  sun: "light_mode",
  target: "my_location",
  tax: "receipt_long",
  trash: "delete",
  trendDown: "trending_down",
  trendUp: "trending_up",
  value: "bar_chart",
  watchlist: "star",
  x: "close",
} as const

export type AppIconName = keyof typeof appIconSymbols

interface AppIconProperties {
  className?: string
  filled?: boolean
  name: AppIconName
  strokeWidth?: number
}

export function AppIcon({ className = "", filled = false, name, strokeWidth = 1.9 }: AppIconProperties) {
  const size = iconSizeFromClassName(className)
  const style = {
    "--app-icon-fill": filled ? 1 : 0,
    "--app-icon-size": size ? `${size}px` : undefined,
    "--app-icon-weight": iconWeightFromStroke(strokeWidth),
  } as CSSProperties

  return (
    <span aria-hidden="true" className={`app-icon material-symbols-rounded ${className}`.trim()} data-filled={filled ? "true" : "false"} style={style}>
      {appIconSymbols[name]}
    </span>
  )
}

function iconSizeFromClassName(className: string): number | null {
  const arbitraryPx = className.match(/\bh-\[(\d+(?:\.\d+)?)px\]/)
  if (arbitraryPx?.[1]) return Number(arbitraryPx[1])

  const textPx = className.match(/\btext-\[(\d+(?:\.\d+)?)px\]/)
  if (textPx?.[1]) return Number(textPx[1])

  const spacing = className.match(/\bh-(\d+(?:\.\d+)?)\b/)
  if (spacing?.[1]) return Number(spacing[1]) * 4

  return null
}

function iconWeightFromStroke(strokeWidth: number): number {
  const weight = 300 + (strokeWidth - 1.5) * 300
  return Math.max(300, Math.min(500, Math.round(weight / 50) * 50))
}
