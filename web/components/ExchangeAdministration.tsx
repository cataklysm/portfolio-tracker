"use client"

import { useState, useTransition, type InputHTMLAttributes } from "react"
import { useRouter } from "next/navigation"
import { updateExchangeAction } from "@/app/administration/exchanges/actions"
import type { ExchangeView } from "@/lib/types"

const fieldClass = "w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text)] outline-none transition focus:border-[var(--app-accent)] focus:ring-2 focus:ring-[var(--app-accent-soft)]"
const labelClass = "mb-1 block text-[10px] font-medium uppercase tracking-wider text-[var(--app-text-faint)]"

export function ExchangeAdministration({ exchanges }: { exchanges: ExchangeView[] }) {
  const router = useRouter()
  const [selectedId, setSelectedId] = useState(exchanges[0]?.id ?? "")
  const [message, setMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const selected = exchanges.find((exchange) => exchange.id === selectedId) ?? exchanges[0]

  function run(action: () => Promise<string | null>, success: string) {
    setMessage(null)
    startTransition(async () => {
      const error = await action()
      setMessage(error ?? success)
      if (!error) router.refresh()
    })
  }

  function submit(exchange: ExchangeView, formData: FormData) {
    const replaceHolidays = formData.get("replace_holidays") === "on"
    return updateExchangeAction({
      id: exchange.id,
      name: String(formData.get("name") ?? "").trim(),
      timezone: String(formData.get("timezone") ?? "").trim(),
      regularOpenLocal: emptyToNull(formData.get("regular_open_local")),
      regularCloseLocal: emptyToNull(formData.get("regular_close_local")),
      ...(replaceHolidays ? { holidays: splitDates(String(formData.get("holidays") ?? "")) } : {}),
    })
  }

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-5 lg:px-6">
      <header className="mb-6">
        <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--app-accent)]">Administration</p>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--app-text)]">Exchange calendar</h1>
        <p className="mt-1 text-xs text-[var(--app-text-muted)]">Maintain exchange timezones, regular sessions, and holiday calendars.</p>
      </header>

      {message ? <p className="mb-4 rounded-lg border border-[var(--app-border)] bg-[var(--app-surface-raised)] px-3 py-2 text-xs text-[var(--app-text-muted)]">{message}</p> : null}

      <div className="grid gap-5 lg:grid-cols-[320px_minmax(0,1fr)]">
        <section className="app-panel overflow-hidden rounded-xl">
          <div className="border-b border-[var(--app-border)] px-4 py-3">
            <h2 className="text-sm font-semibold text-[var(--app-text)]">Exchanges</h2>
          </div>
          <div className="max-h-[620px] overflow-y-auto p-2">
            {exchanges.map((exchange) => (
              <button
                key={exchange.id}
                type="button"
                onClick={() => setSelectedId(exchange.id)}
                className={`w-full rounded-lg px-3 py-2 text-left transition ${selected?.id === exchange.id ? "bg-[var(--app-accent-soft)] text-[var(--app-accent)]" : "text-[var(--app-text-muted)] hover:bg-[var(--app-surface-hover)] hover:text-[var(--app-text)]"}`}
              >
                <p className="text-xs font-semibold">{exchange.mic}</p>
                <p className="mt-0.5 truncate text-[10px]">{exchange.name}</p>
              </button>
            ))}
            {exchanges.length === 0 ? <p className="px-3 py-8 text-center text-xs text-[var(--app-text-faint)]">No exchanges available.</p> : null}
          </div>
        </section>

        {selected ? (
          <section className="app-panel rounded-xl p-4">
            <div className="mb-4">
              <h2 className="text-sm font-semibold text-[var(--app-text)]">{selected.mic}</h2>
              <p className="mt-0.5 text-[10px] text-[var(--app-text-faint)]">{selected.name}</p>
            </div>
            <form key={selected.id} action={(formData) => run(() => submit(selected, formData), `${selected.mic} updated.`)} className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" name="name" defaultValue={selected.name} required />
              <Field label="Timezone" name="timezone" defaultValue={selected.timezone} required />
              <Field label="Regular open" name="regular_open_local" defaultValue={selected.regular_open_local ?? ""} placeholder="09:00" />
              <Field label="Regular close" name="regular_close_local" defaultValue={selected.regular_close_local ?? ""} placeholder="17:30" />
              <div className="sm:col-span-2">
                <label className="mb-2 flex items-center gap-2 text-xs text-[var(--app-text-muted)]">
                  <input type="checkbox" name="replace_holidays" className="accent-[var(--app-accent)]" />
                  Replace holiday calendar
                </label>
                <textarea name="holidays" placeholder="2026-01-01&#10;2026-12-25" className={`${fieldClass} min-h-36 resize-y`} />
                <p className="mt-1 text-[10px] text-[var(--app-text-faint)]">One date per line, comma, semicolon, or whitespace. Leave the checkbox off to keep existing holidays unchanged.</p>
              </div>
              <div className="sm:col-span-2">
                <button disabled={pending} className="rounded-lg bg-[var(--app-accent)] px-4 py-2 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-50">{pending ? "Saving..." : "Save exchange"}</button>
              </div>
            </form>
          </section>
        ) : null}
      </div>
    </div>
  )
}

function Field({ label, ...props }: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return <div><label className={labelClass}>{label}</label><input {...props} className={`${fieldClass} ${props.className ?? ""}`} /></div>
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const raw = String(value ?? "").trim()
  return raw || null
}

function splitDates(value: string): string[] {
  return value.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean)
}
