"use client"

import { createContext, useContext, useEffect, useMemo, useState } from "react"

export type ToastSeverity = "success" | "info" | "warning" | "error"

export interface ToastMessage {
  severity: ToastSeverity
  message: string
}

interface ToastContextValue {
  showToast: (toast: ToastMessage) => void
  success: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
  error: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const severityClass: Record<ToastSeverity, string> = {
  error: "border-[color-mix(in_srgb,var(--app-negative)_38%,var(--app-border))] text-[var(--app-negative)]",
  info: "border-[color-mix(in_srgb,var(--app-accent)_38%,var(--app-border))] text-[var(--app-accent)]",
  success: "border-[color-mix(in_srgb,var(--app-positive)_38%,var(--app-border))] text-[var(--app-positive)]",
  warning: "border-[color-mix(in_srgb,var(--app-warning)_42%,var(--app-border))] text-[var(--app-warning)]",
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)

  useEffect(() => {
    if (!toast) return undefined
    const timeout = window.setTimeout(() => setToast(null), 5000)
    return () => window.clearTimeout(timeout)
  }, [toast])

  const value = useMemo<ToastContextValue>(() => ({
    showToast: setToast,
    success: (message) => setToast({ severity: "success", message }),
    info: (message) => setToast({ severity: "info", message }),
    warning: (message) => setToast({ severity: "warning", message }),
    error: (message) => setToast({ severity: "error", message }),
  }), [])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <div className="pointer-events-none fixed inset-x-0 top-4 z-50 flex justify-center px-4">
          <div
            className={`app-panel pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg px-3 py-2.5 text-[12px] font-semibold shadow-2xl ${severityClass[toast.severity]}`}
            role="status"
          >
            <span className="min-w-0 flex-1 text-[var(--app-text)]">{toast.message}</span>
            <button
              aria-label="Dismiss notification"
              className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
              onClick={() => setToast(null)}
              type="button"
            >
              x
            </button>
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside ToastProvider")
  return context
}
