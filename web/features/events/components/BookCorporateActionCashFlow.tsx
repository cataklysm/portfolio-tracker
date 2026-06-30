"use client"

import { CashFlowModal, type CashFlowPreset } from "@/components/CashFlowModal"
import type { CashFlowType, CorporateAction, Portfolio, PositionView } from "@/lib/types"

interface BookCorporateActionCashFlowProps {
  action: CorporateAction
  fallbackCurrency: string
  portfolios: Portfolio[]
  positions: PositionView[]
  positionId?: string | null
  revalidatePath?: string
  triggerClassName?: string
  triggerLabel?: string
  triggerTitle?: string
}

export function BookCorporateActionCashFlow({
  action,
  fallbackCurrency,
  portfolios,
  positionId,
  positions,
  revalidatePath,
  triggerClassName,
  triggerLabel = "Book income",
  triggerTitle = "Book this corporate action as income",
}: BookCorporateActionCashFlowProps) {
  const cashFlowType = cashFlowTypeForAction(action.type)
  if (!cashFlowType) return null

  const preferredPosition = resolvePreferredPosition(positions, action.instrument_id, positionId)
  if (!preferredPosition) return null

  const preset: CashFlowPreset = {
    amountPerShare: action.dividend_amount,
    currency: action.dividend_currency ?? fallbackCurrency,
    exDate: action.ex_date,
    instrumentId: action.instrument_id,
    note: `Booked from ${action.type} event (${action.provider})`,
    paymentDate: action.ex_date,
    portfolioId: preferredPosition.portfolio_id,
    positionId: preferredPosition.id,
    revalidatePath,
    sourceEventId: action.stable_action_id,
    sourceEventType: action.type,
    sourceEventVersion: action.version,
    taxRelevantValueDate: action.ex_date,
    type: cashFlowType,
  }

  return (
    <CashFlowModal
      portfolios={portfolios}
      positions={positions}
      preset={preset}
      triggerClassName={triggerClassName}
      triggerLabel={triggerLabel}
      triggerTitle={triggerTitle}
    />
  )
}

function cashFlowTypeForAction(type: string): CashFlowType | null {
  if (type === "dividend") return "dividend"
  if (type === "cash_in_lieu") return "cash_in_lieu"
  return null
}

function resolvePreferredPosition(positions: PositionView[], instrumentId: string, positionId?: string | null): PositionView | null {
  if (positionId) {
    const exact = positions.find((position) => position.id === positionId)
    if (exact) return exact
  }
  return positions.find((position) => position.listing?.instrument_id === instrumentId && position.state === "open")
    ?? positions.find((position) => position.listing?.instrument_id === instrumentId)
    ?? null
}
