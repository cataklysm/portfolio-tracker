import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AppShell } from "@/components/AppShell"
import { apiFetch, fetchMe } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { LocaleProvider } from "@/lib/locale-context"
import type { PositionView } from "@/lib/types"

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
  const [unreadCount, positions] = me ? await Promise.all([fetchUnreadCount(), fetchHeaderPositions()]) : [0, []]

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
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
        <LocaleProvider locale={locale}>
          <AppShell me={me} unreadCount={unreadCount} positions={positions}>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  )
}
