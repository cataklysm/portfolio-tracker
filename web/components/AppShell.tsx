"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { AppHeader } from "./AppHeader"
import type { MeData, Portfolio, PositionView } from "@/lib/types"

const NO_SIDEBAR = ["/login"]

export function AppShell({ children, me, unreadCount = 0, positions = [], portfolios = [] }: { children: React.ReactNode; me: MeData | null; unreadCount?: number; positions?: PositionView[]; portfolios?: Portfolio[] }) {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem("sidebar-collapsed")
    if (saved !== null) setCollapsed(saved === "true")
    setReady(true)
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
    <div className="flex h-screen overflow-hidden">
      <Sidebar collapsed={collapsed} onToggle={toggle} animate={ready} me={me} unreadCount={unreadCount} portfolios={portfolios} />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <AppHeader me={me} unreadCount={unreadCount} positions={positions} />
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </main>
    </div>
  )
}
