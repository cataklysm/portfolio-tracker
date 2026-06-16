"use client"
import { useActionState, useState, useTransition } from "react"
import { createApiTokenAction, revokeApiTokenAction } from "@/app/settings/api-token-actions"
import { useTranslations } from "@/lib/i18n"
import type { ApiToken } from "@/lib/types"

const inputClass =
  "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] placeholder:text-[var(--app-text-faint)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent-soft)]"
const labelClass = "mb-1 block text-[9px] font-semibold uppercase tracking-[0.08em] text-[var(--app-text-faint)]"

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
    <section className="app-panel overflow-hidden rounded-xl">
      <div className="flex items-start justify-between gap-4 border-b border-[var(--app-border)] px-5 py-4">
        <div><h2 className="text-xs font-semibold text-[var(--app-text)]">{t("apiTokens.title")}</h2><p className="mt-1 max-w-3xl text-[10px] leading-4 text-[var(--app-text-faint)]">{t("apiTokens.desc")}</p></div>
        {!open && !showReveal && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110"
          >
            {t("apiTokens.create")}
          </button>
        )}
      </div>
      <div className="p-5">

      {showReveal && <RevealBox token={created.token} onDone={() => { setDismissed(created.id); setOpen(false) }} />}

      {open && !showReveal && (
        <form action={formAction} className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] p-4">
          {error && <p className="mb-2 rounded-lg bg-rose-950/50 px-3 py-2 text-xs text-rose-400">{error}</p>}
          <div className="mb-3">
            <label htmlFor="pat-name" className={labelClass}>{t("apiTokens.name")}</label>
            <input id="pat-name" name="name" required placeholder={t("apiTokens.namePlaceholder")} className={inputClass} />
          </div>
          <div className="mb-3">
            <span className={labelClass}>{t("apiTokens.scopes")}</span>
            <div className="grid grid-cols-2 gap-1.5">
              {availableScopes.map((scope) => (
                <label key={scope} className="flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
                  <input type="checkbox" name="scopes" value={scope} defaultChecked className="accent-[var(--app-accent)]" />
                  <span className="font-mono">{scope}</span>
                </label>
              ))}
            </div>
            <p className="mt-1 text-[10px] text-[var(--app-text-faint)]">{t("apiTokens.scopesHint")}</p>
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
            className="rounded-lg bg-[var(--app-accent)] px-3 py-1.5 text-xs font-semibold text-white hover:brightness-110 disabled:opacity-50"
            >
              {pending ? t("apiTokens.creating") : t("apiTokens.createButton")}
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
              {t("apiTokens.cancel")}
            </button>
          </div>
        </form>
      )}

      {tokens.length === 0 ? (
        <p className="text-xs text-[var(--app-text-muted)]">{t("apiTokens.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {tokens.map((token) => (
            <TokenRow key={token.id} token={token} />
          ))}
        </ul>
      )}
      </div>
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
        <code className="min-w-0 flex-1 truncate rounded-lg bg-[var(--app-bg-muted)] px-3 py-2 font-mono text-xs text-[var(--app-positive)]">
          {token}
        </code>
        <button onClick={copy} className="rounded-lg border border-[var(--app-border)] px-2.5 py-2 text-xs text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)]">
          {copied ? t("apiTokens.copied") : t("apiTokens.copy")}
        </button>
      </div>
      <button onClick={onDone} className="mt-3 text-xs text-[var(--app-text-muted)] hover:text-[var(--app-text)]">
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
    <li className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-[var(--app-text)]">{token.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {token.scopes.map((scope) => (
              <span key={scope} className="rounded border border-[var(--app-border)] px-1.5 py-0.5 font-mono text-[9px] text-[var(--app-text-muted)]">
                {scope}
              </span>
            ))}
          </div>
          <p className="mt-1.5 text-[10px] text-[var(--app-text-faint)]">
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
          className="shrink-0 rounded-md border border-[var(--app-border)] px-2 py-1 text-[10px] text-[var(--app-text-muted)] hover:border-[var(--app-negative)] hover:text-[var(--app-negative)] disabled:opacity-50"
        >
          {isRevoking ? t("apiTokens.revoking") : t("apiTokens.revoke")}
        </button>
      </div>
    </li>
  )
}
