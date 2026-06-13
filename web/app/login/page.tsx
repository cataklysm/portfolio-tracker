import { LoginForm } from "@/components/LoginForm"
import { getTranslations } from "@/lib/i18n"

export default function LoginPage() {
  const t = getTranslations()
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Wordmark */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-sky-500/30 bg-sky-500/10 text-xl font-bold text-sky-300 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
            P
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white">{t("login.brand")}</h1>
        </div>

        {/* Glass card */}
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-8 shadow-[0_8px_32px_rgba(0,0,0,0.55),inset_0_1px_0_rgba(255,255,255,0.05)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/18 to-transparent" />
          <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-white/[0.025] to-transparent" />
          <div className="relative">
            <h2 className="mb-6 text-base font-semibold text-slate-200">{t("login.title")}</h2>
            <LoginForm />
          </div>
        </div>
      </div>
    </main>
  )
}
