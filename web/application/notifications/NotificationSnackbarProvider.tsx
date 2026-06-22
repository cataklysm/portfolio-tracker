"use client"

import { createContext, useCallback, useContext, useMemo, useState } from "react"
import { Alert, AlertTitle, Box, Button, Stack, Typography } from "@mui/material"

export type NotificationSnackbarSeverity = "success" | "info" | "warning" | "error"

export interface NotificationSnackbarMessage {
  id?: string
  title: string
  message?: string | null
  severity?: NotificationSnackbarSeverity
  source?: string
  href?: string
  actionLabel?: string
  onClose?: (message: ActiveNotificationSnackbarMessage) => void | Promise<void>
}

interface NotificationSnackbarContextValue {
  notify: (message: NotificationSnackbarMessage) => void
  notifyEvent: (message: Omit<NotificationSnackbarMessage, "source">) => void
  clearNotifications: () => void
}

interface ActiveNotificationSnackbarMessage extends NotificationSnackbarMessage {
  id: string
  severity: NotificationSnackbarSeverity
}

const NotificationSnackbarContext = createContext<NotificationSnackbarContextValue | null>(null)

export function NotificationSnackbarProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ActiveNotificationSnackbarMessage[]>([])

  const dismissMessage = useCallback((id: string) => {
    setMessages((items) => {
      const dismissed = items.find((item) => item.id === id)
      if (dismissed?.onClose) {
        void Promise.resolve(dismissed.onClose(dismissed)).catch(() => undefined)
      }
      return items.filter((item) => item.id !== id)
    })
  }, [])

  const notify = useCallback((message: NotificationSnackbarMessage) => {
    const next = normalizeMessage(message)
    setMessages((items) => {
      const existingIndex = items.findIndex((item) => item.id === next.id)
      if (existingIndex === -1) return [...items, next]
      return items.map((item, index) => (index === existingIndex ? next : item))
    })
  }, [])

  const notifyEvent = useCallback((message: Omit<NotificationSnackbarMessage, "source">) => {
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

  const value = useMemo<NotificationSnackbarContextValue>(() => ({
    notify,
    notifyEvent,
    clearNotifications,
  }), [clearNotifications, notify, notifyEvent])

  return (
    <NotificationSnackbarContext.Provider value={value}>
      {children}
      <Box
        sx={{
          bottom: { xs: 16, sm: 24 },
          maxHeight: "calc(100vh - 48px)",
          overflowY: "auto",
          pointerEvents: "none",
          position: "fixed",
          right: { xs: 16, sm: 24 },
          width: { xs: "calc(100vw - 32px)", sm: 380 },
          zIndex: (theme) => theme.zIndex.snackbar,
        }}
      >
        <Stack spacing={1.25} sx={{ pointerEvents: "auto" }}>
          {messages.map((message) => (
            <Alert
              key={message.id}
              variant="outlined"
              severity={message.severity}
              onClose={() => dismissMessage(message.id)}
              sx={{
                alignItems: "flex-start",
                borderColor: "var(--app-border)",
                bgcolor: "var(--app-surface-raised)",
                color: "var(--app-text)",
                boxShadow: "0 20px 60px rgba(0, 0, 0, 0.35)",
                width: "100%",
                "& .MuiAlert-icon": { mt: 0.25 },
              }}
            >
              <Stack spacing={1}>
                <Stack spacing={0.25}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <AlertTitle sx={{ mb: 0, color: "var(--app-text)", fontWeight: 800 }}>
                      {message.title}
                    </AlertTitle>
                    {message.source ? (
                      <Typography component="span" sx={{ color: "var(--app-text-faint)", fontSize: 11, fontWeight: 700 }}>
                        {message.source}
                      </Typography>
                    ) : null}
                  </Stack>
                  {message.message ? (
                    <Typography sx={{ color: "var(--app-text-muted)", fontSize: 13, lineHeight: 1.45 }}>
                      {message.message}
                    </Typography>
                  ) : null}
                </Stack>
                {message.href ? (
                  <Button
                    href={message.href}
                    size="small"
                    variant="outlined"
                    sx={{ alignSelf: "flex-start" }}
                    onClick={() => dismissMessage(message.id)}
                  >
                    {message.actionLabel ?? "Open"}
                  </Button>
                ) : null}
              </Stack>
            </Alert>
          ))}
        </Stack>
      </Box>
    </NotificationSnackbarContext.Provider>
  )
}

export function useNotificationSnackbar(): NotificationSnackbarContextValue {
  const context = useContext(NotificationSnackbarContext)
  if (!context) throw new Error("useNotificationSnackbar must be used inside NotificationSnackbarProvider")
  return context
}

function normalizeMessage(message: NotificationSnackbarMessage): ActiveNotificationSnackbarMessage {
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
