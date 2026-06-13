"use client"
import { useActionState, useState, useTransition } from "react"
import { createApiTokenAction, revokeApiTokenAction } from "@/app/settings/api-token-actions"
import { useTranslations } from "@/lib/i18n"
import type { ApiToken } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-sky-500"
const labelClass = "mb-1 block text-[11px] text-slate-500"

interface Props {
  tokens: ApiToken[]
  availableScopes: string[]
}

export function ApiTokensSection({ tokens, availableScopes }: Props) {
  const t = useTranslations()
  const [open, setOpen] = useState(false)
  const [dismissed, setDismissed] = useState<string | null>(null)
  const [state, formAction, pending] = useActionState(createApiTokenAction, null)

  const created = state && "token" in state ? state.token : null
  const error = state && "error" in state ? state.error : null
  const showReveal = created && created.id !== dismissed

  return (
    <section className="relative overflow-hidden rounded-2xl border border-slate-700/40 bg-gradient-to-b from-slate-800/60 to-[#080d17]/80 p-6 shadow-[0_8px_32px_rgba(0,0,0,0.45),inset_0_1px_0_rgba(255,255,255,0.05)]">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className="mb-1 flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-slate-500">{t("apiTokens.title")}</h2>
        {!open && !showReveal && (
          <button
            onClick={() => setOpen(true)}
            className="rounded-lg border border-sky-500/30 bg-sky-500/10 px-3 py-1.5 text-sm font-medium text-sky-200 hover:bg-sky-500/20"
          >
            {t("apiTokens.create")}
          </button>
        )}
      </div>
      <p className="mb-4 text-xs text-slate-600">{t("apiTokens.desc")}</p>

      {showReveal && <RevealBox token={created.token} onDone={() => { setDismissed(created.id); setOpen(false) }} />}

      {open && !showReveal && (
        <form action={formAction} className="mb-4 rounded-xl border border-slate-700/50 bg-slate-900/60 p-3">
          {error && <p className="mb-2 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p>}
          <div className="mb-3">
            <label htmlFor="pat-name" className={labelClass}>{t("apiTokens.name")}</label>
            <input id="pat-name" name="name" required placeholder={t("apiTokens.namePlaceholder")} className={inputClass} />
          </div>
          <div className="mb-3">
            <span className={labelClass}>{t("apiTokens.scopes")}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {availableScopes.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-xs text-slate-300">
                  <input type="checkbox" name="scopes" value={scope} defaultChecked className="accent-sky-500" />
                  <span className="font-mono">{scope}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-slate-600">{t("apiTokens.scopesHint")}</p>
          </div>
          <div className="mb-3">
            <label htmlFor="pat-exp" className={labelClass}>{t("apiTokens.expiry")}</label>
            <select id="pat-exp" name="expires_in_days" defaultValue="" className={inputClass}>
              <option value="">{t("apiTokens.expiryNever")}</option>
              <option value="30">{t("apiTokens.expiry30")}</option>
              <option value="90">{t("apiTokens.expiry90")}</option>
              <option value="365">{t("apiTokens.expiry365")}</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={pending}
              className="rounded-lg bg-sky-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-sky-500 disabled:opacity-50"
            >
              {pending ? t("apiTokens.creating") : t("apiTokens.createButton")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-300">
              {t("apiTokens.cancel")}
            </button>
          </div>
        </form>
      )}

      {tokens.length === 0 ? (
        <p className="text-sm text-slate-500">{t("apiTokens.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} />
          ))}
        </ul>
      )}
    </section>
  )
}

function RevealBox({ token, onDone }: { token: string; onDone: () => void }) {
  const t = useTranslations()
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(token)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <div className="mb-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
      <p className="mb-1 text-xs font-semibold text-emerald-300">{t("apiTokens.createdTitle")}</p>
      <p className="mb-2 text-[11px] text-amber-400/80">{t("apiTokens.createdWarning")}</p>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-slate-950 px-3 py-2 font-mono text-xs text-emerald-200">
          {token}
        </code>
        <button onClick={copy} className="rounded-lg border border-slate-600 px-2.5 py-2 text-xs text-slate-300 hover:bg-slate-800">
          {copied ? t("apiTokens.copied") : t("apiTokens.copy")}
        </button>
      </div>
      <button onClick={onDone} className="mt-3 text-xs text-slate-400 hover:text-white">
        {t("apiTokens.done")}
      </button>
    </div>
  )
}

function TokenRow({ token }: { token: ApiToken }) {
  const t = useTranslations()
  const [isRevoking, startRevoke] = useTransition()
  const fmtDate = (iso: string) => iso.slice(0, 10)

  return (
    <li className="rounded-lg border border-slate-800 bg-slate-900/50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{token.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {token.scopes.map((scope) => (
              <span key={scope} className="rounded border border-slate-700/50 bg-slate-800/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
                {scope}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-600">
            {t("apiTokens.created", { date: fmtDate(token.created_at) })}
            {" · "}
            {token.last_used_at ? t("apiTokens.lastUsed", { date: fmtDate(token.last_used_at) }) : t("apiTokens.neverUsed")}
            {" · "}
            {token.expires_at ? t("apiTokens.expiresOn", { date: fmtDate(token.expires_at) }) : t("apiTokens.noExpiry")}
          </p>
        </div>
        <button
          onClick={() => {
            if (!confirm(t("apiTokens.confirmRevoke"))) return
            startRevoke(async () => void (await revokeApiTokenAction(token.id)))
          }}
          disabled={isRevoking}
          className="shrink-0 rounded-md border border-slate-700/60 px-2 py-1 text-xs text-slate-400 hover:border-rose-500/40 hover:text-rose-300 disabled:opacity-50"
        >
          {isRevoking ? t("apiTokens.revoking") : t("apiTokens.revoke")}
        </button>
      </div>
    </li>
  )
}
