"use client"

import { createContext, useContext, useMemo, useState } from "react"
import { Alert, Slide, Snackbar } from "@mui/material"
import type { SlideProps } from "@mui/material/Slide"

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

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastMessage | null>(null)

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
      <Snackbar
        open={toast !== null}
        autoHideDuration={5000}
        anchorOrigin={{ vertical: "top", horizontal: "center" }}
        slots={{ transition: ToastTransition }}
        onClose={(_, reason) => {
          if (reason !== "clickaway") setToast(null)
        }}
      >
        {toast ? (
          <Alert variant="outlined" severity={toast.severity} onClose={() => setToast(null)} sx={{ bgcolor: "var(--app-surface-raised)", color: "var(--app-text)" }}>
            {toast.message}
          </Alert>
        ) : undefined}
      </Snackbar>
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext)
  if (!context) throw new Error("useToast must be used inside ToastProvider")
  return context
}

function ToastTransition(props: SlideProps) {
  return <Slide {...props} direction="down" />
}
