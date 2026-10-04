import { describe, it, expect } from "vitest"
import { presetRange, presetLabel, matchPreset, parseCivilRange, rangeToUtc, MAX_RANGE_DAYS } from "@/lib/portal/date-range"

// Saturday 3 Oct 2026, mid-day BST.
const NOW = new Date("2026-10-03T11:00:00Z")

describe("presetRange", () => {
  it("14d is 14 inclusive days ending today", () => {
    expect(presetRange("14d", NOW)).toEqual({ from: "2026-09-20", to: "2026-10-03" })
  })

  it("3m goes back three calendar months", () => {
    expect(presetRange("3m", NOW)).toEqual({ from: "2026-07-03", to: "2026-10-03" })
  })

  it("ytd starts on 1 January", () => {
    expect(presetRange("ytd", NOW)).toEqual({ from: "2026-01-01", to: "2026-10-03" })
  })

  it("lastYear is the previous calendar year", () => {
    expect(presetRange("lastYear", NOW)).toEqual({ from: "2025-01-01", to: "2025-12-31" })
  })

  it("uses the London date, not the UTC date, just after midnight BST", () => {
    // 23:30 UTC on 3 Oct is already 4 Oct in London.
    expect(presetRange("14d", new Date("2026-10-03T23:30:00Z")).to).toBe("2026-10-04")
  })
})

describe("presetLabel / matchPreset", () => {
  it("labels the last-year chip with the year", () => {
    expect(presetLabel("lastYear", NOW)).toBe("2025")
    expect(presetLabel("14d", NOW)).toBe("14 Days")
  })

  it("matches a range back to its preset, else null", () => {
    expect(matchPreset({ from: "2026-09-20", to: "2026-10-03" }, NOW)).toBe("14d")
    expect(matchPreset({ from: "2026-09-21", to: "2026-10-03" }, NOW)).toBeNull()
  })
})

describe("parseCivilRange", () => {
  it("defaults to the last 14 days when nothing is supplied", () => {
    const r = parseCivilRange(null, null, NOW)
    expect(r).toEqual({ ok: true, range: { from: "2026-09-20", to: "2026-10-03" } })
  })

  it("accepts a valid custom range", () => {
    expect(parseCivilRange("2026-01-01", "2026-02-01", NOW)).toEqual({
      ok: true,
      range: { from: "2026-01-01", to: "2026-02-01" },
    })
  })

  it("rejects malformed, reversed, half-supplied and oversized ranges", () => {
    expect(parseCivilRange("nope", "2026-02-01", NOW).ok).toBe(false)
    expect(parseCivilRange("2026-02-01", "2026-01-01", NOW).ok).toBe(false)
    expect(parseCivilRange("2026-01-01", null, NOW).ok).toBe(false)
    expect(MAX_RANGE_DAYS).toBeGreaterThan(366)
    expect(parseCivilRange("2020-01-01", "2026-01-01", NOW).ok).toBe(false)
  })
})

describe("rangeToUtc", () => {
  it("converts to a half-open London-aligned interval", () => {
    const { gte, lt } = rangeToUtc({ from: "2026-10-03", to: "2026-10-03" })
    expect(gte.toISOString()).toBe("2026-10-02T23:00:00.000Z")
    expect(lt.toISOString()).toBe("2026-10-03T23:00:00.000Z")
  })
})
