"use client"
import { AppIcon } from "@/design/icons/AppIcon"
import { useEffect, useState } from "react"

export function ThemeToggle() {
  const [dark, setDark] = useState(true)

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"))
  }, [])

  function toggle() {
    setDark((current) => {
      const next = !current
      document.documentElement.classList.toggle("dark", next)
      localStorage.setItem("portfolio-theme", next ? "dark" : "light")
      return next
    })
  }

  return (
    <div className="flex items-center gap-1.5 px-1">
      <AppIcon className={`hidden h-4 w-4 sm:block ${dark ? "text-[var(--app-text-faint)]" : "text-[var(--app-text)]"}`} name="sun" strokeWidth={1.7} />
      <button type="button" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="relative h-5 w-9 rounded-full border border-[var(--app-border-strong)] bg-[var(--app-bg-muted)] transition">
        <span className={`absolute top-[3px] h-3 w-3 rounded-full bg-[var(--app-accent)] shadow-sm transition-[left] ${dark ? "left-[18px]" : "left-[3px]"}`} />
      </button>
      <AppIcon className={`hidden h-4 w-4 sm:block ${dark ? "text-[var(--app-text)]" : "text-[var(--app-text-faint)]"}`} name="moon" strokeWidth={1.7} />
    </div>
  )
}
