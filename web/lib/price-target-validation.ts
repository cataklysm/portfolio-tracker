export type PriceTargetHorizon = "short" | "medium" | "long"

export interface ParsedPriceTargetForm {
  currency: string
  horizon: PriceTargetHorizon
  zoneLow: number
  zoneHigh: number
  note: string | null
}

export type PriceTargetFormResult =
  | { ok: true; value: ParsedPriceTargetForm }
  | { ok: false; error: string }

const HORIZONS = new Set<PriceTargetHorizon>(["short", "medium", "long"])

export function parsePriceTargetForm(formData: Pick<FormData, "get">, fallbackCurrency = "EUR"): PriceTargetFormResult {
  const horizon = readHorizon(formData.get("horizon"))
  if (!horizon) return { ok: false, error: "Select a valid horizon." }
  const currency = readCurrency(formData.get("currency"), fallbackCurrency)
  if (!currency) return { ok: false, error: "Select a valid currency." }

  const low = readRequiredNumber(formData.get("zone_low"), "Zone low")
  if (!low.ok) return low

  const high = readRequiredNumber(formData.get("zone_high"), "Zone high")
  if (!high.ok) return high

  if (low.value > high.value) {
    return { ok: false, error: "Zone low must be less than or equal to zone high." }
  }

  return {
    ok: true,
    value: {
      currency,
      horizon,
      zoneLow: low.value,
      zoneHigh: high.value,
      note: readOptionalText(formData.get("note")),
    },
  }
}

function readHorizon(raw: FormDataEntryValue | null): PriceTargetHorizon | null {
  if (raw === null) return "medium"
  if (typeof raw !== "string") return null
  return HORIZONS.has(raw as PriceTargetHorizon) ? (raw as PriceTargetHorizon) : null
}

function readCurrency(raw: FormDataEntryValue | null, fallbackCurrency: string): string | null {
  const value = typeof raw === "string" && raw.trim() !== "" ? raw.trim() : fallbackCurrency
  const currency = value.toUpperCase()
  return /^[A-Z]{3}$/.test(currency) ? currency : null
}

function readRequiredNumber(raw: FormDataEntryValue | null, label: string): { ok: true; value: number } | { ok: false; error: string } {
  if (typeof raw !== "string" || raw.trim() === "") {
    return { ok: false, error: `${label} is required.` }
  }
  const value = Number(raw)
  if (!Number.isFinite(value)) {
    return { ok: false, error: `${label} must be a valid number.` }
  }
  if (value < 0) {
    return { ok: false, error: `${label} must be greater than or equal to 0.` }
  }
  return { ok: true, value }
}

function readOptionalText(raw: FormDataEntryValue | null): string | null {
  if (typeof raw !== "string") return null
  const value = raw.trim()
  return value.length > 0 ? value : null
}
