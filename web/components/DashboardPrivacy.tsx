"use client"

import { createContext, useContext, useEffect, useState } from "react"
import { fmtCurrency } from "@/lib/format"

const STORAGE_KEY = "dashboard-hide-amounts"

interface DashboardPrivacyValue {
  hidden: boolean
  toggle: () => void
  currency: (locale: string, value: number, code: string) => string
}

const DashboardPrivacyContext = createContext<DashboardPrivacyValue | null>(null)

export function DashboardPrivacyProvider({ children }: { children: React.ReactNode }) {
  const [hidden, setHidden] = useState(false)

  useEffect(() => {
    setHidden(localStorage.getItem(STORAGE_KEY) === "true")
  }, [])

  function toggle() {
    setHidden((current) => {
      const next = !current
      localStorage.setItem(STORAGE_KEY, String(next))
      return next
    })
  }

  return (
    <DashboardPrivacyContext.Provider value={{ hidden, toggle, currency: (locale, value, code) => hidden ? "******" : fmtCurrency(locale, value, code) }}>
      {children}
    </DashboardPrivacyContext.Provider>
  )
}

export function useDashboardPrivacy(): DashboardPrivacyValue {
  const value = useContext(DashboardPrivacyContext)
  if (!value) throw new Error("useDashboardPrivacy must be used within DashboardPrivacyProvider")
  return value
}
