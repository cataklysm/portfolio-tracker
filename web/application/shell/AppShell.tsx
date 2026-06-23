"use client"
import { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { NotificationSubscriptionProvider } from "@/application/notifications/NotificationSubscriptionProvider"
import { SidebarNavigation } from "./SidebarNavigation"
import { AppHeader } from "./AppHeader"
import type { MeData, Portfolio, PositionView } from "@/lib/types"

const NO_SIDEBAR = ["/login"]

export function AppShell({ children, me, unreadCount = 0, positions = [], portfolios = [] }: { children: React.ReactNode; me: MeData | null; unreadCount?: number; positions?: PositionView[]; portfolios?: Portfolio[] }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)
  const [liveUnreadCount, setLiveUnreadCount] = useState(unreadCount)

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved !== null) setCollapsed(saved === "true")
    setReady(true)
  }, [])

  useEffect(() => {
    setLiveUnreadCount(unreadCount)
  }, [unreadCount])

  const applyUnreadDelta = useCallback((delta: number) => {
    setLiveUnreadCount((count) => Math.max(0, count + delta))
  }, [])

  function toggle() {
    setCollapsed((prev) => {
      const next = !prev
      localStorage.setItem("sidebar-collapsed", String(next))
      return next
    })
  }

  if (NO_SIDEBAR.includes(pathname)) {
    return <>{children}</>
  }

  return (
    <NotificationSubscriptionProvider enabled={Boolean(me)} onUnreadDelta={applyUnreadDelta}>
      <div className="flex h-screen overflow-hidden">
        <SidebarNavigation collapsed={collapsed} onToggle={toggle} animate={ready} me={me} unreadCount={liveUnreadCount} portfolios={portfolios} />
        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <AppHeader me={me} unreadCount={liveUnreadCount} positions={positions} />
          <div className="app-workspace min-h-0 flex-1 overflow-y-auto">{children}</div>
        </main>
      </div>
    </NotificationSubscriptionProvider>
  )
}
