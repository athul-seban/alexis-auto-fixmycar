import { describe, it, expect } from "vitest"
import { DEFAULT_OPENING_HOURS, normaliseOpeningHours, openingHoursError, openingHoursSchema } from "@/lib/portal/opening-hours"

describe("openingHoursSchema", () => {
  it("accepts the default week and closed days with blank times", () => {
    expect(openingHoursSchema.safeParse(DEFAULT_OPENING_HOURS).success).toBe(true)
    expect(openingHoursSchema.safeParse({ ...DEFAULT_OPENING_HOURS, monday: { open: false, from: "", to: "" } }).success).toBe(true)
  })

  it("rejects malformed times, reversed ranges and missing days", () => {
    const bad = (monday: object) => openingHoursSchema.safeParse({ ...DEFAULT_OPENING_HOURS, monday }).success
    expect(bad({ open: true, from: "9am", to: "17:00" })).toBe(false)
    expect(bad({ open: true, from: "25:00", to: "26:00" })).toBe(false)
    expect(bad({ open: true, from: "17:00", to: "09:00" })).toBe(false)
    expect(bad({ open: true, from: "09:00", to: "09:00" })).toBe(false)
    const { tuesday: _t, ...missing } = DEFAULT_OPENING_HOURS
    expect(openingHoursSchema.safeParse(missing).success).toBe(false)
  })
})

describe("openingHoursError", () => {
  it("names the offending day", () => {
    expect(openingHoursError(DEFAULT_OPENING_HOURS)).toBeNull()
    expect(openingHoursError({ ...DEFAULT_OPENING_HOURS, friday: { open: true, from: "18:00", to: "09:00" } })).toBe(
      "Friday: Closing time must be after opening time"
    )
  })
})

describe("normaliseOpeningHours", () => {
  it("returns the default week for null and fills missing days", () => {
    expect(normaliseOpeningHours(null)).toEqual(DEFAULT_OPENING_HOURS)
    const partial = normaliseOpeningHours({ monday: { open: true, from: "08:00", to: "12:00" } })
    expect(partial.monday).toEqual({ open: true, from: "08:00", to: "12:00" })
    expect(partial.tuesday).toEqual(DEFAULT_OPENING_HOURS.tuesday)
  })
})
