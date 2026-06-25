"use client"

import Link from "next/link"
import { createContext, useCallback, useContext, useMemo, useState } from "react"

export type NotificationMessageSeverity = "success" | "info" | "warning" | "error"

export interface NotificationMessage {
  id?: string
  title: string
  message?: string | null
  severity?: NotificationMessageSeverity
  source?: string
  href?: string
  actionLabel?: string
  onClose?: (message: ActiveNotificationMessage) => void | Promise<void>
}

interface NotificationMessageContextValue {
  notify: (message: NotificationMessage) => void
  notifyEvent: (message: Omit<NotificationMessage, "source">) => void
  clearNotifications: () => void
}

interface ActiveNotificationMessage extends NotificationMessage {
  id: string
  severity: NotificationMessageSeverity
}

const NotificationMessageContext = createContext<NotificationMessageContextValue | null>(null)

const severityDotClass: Record<NotificationMessageSeverity, string> = {
  error: "bg-[var(--app-negative)]",
  info: "bg-[var(--app-accent)]",
  success: "bg-[var(--app-positive)]",
  warning: "bg-[var(--app-warning)]",
}

export function NotificationMessageProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ActiveNotificationMessage[]>([])

  const dismissMessage = useCallback((id: string) => {
    setMessages((items) => {
      const dismissedMessage = items.find((item) => item.id === id)
      if (dismissedMessage?.onClose) {
        void Promise.resolve(dismissedMessage.onClose(dismissedMessage)).catch(() => undefined)
      }
      return items.filter((item) => item.id !== id)
    })
  }, [])

  const notify = useCallback((message: NotificationMessage) => {
    const nextMessage = normalizeMessage(message)
    setMessages((items) => {
      const existingIndex = items.findIndex((item) => item.id === nextMessage.id)
      if (existingIndex === -1) return [...items, nextMessage]
      return items.map((item, index) => (index === existingIndex ? nextMessage : item))
    })
  }, [])

  const notifyEvent = useCallback((message: Omit<NotificationMessage, "source">) => {
    notify({ ...message, source: "Events" })
  }, [notify])

  const clearNotifications = useCallback(() => {
    setMessages((items) => {
      for (const item of items) {
        if (item.onClose) void Promise.resolve(item.onClose(item)).catch(() => undefined)
      }
      return []
    })
  }, [])

  const value = useMemo<NotificationMessageContextValue>(() => ({
    notify,
    notifyEvent,
    clearNotifications,
  }), [clearNotifications, notify, notifyEvent])

  return (
    <NotificationMessageContext.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-50 flex max-h-[calc(100vh-48px)] w-[calc(100vw-32px)] max-w-[380px] flex-col gap-3 overflow-y-auto sm:bottom-6 sm:right-6">
        {messages.map((message) => (
          <section className="app-panel pointer-events-auto rounded-lg p-3 shadow-2xl" key={message.id} role="status">
            <div className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDotClass[message.severity]}`} />
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-baseline gap-2">
                  <h2 className="truncate text-[13px] font-extrabold leading-tight text-[var(--app-text)]">{message.title}</h2>
                  {message.source ? <span className="shrink-0 text-[10.5px] font-bold text-[var(--app-text-faint)]">{message.source}</span> : null}
                </div>
                {message.message ? <p className="mt-1 text-[12px] font-medium leading-5 text-[var(--app-text-muted)]">{message.message}</p> : null}
                {message.href ? (
                  <Link
                    className="mt-2 inline-flex h-8 items-center rounded-md border border-[color-mix(in_srgb,var(--app-accent)_34%,var(--app-border))] bg-[var(--app-accent-soft)] px-3 text-[11px] font-extrabold text-[var(--app-accent)] transition hover:bg-[color-mix(in_srgb,var(--app-accent)_14%,transparent)]"
                    href={message.href}
                    onClick={() => dismissMessage(message.id)}
                  >
                    {message.actionLabel ?? "Open"}
                  </Link>
                ) : null}
              </div>
              <button
                aria-label="Dismiss notification"
                className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[var(--app-border)] text-[var(--app-text-faint)] transition hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"
                onClick={() => dismissMessage(message.id)}
                type="button"
              >
                x
              </button>
            </div>
          </section>
        ))}
      </div>
    </NotificationMessageContext.Provider>
  )
}

export function useNotificationMessages(): NotificationMessageContextValue {
  const context = useContext(NotificationMessageContext)
  if (!context) throw new Error("useNotificationMessages must be used inside NotificationMessageProvider")
  return context
}

function normalizeMessage(message: NotificationMessage): ActiveNotificationMessage {
  return {
    ...message,
    id: message.id ?? createMessageId(),
    severity: message.severity ?? "info",
  }
}

function createMessageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}
