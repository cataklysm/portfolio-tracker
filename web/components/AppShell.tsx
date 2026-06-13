"use client"
import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { Sidebar } from "./Sidebar"
import { ThemeToggle } from "./ThemeToggle"
import type { MeData } from "@/lib/types"

const NO_SIDEBAR = ["/login"]

export function AppShell({ children, me }: { children: React.ReactNode; me: MeData | null }) {
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
      <Sidebar collapsed={collapsed} onToggle={toggle} animate={ready} me={me} />
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="sticky top-0 z-30 flex h-14 items-center justify-end border-b border-[var(--app-border)] bg-[color-mix(in_srgb,var(--app-bg)_88%,transparent)] px-4 backdrop-blur-xl lg:hidden">
          <ThemeToggle />
        </div>
        {children}
      </main>
    </div>
  )
}
