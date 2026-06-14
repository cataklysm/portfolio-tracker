"use client"
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
      <svg viewBox="0 0 24 24" className={`hidden h-4 w-4 sm:block ${dark ? "text-[var(--app-text-faint)]" : "text-[var(--app-text)]"}`} fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="3.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      <button type="button" onClick={toggle} aria-label={dark ? "Switch to light mode" : "Switch to dark mode"} className="relative h-5 w-9 rounded-full border border-[var(--app-border-strong)] bg-[var(--app-bg-muted)] transition">
        <span className={`absolute top-[3px] h-3 w-3 rounded-full bg-[var(--app-accent)] shadow-sm transition-[left] ${dark ? "left-[18px]" : "left-[3px]"}`} />
      </button>
      <svg viewBox="0 0 24 24" className={`hidden h-4 w-4 sm:block ${dark ? "text-[var(--app-text)]" : "text-[var(--app-text-faint)]"}`} fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M20.5 15.5A8.5 8.5 0 0 1 8.5 3.5a8.5 8.5 0 1 0 12 12Z" /></svg>
    </div>
  )
}
