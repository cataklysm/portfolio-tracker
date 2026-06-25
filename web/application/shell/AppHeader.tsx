"use client"

import Link from "next/link"
import { useEffect, useMemo, useRef, useState } from "react"
import { logoutAction } from "@/app/actions"
import { AppIcon } from "@/design/icons/AppIcon"
import { ThemeToggle } from "./ThemeToggle"
import type { MeData, PositionView } from "@/lib/types"

function initials(me: MeData | null) {
  const name = me?.display_name ?? me?.email ?? "?"
  return name.split(/[\s@]+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
}

export function AppHeader({ me, unreadCount, positions }: { me: MeData | null; unreadCount: number; positions: PositionView[] }) {
  const [query, setQuery] = useState("")
  const [focused, setFocused] = useState(false)
  const [userOpen, setUserOpen] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)
  const results = useMemo(() => {
    const searchTerm = query.trim().toLowerCase()
    if (!searchTerm) return []
    return positions.filter((position) => {
      const listing = position.listing
      return listing?.name.toLowerCase().includes(searchTerm) || listing?.symbol.toLowerCase().includes(searchTerm)
    }).slice(0, 6)
  }, [positions, query])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        inputRef.current?.focus()
      }
      if (event.key === "Escape") {
        setFocused(false)
        inputRef.current?.blur()
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) setUserOpen(false)
    }
    window.addEventListener("pointerdown", onPointerDown)
    return () => window.removeEventListener("pointerdown", onPointerDown)
  }, [])

  return (
    <header className="relative z-40 flex h-14 shrink-0 items-center gap-3 border-b border-[var(--app-divider)] bg-[color-mix(in_srgb,var(--app-sidebar)_98%,transparent)] px-3 backdrop-blur-xl sm:px-4">
      <div className="relative mx-auto w-full max-w-2xl">
        <div className={`flex h-9 items-center gap-2 rounded-lg border bg-[var(--app-bg-muted)] px-3 transition ${focused ? "border-[color-mix(in_srgb,var(--app-accent)_65%,var(--app-border))] shadow-[0_0_0_3px_var(--app-accent-soft)]" : "border-[var(--app-border)]"}`}>
          <SearchIcon />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => window.setTimeout(() => setFocused(false), 120)}
            placeholder="Search holdings..."
            className="min-w-0 flex-1 bg-transparent text-xs text-[var(--app-text)] outline-none placeholder:text-[var(--app-text-faint)]"
          />
        </div>
        {focused && query.trim() ? (
          <div className="app-panel absolute inset-x-0 top-11 overflow-hidden rounded-lg shadow-2xl">
            {results.length > 0 ? results.map((position) => (
              <Link
                className="flex items-center gap-3 border-b border-[var(--app-border)] px-3 py-2.5 transition last:border-0 hover:bg-[var(--app-surface-hover)]"
                href={`/positions/${position.id}`}
                key={position.id}
                onClick={() => {
                  setQuery("")
                  setFocused(false)
                }}
              >
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] bg-[var(--app-surface-raised)] text-[9px] font-bold text-[var(--app-accent)]">{position.listing?.symbol.slice(0, 3)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-xs font-semibold text-[var(--app-text)]">{position.listing?.name}</span>
                  <span className="block text-[9px] text-[var(--app-text-faint)]">{position.listing?.symbol} - {position.listing?.asset_type}</span>
                </span>
              </Link>
            )) : <p className="px-3 py-5 text-center text-xs text-[var(--app-text-faint)]">No matching holdings</p>}
          </div>
        ) : null}
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <Link href="/notifications" aria-label="Notifications" className="relative flex h-9 w-9 items-center justify-center rounded-lg text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]">
          <BellIcon />
          {unreadCount > 0 ? <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-[var(--app-negative)] ring-2 ring-[var(--app-sidebar)]" /> : null}
        </Link>
        {me ? (
          <div ref={userMenuRef} className="relative ml-1">
            <button type="button" onClick={() => setUserOpen((open) => !open)} aria-expanded={userOpen} aria-haspopup="menu" className={`flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition hover:bg-[var(--app-surface-hover)] ${userOpen ? "bg-[var(--app-surface-hover)]" : ""}`}>
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--app-border-strong)] bg-[var(--app-surface-raised)] text-[10px] font-semibold text-[var(--app-text)]">{initials(me)}</span>
              <ChevronDownIcon open={userOpen} />
            </button>
            {userOpen ? (
              <div role="menu" className="app-panel absolute right-0 top-11 w-56 overflow-hidden rounded-lg shadow-2xl">
                <div className="border-b border-[var(--app-border)] px-3 py-3">
                  <p className="truncate text-xs font-semibold text-[var(--app-text)]">{me.display_name ?? me.email.split("@")[0]}</p>
                  <p className="mt-0.5 truncate text-[10px] text-[var(--app-text-faint)]">{me.email}</p>
                </div>
                <div className="p-1.5">
                  <Link href="/settings" role="menuitem" onClick={() => setUserOpen(false)} className="flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"><MenuIcon type="settings" /> Settings</Link>
                  <form action={logoutAction}><button role="menuitem" className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-xs text-[var(--app-text-muted)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-negative)]"><MenuIcon type="logout" /> Sign out</button></form>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </header>
  )
}

function SearchIcon() {
  return <AppIcon className="h-4 w-4 shrink-0 text-[var(--app-text-faint)]" name="search" strokeWidth={1.7} />
}

function BellIcon() {
  return <AppIcon className="h-4 w-4" name="bell" strokeWidth={1.7} />
}

function ChevronDownIcon({ open }: { open: boolean }) {
  return <AppIcon className={`hidden h-3.5 w-3.5 text-[var(--app-text-faint)] transition-transform sm:block ${open ? "rotate-180" : ""}`} name="chevronDown" strokeWidth={1.7} />
}

function MenuIcon({ type }: { type: "settings" | "logout" }) {
  return <AppIcon className="h-4 w-4 shrink-0" name={type === "settings" ? "settings" : "logout"} strokeWidth={1.7} />
}
