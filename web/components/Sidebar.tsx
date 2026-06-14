"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import type { MeData } from "@/lib/types"

const ICONS = {
  portfolio: "M4 19V9m5 10V5m5 14v-7m5 7V3",
  reports: "M5 3h14v18H5zM8 8h8M8 12h8M8 16h5",
  watchlist: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  notifications: "M15 17h5l-1.4-1.4A2 2 0 0 1 18 14.2V11a6 6 0 1 0-12 0v3.2c0 .5-.2 1-.6 1.4L4 17h5m6 0v1a3 3 0 1 1-6 0v-1m6 0H9",
  news: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  events: "M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
  addPosition: "M12 5v14M5 12h14",
  collapse: "m15 18-6-6 6-6",
  expand: "m9 18 6-6-6-6",
} as const

type IconKey = keyof typeof ICONS
interface NavItem { labelKey: MessageKey; icon: IconKey; href: string | null }

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.portfolio", icon: "portfolio", href: "/dashboard" },
  { labelKey: "nav.reports", icon: "reports", href: "/reports" },
  { labelKey: "nav.watchlist", icon: "watchlist", href: "/watchlist" },
  { labelKey: "nav.notifications", icon: "notifications", href: "/notifications" },
  { labelKey: "nav.news", icon: "news", href: "/news" },
  { labelKey: "nav.events", icon: "events", href: "/events" },
]

function Icon({ icon }: { icon: IconKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 shrink-0">
      <path d={ICONS[icon]} />
    </svg>
  )
}

export function Sidebar({ collapsed, onToggle, animate, me: _me, unreadCount = 0 }: { collapsed: boolean; onToggle: () => void; animate: boolean; me: MeData | null; unreadCount?: number }) {
  const pathname = usePathname()
  const t = useTranslations()

  return (
    <aside className={`hidden shrink-0 flex-col border-r border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-sidebar)_96%,transparent)] backdrop-blur-xl lg:flex ${animate ? "transition-[width] duration-200" : ""} ${collapsed ? "w-16" : "w-48"}`}>
      <Link href="/dashboard" className={`flex h-14 items-center border-b border-[var(--app-border)] ${collapsed ? "justify-center" : "gap-2.5 px-3"}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_55%,var(--app-border))] bg-[var(--app-accent-soft)] font-bold text-[var(--app-accent)]">PT</span>
        {!collapsed && <span className="text-sm font-semibold tracking-tight text-[var(--app-text)]">Portfolio Tracker</span>}
      </Link>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => <NavRow key={item.labelKey} item={item} active={!!item.href && pathname.startsWith(item.href)} collapsed={collapsed} badge={item.href === "/notifications" ? unreadCount : undefined} />)}
        <div className="my-2 h-px bg-[var(--app-border)]" />
        <NavRow item={{ labelKey: "nav.addPosition", icon: "addPosition", href: "/positions/add" }} active={pathname === "/positions/add"} collapsed={collapsed} />
      </nav>

      <div className="space-y-1 border-t border-[var(--app-border)] p-2">
        <button onClick={onToggle} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-xs text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
          <Icon icon={collapsed ? "expand" : "collapse"} />{!collapsed && t("nav.collapse")}
        </button>
      </div>
    </aside>
  )
}

function NavRow({ item, active, collapsed, badge }: { item: NavItem; active: boolean; collapsed: boolean; badge?: number }) {
  const t = useTranslations()
  const showBadge = badge !== undefined && badge > 0
  const content = (
    <>
      <Icon icon={item.icon} />
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
      {!collapsed && !item.href && <span className="ml-auto text-[9px] uppercase tracking-wider text-[var(--app-text-faint)]">{t("nav.soon")}</span>}
      {showBadge && !collapsed && (
        <span className="ml-auto rounded-full bg-[var(--app-accent)] px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white">{badge > 99 ? "99+" : badge}</span>
      )}
      {showBadge && collapsed && (
        <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-[var(--app-accent)]" />
      )}
    </>
  )
  const className = `relative flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs transition ${active ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : item.href ? "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]" : "cursor-default text-[var(--app-text-faint)]"}`
  return item.href ? <Link href={item.href} className={className}>{content}</Link> : <div className={className}>{content}</div>
}
