"use client"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { logoutAction } from "@/app/actions"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import type { MeData } from "@/lib/types"

const ICONS = {
  portfolio: "M4 19V9m5 10V5m5 14v-7m5 7V3",
  watchlist: "m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z",
  news: "M5 4h14v16H5zM8 8h8M8 12h8M8 16h5",
  events: "M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v14H4V6a1 1 0 0 1 1-1Z",
  addPosition: "M12 5v14M5 12h14",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM19 12l2-1-2-3-2 .2-1.5-1L15 5h-6l-.5 2.2-1.5 1L5 8l-2 3 2 1v2l-2 1 2 3 2-.2 1.5 1L9 21h6l.5-2.2 1.5-1 2 .2 2-3-2-1v-2Z",
  collapse: "m15 18-6-6 6-6",
  expand: "m9 18 6-6-6-6",
  signout: "M14 8V5a2 2 0 0 0-2-2H5v18h7a2 2 0 0 0 2-2v-3m-3-4h10m-3-3 3 3-3 3",
} as const

type IconKey = keyof typeof ICONS
interface NavItem { labelKey: MessageKey; icon: IconKey; href: string | null }

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.portfolio", icon: "portfolio", href: "/dashboard" },
  { labelKey: "nav.watchlist", icon: "watchlist", href: "/watchlist" },
  { labelKey: "nav.news", icon: "news", href: null },
  { labelKey: "nav.events", icon: "events", href: null },
]

function Icon({ icon }: { icon: IconKey }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="h-4.5 w-4.5 shrink-0">
      <path d={ICONS[icon]} />
    </svg>
  )
}

function initials(me: MeData | null) {
  const name = me?.display_name ?? me?.email ?? "?"
  return name.split(/[\s@]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}

export function Sidebar({ collapsed, onToggle, animate, me }: { collapsed: boolean; onToggle: () => void; animate: boolean; me: MeData | null }) {
  const pathname = usePathname()
  const t = useTranslations()

  return (
    <aside className={`hidden shrink-0 flex-col border-r border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-sidebar)_96%,transparent)] backdrop-blur-xl lg:flex ${animate ? "transition-[width] duration-200" : ""} ${collapsed ? "w-16" : "w-48"}`}>
      <Link href="/dashboard" className={`flex h-16 items-center border-b border-[var(--app-border)] ${collapsed ? "justify-center" : "gap-2.5 px-4"}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))] bg-[var(--app-accent-soft)] font-bold text-[var(--app-accent)]">P</span>
        {!collapsed && <span className="text-sm font-semibold tracking-tight text-[var(--app-text)]">PortfolioPilot</span>}
      </Link>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV_ITEMS.map((item) => <NavRow key={item.labelKey} item={item} active={!!item.href && pathname.startsWith(item.href)} collapsed={collapsed} />)}
        <div className="my-2 h-px bg-[var(--app-border)]" />
        <NavRow item={{ labelKey: "nav.addPosition", icon: "addPosition", href: "/positions/add" }} active={pathname === "/positions/add"} collapsed={collapsed} />
      </nav>

      <div className="space-y-1 border-t border-[var(--app-border)] p-2">
        {me && (
          <Link href="/settings" className={`flex items-center gap-2.5 rounded-lg px-2 py-2 text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)] ${pathname === "/settings" ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : ""}`}>
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--app-accent-soft)] text-[10px] font-bold text-[var(--app-accent)]">{initials(me)}</span>
            {!collapsed && <span className="min-w-0 flex-1 truncate text-xs">{me.display_name ?? me.email.split("@")[0]}</span>}
            {!collapsed && <Icon icon="settings" />}
          </Link>
        )}
        <form action={logoutAction}>
          <button className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-xs text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
            <Icon icon="signout" />{!collapsed && t("nav.signOut")}
          </button>
        </form>
        <button onClick={onToggle} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-xs text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
          <Icon icon={collapsed ? "expand" : "collapse"} />{!collapsed && t("nav.collapse")}
        </button>
      </div>
    </aside>
  )
}

function NavRow({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  const t = useTranslations()
  const content = (
    <>
      <Icon icon={item.icon} />
      {!collapsed && <span className="truncate">{t(item.labelKey)}</span>}
      {!collapsed && !item.href && <span className="ml-auto text-[9px] uppercase tracking-wider text-[var(--app-text-faint)]">{t("nav.soon")}</span>}
    </>
  )
  const className = `flex items-center gap-3 rounded-lg px-2.5 py-2 text-xs transition ${active ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : item.href ? "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]" : "cursor-default text-[var(--app-text-faint)]"}`
  return item.href ? <Link href={item.href} className={className}>{content}</Link> : <div className={className}>{content}</div>
}
