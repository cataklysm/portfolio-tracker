"use client"
import { createContext, useContext } from "react"

const LocaleContext = createContext("en-US")

export function useLocale() {
  return useContext(LocaleContext)
}

export function LocaleProvider({ locale, children }: { locale: string; children: React.ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}
