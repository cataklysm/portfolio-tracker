"use client"
import { useActionState } from "react"
import { loginAction } from "@/app/login/actions"
import { useTranslations } from "@/lib/i18n"

const inputClass =
  "w-full rounded-xl border border-slate-700/50 bg-slate-800/60 px-3 py-2.5 text-sm text-white placeholder-slate-600 shadow-[inset_0_1px_0_rgba(0,0,0,0.2)] transition-colors focus:border-sky-500/50 focus:outline-none focus:ring-1 focus:ring-sky-500/30"

export function LoginForm() {
  const t = useTranslations()
  const [error, formAction, isPending] = useActionState(loginAction, null)

  return (
    <form action={formAction} className="space-y-4">
      {error && (
        <p className="rounded-xl border border-rose-500/20 bg-rose-950/40 px-3 py-2.5 text-sm text-rose-400">
          {error}
        </p>
      )}

      <div>
        <label htmlFor="email" className="mb-1.5 block text-xs font-medium text-slate-400">
          {t("login.email")}
        </label>
        <input
          type="email"
          id="email"
          name="email"
          autoComplete="email"
          required
          className={inputClass}
        />
      </div>

      <div>
        <label htmlFor="password" className="mb-1.5 block text-xs font-medium text-slate-400">
          {t("login.password")}
        </label>
        <input
          type="password"
          id="password"
          name="password"
          autoComplete="current-password"
          required
          className={inputClass}
        />
      </div>

      <button
        type="submit"
        disabled={isPending}
        className="mt-2 w-full rounded-xl border border-sky-500/30 bg-sky-500/15 py-2.5 text-sm font-semibold text-sky-200 shadow-[0_0_16px_rgba(56,189,248,0.15),inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-sky-400/50 hover:bg-sky-500/20 hover:shadow-[0_0_20px_rgba(56,189,248,0.25)] disabled:cursor-not-allowed disabled:opacity-40"
      >
        {isPending ? t("login.signingIn") : t("login.signIn")}
      </button>
    </form>
  )
}
