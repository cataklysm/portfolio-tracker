"use client"
import Link from "next/link"
import { usePathname, useSearchParams } from "next/navigation"
import { useState } from "react"
import { AppIcon, type AppIconName } from "@/design/icons/AppIcon"
import { CreatePortfolioDialog } from "@/features/portfolios/components/CreatePortfolioDialog"
import { useTranslations, type MessageKey } from "@/lib/i18n"
import type { MeData, Portfolio } from "@/lib/types"

const ICONS = {
  activity: "activity",
  addPosition: "plus",
  administration: "administration",
  collapse: "collapse",
  events: "calendar",
  expand: "expand",
  news: "news",
  notifications: "bell",
  portfolio: "portfolio",
  reports: "reports",
  settings: "settings",
  watchlist: "watchlist",
} satisfies Record<string, AppIconName>

type IconKey = keyof typeof ICONS
interface NavItem { labelKey: MessageKey; icon: IconKey; href: string | null }

const NAV_ITEMS: NavItem[] = [
  { labelKey: "nav.reports", icon: "reports", href: "/reports" },
  { labelKey: "nav.activity", icon: "activity", href: "/activity" },
  { labelKey: "nav.watchlist", icon: "watchlist", href: "/watchlist" },
  { labelKey: "nav.notifications", icon: "notifications", href: "/notifications" },
  { labelKey: "nav.news", icon: "news", href: "/news" },
  { labelKey: "nav.events", icon: "events", href: "/events" },
]

function Icon({ icon }: { icon: IconKey }) {
  return <AppIcon className="h-4.5 w-4.5 shrink-0" name={ICONS[icon]} strokeWidth={1.6} />
}

export function SidebarNavigation({ collapsed, onToggle, animate, me, unreadCount = 0, portfolios = [] }: { collapsed: boolean; onToggle: () => void; animate: boolean; me: MeData | null; unreadCount?: number; portfolios?: Portfolio[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const t = useTranslations()
  const selectedPortfolio = pathname === "/dashboard" ? searchParams.get("portfolio") : null

  return (
    <aside className={`hidden shrink-0 flex-col border-r border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-sidebar)_98%,transparent)] backdrop-blur-xl lg:flex ${animate ? "transition-[width] duration-200" : ""} ${collapsed ? "w-16" : "w-48"}`}>
      <Link href="/dashboard" className={`flex h-14 items-center border-b border-[var(--app-divider)] ${collapsed ? "justify-center" : "gap-2.5 px-3"}`}>
        <span className="flex h-8 w-8 items-center justify-center rounded-lg border border-[color-mix(in_srgb,var(--app-accent)_55%,var(--app-border))] bg-[var(--app-accent-soft)] font-bold text-[var(--app-accent)]">PT</span>
        {!collapsed && <span className="text-sm font-semibold tracking-tight text-[var(--app-text)]">Portfolio Tracker</span>}
      </Link>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        <PortfolioNavRow active={pathname === "/dashboard" && !selectedPortfolio} collapsed={collapsed} />
        {!collapsed && portfolios.length > 0 ? (
          <div className="mb-1 ml-4 border-l border-[var(--app-border)] pl-2">
            {portfolios.map((portfolio) => (
              <PortfolioSubNavRow
                key={portfolio.id}
                portfolio={portfolio}
                active={selectedPortfolio === portfolio.id || pathname === `/portfolios/${portfolio.id}/settings`}
                settingsActive={pathname === `/portfolios/${portfolio.id}/settings`}
              />
            ))}
          </div>
        ) : null}
        {NAV_ITEMS.map((item) => <NavRow key={item.labelKey} item={item} active={!!item.href && pathname.startsWith(item.href)} collapsed={collapsed} badge={item.href === "/notifications" ? unreadCount : undefined} />)}
        {me?.role === "admin" ? (
          <>
            <div className="my-2 h-px bg-[var(--app-border)]" />
            <NavRow item={{ labelKey: "nav.administration", icon: "administration", href: "/administration" }} active={pathname.startsWith("/administration")} collapsed={collapsed} />
            {!collapsed ? (
              <div className="ml-4 border-l border-[var(--app-border)] pl-2">
                <SubNavRow href="/administration/symbols" label={t("nav.symbols")} active={pathname === "/administration/symbols"} />
                <SubNavRow href="/administration/providers" label={t("nav.providers")} active={pathname === "/administration/providers"} />
                <SubNavRow href="/administration/exchanges" label={t("nav.exchanges")} active={pathname === "/administration/exchanges"} />
              </div>
            ) : null}
          </>
        ) : null}
      </nav>

      <div className="space-y-1 border-t border-[var(--app-border)] p-2">
        <button onClick={onToggle} className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-xs text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
          <Icon icon={collapsed ? "expand" : "collapse"} />{!collapsed && t("nav.collapse")}
        </button>
      </div>
    </aside>
  )
}

function SubNavRow({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link href={href} className={`relative block truncate rounded-md px-2.5 py-1.5 text-[11px] transition ${active ? "bg-[var(--app-accent-soft)] font-medium text-[var(--app-accent)]" : "text-[var(--app-text-faint)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}`}>
      {label}
    </Link>
  )
}

function PortfolioSubNavRow({ portfolio, active, settingsActive }: { portfolio: Portfolio; active: boolean; settingsActive: boolean }) {
  return (
    <div className={`flex items-center rounded-md transition ${active ? "bg-[var(--app-accent-soft)]" : "hover:bg-[var(--app-surface-hover)]"}`}>
      <Link
        href={`/dashboard?portfolio=${portfolio.id}`}
        className={`min-w-0 flex-1 truncate px-2.5 py-1.5 text-[11px] transition ${
          active ? "font-medium text-[var(--app-accent)]" : "text-[var(--app-text-faint)] hover:text-[var(--app-text)]"
        }`}
      >
        {portfolio.name}
      </Link>
      <Link
        href={`/portfolios/${portfolio.id}/settings`}
        aria-label={`${portfolio.name} settings`}
        title={`${portfolio.name} settings`}
        className={`mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded transition ${
          settingsActive ? "text-[var(--app-accent)]" : "text-[var(--app-text-faint)] hover:bg-[var(--app-surface)] hover:text-[var(--app-text)]"
        }`}
      >
        <Icon icon="settings" />
      </Link>
    </div>
  )
}

function PortfolioNavRow({ active, collapsed }: { active: boolean; collapsed: boolean }) {
  const t = useTranslations()

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1">
        <Link
          href="/dashboard"
          aria-label={t("nav.portfolio")}
          className={`relative flex h-9 w-9 items-center justify-center rounded-lg text-xs transition ${
            active
              ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
              : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
          }`}
        >
          <Icon icon="portfolio" />
        </Link>
        <CreatePortfolioSidebarButton collapsed />
      </div>
    )
  }

  return (
    <div
      className={`relative flex items-center rounded-lg text-xs transition ${
        active
          ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]"
          : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
      }`}
    >
      <Link href="/dashboard" className="flex min-w-0 flex-1 items-center gap-3 px-2.5 py-2">
        <Icon icon="portfolio" />
        <span className="truncate">{t("nav.portfolio")}</span>
      </Link>
      <CreatePortfolioSidebarButton collapsed={false} />
    </div>
  )
}

function CreatePortfolioSidebarButton({ collapsed }: { collapsed: boolean }) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        aria-label={t("nav.addPortfolio")}
        title={t("nav.addPortfolio")}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          setOpen(true)
        }}
        className={
          collapsed
            ? "flex h-7 w-9 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-faint)] transition hover:border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))] hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent)]"
            : "mr-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-[var(--app-text-faint)] transition hover:border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))] hover:bg-[var(--app-accent-soft)] hover:text-[var(--app-accent)]"
        }
      >
        <Icon icon="addPosition" />
      </button>
      <CreatePortfolioDialog open={open} onClose={() => setOpen(false)} />
    </>
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
