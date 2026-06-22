import { describe, test } from "node:test"
import assert from "node:assert/strict"
import { parsePriceTargetForm } from "./price-target-validation.js"

describe("parsePriceTargetForm", () => {
  test("accepts a complete target zone", () => {
    assert.deepEqual(parsePriceTargetForm(form({
      horizon: "short",
      zone_low: "100.5",
      zone_high: "125",
      note: "  thesis intact  ",
    })), {
      ok: true,
      value: { horizon: "short", zoneLow: 100.5, zoneHigh: 125, note: "thesis intact" },
    })
  })

  test("requires zone low and zone high", () => {
    assert.deepEqual(parsePriceTargetForm(form({ horizon: "medium", zone_high: "125" })), {
      ok: false,
      error: "Zone low is required.",
    })
    assert.deepEqual(parsePriceTargetForm(form({ horizon: "medium", zone_low: "100" })), {
      ok: false,
      error: "Zone high is required.",
    })
  })

  test("rejects negative and non-numeric values", () => {
    assert.deepEqual(parsePriceTargetForm(form({ horizon: "medium", zone_low: "-1", zone_high: "125" })), {
      ok: false,
      error: "Zone low must be greater than or equal to 0.",
    })
    assert.deepEqual(parsePriceTargetForm(form({ horizon: "medium", zone_low: "100", zone_high: "abc" })), {
      ok: false,
      error: "Zone high must be a valid number.",
    })
  })

  test("rejects an inverted zone", () => {
    assert.deepEqual(parsePriceTargetForm(form({ horizon: "long", zone_low: "130", zone_high: "125" })), {
      ok: false,
      error: "Zone low must be less than or equal to zone high.",
    })
  })

  test("defaults a missing horizon to medium but rejects invalid values", () => {
    assert.deepEqual(parsePriceTargetForm(form({ zone_low: "100", zone_high: "125" })), {
      ok: true,
      value: { horizon: "medium", zoneLow: 100, zoneHigh: 125, note: null },
    })
    assert.deepEqual(parsePriceTargetForm(form({ horizon: "weekly", zone_low: "100", zone_high: "125" })), {
      ok: false,
      error: "Select a valid horizon.",
    })
  })
})

function form(values: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(values)) data.set(key, value)
  return data
}
