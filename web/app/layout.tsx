import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { NotificationMessageProvider } from "@/application/notifications/NotificationMessageProvider"
import { ApplicationThemeProvider } from "@/application/providers/ApplicationThemeProvider"
import { AppShell } from "@/application/shell/AppShell"
import { ToastProvider } from "@/application/toast/ToastProvider"
import { apiFetch, fetchMe } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { LocaleProvider } from "@/lib/locale-context"
import type { Portfolio, PositionView } from "@/lib/types"

/** Unread notification count for the sidebar badge; 0 when signed out/unavailable. */
async function fetchUnreadCount(): Promise<number> {
  try {
    const resp = await apiFetch("/notifications?limit=1", { cache: "no-store" })
    if (!resp.ok) return 0
    return ((await resp.json()) as { unread_count: number }).unread_count
  } catch {
    return 0
  }
}

async function fetchHeaderPositions(): Promise<PositionView[]> {
  try {
    const resp = await apiFetch("/positions", { cache: "no-store" })
    return resp.ok ? ((await resp.json()) as PositionView[]) : []
  } catch {
    return []
  }
}

async function fetchSidebarPortfolios(): Promise<Portfolio[]> {
  try {
    const resp = await apiFetch("/portfolios", { cache: "no-store" })
    return resp.ok ? ((await resp.json()) as Portfolio[]) : []
  } catch {
    return []
  }
}

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Portfolio Tracker",
  description: "Self-hosted portfolio intelligence platform",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [me, locale] = await Promise.all([fetchMe(), getLocale()])
  const [unreadCount, positions, portfolios] = me
    ? await Promise.all([fetchUnreadCount(), fetchHeaderPositions(), fetchSidebarPortfolios()])
    : [0, [], []]

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..500,0..1,0&display=block" rel="stylesheet" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "try{const t=localStorage.getItem('portfolio-theme');document.documentElement.classList.toggle('dark',t?t==='dark':true)}catch{}",
          }}
        />
      </head>
      <body
        className={`${inter.variable} h-screen font-sans antialiased`}
      >
        <ApplicationThemeProvider>
          <LocaleProvider locale={locale}>
            <ToastProvider>
              <NotificationMessageProvider>
                <AppShell me={me} unreadCount={unreadCount} positions={positions} portfolios={portfolios}>{children}</AppShell>
              </NotificationMessageProvider>
            </ToastProvider>
          </LocaleProvider>
        </ApplicationThemeProvider>
      </body>
    </html>
  )
}
