self.addEventListener("push", (event) => {
  const payload = parsePayload(event.data)
  const title = payload.title || "Portfolio notification"
  const id = payload.id || ""
  const url = payload.url || "/notifications"

  event.waitUntil(
    self.registration.showNotification(title, {
      body: payload.body || "",
      icon: payload.icon || "/notification-icon.svg",
      badge: payload.badge || "/notification-badge.svg",
      tag: id || undefined,
      timestamp: payload.timestamp ? Date.parse(payload.timestamp) : Date.now(),
      renotify: Boolean(id),
      data: { id, url, type: payload.type, severity: payload.severity },
      actions: [
        { action: "open", title: "Open asset" },
        { action: "snooze-15", title: "Remind 15m" },
        { action: "snooze-60", title: "Remind 1h" },
      ],
    }),
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const data = event.notification.data || {}
  const id = data.id

  if (event.action && event.action.startsWith("snooze-") && id) {
    const minutes = Number(event.action.slice("snooze-".length))
    event.waitUntil(
      fetch(`/api/notifications/${encodeURIComponent(id)}/snooze`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ minutes }),
      }).catch(() => undefined),
    )
    return
  }

  event.waitUntil(openOrFocus(data.url || "/notifications"))
})

function parsePayload(data) {
  if (!data) return {}
  try {
    return data.json()
  } catch {
    return {}
  }
}

async function openOrFocus(url) {
  const targetUrl = new URL(url, self.location.origin).href
  const windows = await clients.matchAll({ type: "window", includeUncontrolled: true })
  for (const client of windows) {
    if ("focus" in client) {
      if ("navigate" in client && client.url !== targetUrl) await client.navigate(targetUrl)
      return client.focus()
    }
  }
  return clients.openWindow(targetUrl)
}
