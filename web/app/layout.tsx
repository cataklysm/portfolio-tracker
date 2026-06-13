import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { AppShell } from "@/components/AppShell"
import { fetchMe } from "@/lib/api"
import { getLocale } from "@/lib/locale"
import { LocaleProvider } from "@/lib/locale-context"

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" })

export const metadata: Metadata = {
  title: "Portfolio",
  description: "Self-hosted portfolio intelligence platform",
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [me, locale] = await Promise.all([fetchMe(), getLocale()])

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
          <AppShell me={me}>{children}</AppShell>
        </LocaleProvider>
      </body>
    </html>
  )
}
