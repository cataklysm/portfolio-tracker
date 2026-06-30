"use client"

import { useEffect, useRef } from "react"
import { useNotificationMessages, type NotificationMessageSeverity } from "./NotificationMessageProvider"
import type { NotificationInbox, NotificationItem } from "@/lib/types"

interface NotificationSubscriptionProviderProps {
  children: React.ReactNode
  enabled: boolean
  onUnreadDelta: (delta: number) => void
}

export function NotificationSubscriptionProvider({ children, enabled, onUnreadDelta }: NotificationSubscriptionProviderProps) {
  const { notify } = useNotificationMessages()
  const seenIds = useRef(new Set<string>())
  const readIds = useRef(new Set<string>())

  useEffect(() => {
    if (!enabled) return undefined
    const source = new EventSource("/api/notifications/stream")
    let canceled = false

    void catchUpMissedNotifications()

    source.addEventListener("notification.created", (event) => {
      const notification = JSON.parse((event as MessageEvent<string>).data) as NotificationItem
      if (!showNotification(notification)) return
      updateCursor(notification.created_at)
      onUnreadDelta(1)
    })

    source.onerror = () => {
      // EventSource reconnects automatically. Keep the handler quiet; persistent
      // connection blips should not surface as user-facing alerts.
    }

    return () => {
      canceled = true
      source.close()
    }

    async function catchUpMissedNotifications() {
      const cursor = readCursor()
      if (!cursor) {
        updateCursor(new Date().toISOString())
        return
      }
      try {
        const response = await fetch("/api/notifications/recent?limit=10", { cache: "no-store" })
        if (!response.ok || canceled) return
        const inbox = (await response.json()) as NotificationInbox
        let newest = cursor
        for (const notification of [...inbox.notifications].reverse()) {
          if (notification.read_at || notification.created_at <= cursor) continue
          if (isSnoozed(notification)) continue
          showNotification(notification)
          if (notification.created_at > newest) newest = notification.created_at
        }
        updateCursor(newest === cursor ? new Date().toISOString() : newest)
      } catch {
        // Catchup is best-effort; the live stream remains the primary path.
      }
    }

    function showNotification(notification: NotificationItem): boolean {
      if (isSnoozed(notification)) return false
      if (seenIds.current.has(notification.id)) return false
      seenIds.current.add(notification.id)
      notify({
        id: notification.id,
        title: notification.title,
        message: notification.body,
        severity: toNotificationMessageSeverity(notification.severity),
        source: "Notification",
        href: "/notifications",
        actionLabel: "Open",
        allowSnooze: true,
        onSnooze: async (_message, minutes) => {
          const response = await fetch(`/api/notifications/${encodeURIComponent(notification.id)}/snooze`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ minutes }),
          })
          if (response.ok) seenIds.current.delete(notification.id)
        },
        onClose: async () => {
          if (readIds.current.has(notification.id)) return
          readIds.current.add(notification.id)
          const response = await fetch(`/api/notifications/${encodeURIComponent(notification.id)}/read`, {
            method: "POST",
          })
          if (response.ok) onUnreadDelta(-1)
        },
      })
      return true
    }
  }, [enabled, notify, onUnreadDelta])

  return <>{children}</>
}

function isSnoozed(notification: NotificationItem): boolean {
  return notification.snoozed_until !== null && Date.parse(notification.snoozed_until) > Date.now()
}

const CURSOR_KEY = "portfolio-notification-live-cursor"

function readCursor(): string | null {
  try {
    return localStorage.getItem(CURSOR_KEY)
  } catch {
    return null
  }
}

function updateCursor(value: string): void {
  try {
    localStorage.setItem(CURSOR_KEY, value)
  } catch {
    // Ignore storage failures; live delivery still works for this session.
  }
}

function toNotificationMessageSeverity(severity: NotificationItem["severity"]): NotificationMessageSeverity {
  if (severity === "critical") return "error"
  if (severity === "warning") return "warning"
  return "info"
}
