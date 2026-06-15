"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { transferPositionAction } from "@/app/positions/[id]/transfer-action"

interface Props {
  positionId: string
  portfolios: { id: string; name: string }[]
}

export function TransferPositionControl({ positionId, portfolios }: Props) {
  const router = useRouter()
  const [destination, setDestination] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  if (portfolios.length === 0) {
    return <p className="text-[10px] text-[var(--app-text-faint)]">No other portfolio is available to move this position to.</p>
  }

  async function submit() {
    if (!destination || busy) return
    if (!confirm("Move this position to the selected portfolio? If that portfolio already holds this asset, the lots will be merged.")) return
    setBusy(true)
    setError(null)
    const result = await transferPositionAction(positionId, destination)
    if (result.error) {
      setError(result.error)
      setBusy(false)
      return
    }
    router.push(`/positions/${result.positionId}`)
    router.refresh()
  }

  return (
    <div className="space-y-2">
      <select
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        disabled={busy}
        className="w-full rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs text-[var(--app-text)]"
      >
        <option value="">Select destination portfolio…</option>
        {portfolios.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={submit}
        disabled={!destination || busy}
        className="rounded-lg border border-[var(--app-border)] bg-[var(--app-surface)] px-3 py-2 text-xs font-medium text-[var(--app-text-muted)] transition hover:text-[var(--app-text)] disabled:opacity-50"
      >
        {busy ? "Moving…" : "Move position"}
      </button>
      {error && <p className="text-[10px] text-[var(--app-negative)]">{error}</p>}
    </div>
  )
}
