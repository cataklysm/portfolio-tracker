"use client"
import { useMemo, useState } from "react"
import { PositionCard } from "./PositionCard"
import { useTranslations } from "@/lib/i18n"
import type { PositionView } from "@/lib/types"

export function PositionsGrid({ positions }: { positions: PositionView[] }) {
  const t = useTranslations()
  const [activeFilter, setActiveFilter] = useState<string | null>(null)
  const [showClosed, setShowClosed] = useState(false)

  const closedCount = useMemo(() => positions.filter((p) => p.state === "closed").length, [positions])

  function handleTypeClick(type: string) {
    setActiveFilter((prev) => (prev === type ? null : type))
  }

  // Closed positions are hidden by default — open/invalid holdings are what you
  // act on. The rest of the toolbar still narrows by asset type.
  const visible = positions.filter((p) => {
    if (!showClosed && p.state === "closed") return false
    if (activeFilter !== null && (p.listing?.asset_type ?? "equity") !== activeFilter) return false
    return true
  })

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        {activeFilter !== null && (
          <button
            onClick={() => setActiveFilter(null)}
            className="flex items-center gap-1.5 rounded-full border border-sky-500/25 bg-sky-500/10 px-3 py-1 text-xs font-medium text-sky-300 transition-all hover:border-sky-400/40 hover:bg-sky-500/15"
          >
            {activeFilter}
            <span className="text-sky-500/70">×</span>
          </button>
        )}
        {closedCount > 0 && (
          <button
            onClick={() => setShowClosed((v) => !v)}
            className={`ml-auto rounded-full border px-3 py-1 text-xs font-medium transition-all ${
              showClosed
                ? "border-slate-400/50 bg-slate-500/15 text-slate-200"
                : "border-slate-700/50 bg-slate-800/40 text-slate-400 hover:border-slate-600/60 hover:text-slate-200"
            }`}
          >
            {showClosed ? t("positionsGrid.hideClosed") : t("positionsGrid.showClosed", { count: closedCount })}
          </button>
        )}
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-800 py-16 text-center text-sm text-slate-500">
          {activeFilter ? t("positionsGrid.noOpenPositionsOfType", { type: activeFilter }) : t("positionsGrid.noOpenPositions")}
          {closedCount > 0 && !showClosed && t("positionsGrid.showClosedHint")}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((pos) => (
            <PositionCard key={pos.id} position={pos} activeFilter={activeFilter} onTypeClick={handleTypeClick} />
          ))}
        </div>
      )}
    </div>
  )
}
