"use client"

import { useEffect, useState } from "react"
import { AppIcon } from "@/design/icons/AppIcon"

type DesktopNotificationStatus = "checking" | "unsupported" | "unavailable" | "blocked" | "disabled" | "enabled" | "error"

export function DesktopNotificationToggle() {
  const [status, setStatus] = useState<DesktopNotificationStatus>("checking")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void refreshStatus()
  }, [])

  async function refreshStatus() {
    if (!supportsDesktopPush()) {
      setStatus("unsupported")
      return
    }
    if (Notification.permission === "denied") {
      setStatus("blocked")
      return
    }

    const publicKey = await fetchPublicKey()
    if (!publicKey) {
      setStatus("unavailable")
      return
    }

    const registration = await navigator.serviceWorker.getRegistration("/")
    const subscription = await registration?.pushManager.getSubscription()
    setStatus(subscription ? "enabled" : "disabled")
  }

  async function toggleDesktopNotifications() {
    setBusy(true)
    try {
      if (status === "enabled") {
        await disableDesktopNotifications()
        setStatus("disabled")
        return
      }

      const enabled = await enableDesktopNotifications()
      setStatus(enabled ? "enabled" : Notification.permission === "denied" ? "blocked" : "disabled")
    } catch {
      setStatus("error")
    } finally {
      setBusy(false)
    }
  }

  const enabled = status === "enabled"
  const disabled = busy || status === "checking" || status === "unsupported" || status === "unavailable" || status === "blocked"

  return (
    <button
      className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition hover:bg-[var(--app-surface-hover)] disabled:cursor-not-allowed disabled:opacity-60"
      disabled={disabled}
      onClick={toggleDesktopNotifications}
      role="menuitem"
      title={desktopStatusDetail(status)}
      type="button"
    >
      <AppIcon className={`h-4 w-4 shrink-0 ${enabled ? "text-[var(--app-accent)]" : "text-[var(--app-text-muted)]"}`} name="bell" strokeWidth={1.7} />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium text-[var(--app-text-muted)]">Desktop notifications</span>
        <span className="block truncate text-[10px] text-[var(--app-text-faint)]">{desktopStatusLabel(status)}</span>
      </span>
      <span
        aria-hidden="true"
        className={`relative h-5 w-9 shrink-0 rounded-full border transition ${
          enabled
            ? "border-[color-mix(in_srgb,var(--app-accent)_45%,var(--app-border))] bg-[color-mix(in_srgb,var(--app-accent)_30%,transparent)]"
            : "border-[var(--app-border)] bg-[var(--app-surface-panel)]"
        }`}
      >
        <span className={`absolute top-0.5 h-4 w-4 rounded-full transition ${enabled ? "left-4 bg-[var(--app-accent)]" : "left-0.5 bg-[var(--app-text-faint)]"}`} />
      </span>
    </button>
  )
}

async function enableDesktopNotifications(): Promise<boolean> {
  if (!supportsDesktopPush()) return false

  const permission = await Notification.requestPermission()
  if (permission !== "granted") return false

  const publicKey = await fetchPublicKey()
  if (!publicKey) return false

  const registration = await getServiceWorkerRegistration()
  const existing = await registration.pushManager.getSubscription()
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  })

  const response = await fetch("/api/notifications/push/subscriptions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...subscription.toJSON(), user_agent: navigator.userAgent }),
  })
  return response.ok
}

async function disableDesktopNotifications() {
  if (!supportsDesktopPush()) return

  const registration = await navigator.serviceWorker.getRegistration("/")
  const subscription = await registration?.pushManager.getSubscription()
  if (!subscription) return

  const id = await sha256Hex(subscription.endpoint)
  await fetch(`/api/notifications/push/subscriptions/${id}`, { method: "DELETE" })
  await subscription.unsubscribe()
}

function supportsDesktopPush(): boolean {
  return typeof window !== "undefined" && "Notification" in window && "serviceWorker" in navigator && "PushManager" in window
}

async function fetchPublicKey(): Promise<string | null> {
  const response = await fetch("/api/notifications/push/public-key", { cache: "no-store" })
  if (!response.ok) return null
  const body = (await response.json()) as { public_key?: string | null }
  return body.public_key ?? null
}

async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration> {
  const existing = await navigator.serviceWorker.getRegistration("/")
  if (existing) return existing
  return navigator.serviceWorker.register("/notification-sw.js", { scope: "/" })
}

function urlBase64ToUint8Array(value: string): ArrayBuffer {
  const padding = "=".repeat((4 - (value.length % 4)) % 4)
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/")
  const raw = window.atob(base64)
  const buffer = new ArrayBuffer(raw.length)
  const output = new Uint8Array(buffer)
  for (let index = 0; index < raw.length; index += 1) output[index] = raw.charCodeAt(index)
  return buffer
}

async function sha256Hex(value: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value))
  return Array.from(new Uint8Array(buffer)).map((byte) => byte.toString(16).padStart(2, "0")).join("")
}

function desktopStatusLabel(status: DesktopNotificationStatus): string {
  if (status === "checking") return "Checking..."
  if (status === "enabled") return "Enabled in this browser"
  if (status === "disabled") return "Off in this browser"
  if (status === "blocked") return "Blocked by browser"
  if (status === "unavailable") return "Push not configured"
  if (status === "unsupported") return "Not supported"
  return "Setup failed"
}

function desktopStatusDetail(status: DesktopNotificationStatus): string {
  if (status === "enabled") return "Alerts can appear through the operating system notification center."
  if (status === "disabled") return "Enable desktop alerts for this browser."
  if (status === "blocked") return "Allow notifications in the browser site settings first."
  if (status === "unavailable") return "The notification service does not expose a VAPID public key."
  if (status === "unsupported") return "This browser does not support Web Push notifications."
  if (status === "error") return "The browser or service rejected the push subscription."
  return "Checking browser support and current subscription."
}
