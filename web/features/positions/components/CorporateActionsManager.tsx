"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { CorporateAction } from "@/lib/types"
import {
  applyCorporateActionAction,
  reverseCorporateActionAction,
  type AppliedCorporateAction,
} from "@/features/positions/actions"

interface Props {
  positionId: string
  applied: AppliedCorporateAction[]
  available: CorporateAction[]
  locale: string
}

/**
 * Applies share-ratio corporate actions (splits / reverse splits) to a position
 * and reverses applied ones. Splits restate the holding's share count while
 * preserving cost basis; the position re-derives after each change.
 */
export function CorporateActionsManager({ positionId, applied, available, locale }: Props) {
  const router = useRouter()
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const applicable = available.filter(
    (a) => (a.type === "split" || a.type === "reverse_split") && a.ratio_numerator && a.ratio_denominator,
  )

  async function apply(action: CorporateAction) {
    if (busy) return
    setBusy(action.stable_action_id)
    setError(null)
    const result = await applyCorporateActionAction(positionId, {
      corporate_action_id: action.stable_action_id,
      type: action.type as "split" | "reverse_split",
      ratio_numerator: action.ratio_numerator!,
      ratio_denominator: action.ratio_denominator!,
      ex_date: action.ex_date.slice(0, 10),
      version: action.version,
    })
    setBusy(null)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  async function reverse(application: AppliedCorporateAction) {
    if (busy || !confirm("Reverse this corporate action? The position will be re-derived without it.")) return
    setBusy(application.id)
    setError(null)
    const result = await reverseCorporateActionAction(positionId, application.id)
    setBusy(null)
    if (result.error) setError(result.error)
    else router.refresh()
  }

  return (
    <div className="space-y-3">
      {applied.length > 0 && (
        <ul className="space-y-1">
          {applied.map((a) => (
            <li key={a.id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className={a.reversed_at ? "text-[var(--app-text-faint)] line-through" : "text-[var(--app-text)]"}>
                {ratioLabel(a)} - {a.effective_at.slice(0, 10)}
              </span>
              {a.reversed_at ? (
                <span className="text-[9px] uppercase text-[var(--app-text-faint)]">reversed</span>
              ) : (
                <button
                  type="button"
                  onClick={() => reverse(a)}
                  disabled={busy === a.id}
                  className="rounded-md px-2 py-0.5 text-[10px] text-[var(--app-negative)] disabled:opacity-50"
                >
                  Reverse
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {applicable.length > 0 ? (
        <div className="space-y-1">
          <p className="text-[9px] uppercase tracking-wide text-[var(--app-text-faint)]">Available</p>
          {applicable.map((action) => (
            <div key={action.stable_action_id} className="flex items-center justify-between gap-2 text-[11px]">
              <span className="text-[var(--app-text-muted)]">
                {action.type.replaceAll("_", " ")} {action.ratio_numerator}:{action.ratio_denominator} -{" "}
                {new Date(`${action.ex_date.slice(0, 10)}T00:00:00Z`).toLocaleDateString(locale, { dateStyle: "medium" })}
              </span>
              <button
                type="button"
                onClick={() => apply(action)}
                disabled={busy === action.stable_action_id}
                className="rounded-md border border-[var(--app-border)] px-2 py-0.5 text-[10px] text-[var(--app-text-muted)] transition hover:text-[var(--app-text)] disabled:opacity-50"
              >
                Apply
              </button>
            </div>
          ))}
        </div>
      ) : applied.length === 0 ? (
        <p className="text-[10px] text-[var(--app-text-faint)]">No splits or reverse splits to apply for this instrument.</p>
      ) : null}

      {error && <p className="text-[10px] text-[var(--app-negative)]">{error}</p>}
    </div>
  )
}

function ratioLabel(a: AppliedCorporateAction): string {
  if (!a.ratio_numerator || !a.ratio_denominator) return "adjustment"
  const split = Number(a.ratio_numerator) >= Number(a.ratio_denominator) ? "split" : "reverse split"
  return `${split} ${a.ratio_numerator}:${a.ratio_denominator}`
}
