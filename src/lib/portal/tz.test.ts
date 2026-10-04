import { describe, it, expect } from "vitest"
import {
  londonOffsetMinutes,
  londonDateString,
  londonTimeString,
  startOfLondonDay,
  londonWallToUtc,
  londonDayRange,
  addDays,
  addMonths,
  diffDays,
  weekdayOf,
  isValidDateString,
  formatLondonDateTime,
} from "@/lib/portal/tz"

describe("londonOffsetMinutes", () => {
  it("is 0 in winter and 60 in summer", () => {
    expect(londonOffsetMinutes(new Date("2026-01-15T12:00:00Z"))).toBe(0)
    expect(londonOffsetMinutes(new Date("2026-07-01T12:00:00Z"))).toBe(60)
  })

  it("flips exactly at the DST changes (2026-03-29 and 2026-10-25, 01:00 UTC)", () => {
    expect(londonOffsetMinutes(new Date("2026-03-29T00:59:00Z"))).toBe(0)
    expect(londonOffsetMinutes(new Date("2026-03-29T01:00:00Z"))).toBe(60)
    expect(londonOffsetMinutes(new Date("2026-10-25T00:59:00Z"))).toBe(60)
    expect(londonOffsetMinutes(new Date("2026-10-25T01:00:00Z"))).toBe(0)
  })
})

describe("London civil dates", () => {
  it("rolls the London date forward after 23:00 UTC in summer", () => {
    // 2026-10-03T23:30Z is 00:30 BST on the 4th.
    expect(londonDateString(new Date("2026-10-03T23:30:00Z"))).toBe("2026-10-04")
    expect(londonTimeString(new Date("2026-10-03T23:30:00Z"))).toBe("00:30")
  })

  it("keeps the same date in winter", () => {
    expect(londonDateString(new Date("2026-01-15T23:30:00Z"))).toBe("2026-01-15")
  })
})

describe("startOfLondonDay / londonDayRange", () => {
  it("starts a summer day at 23:00 UTC the previous evening", () => {
    expect(startOfLondonDay("2026-10-03").toISOString()).toBe("2026-10-02T23:00:00.000Z")
  })

  it("starts a winter day at 00:00 UTC", () => {
    expect(startOfLondonDay("2026-12-01").toISOString()).toBe("2026-12-01T00:00:00.000Z")
  })

  it("makes the autumn clock-change day 25 hours long (2026-10-25)", () => {
    const { gte, lt } = londonDayRange("2026-10-25", "2026-10-25")
    expect((lt.getTime() - gte.getTime()) / 3600000).toBe(25)
  })

  it("makes the spring clock-change day 23 hours long (2026-03-29)", () => {
    const { gte, lt } = londonDayRange("2026-03-29", "2026-03-29")
    expect((lt.getTime() - gte.getTime()) / 3600000).toBe(23)
  })

  it("treats `to` as inclusive", () => {
    const { gte, lt } = londonDayRange("2026-10-01", "2026-10-03")
    expect(gte.toISOString()).toBe("2026-09-30T23:00:00.000Z")
    expect(lt.toISOString()).toBe("2026-10-03T23:00:00.000Z")
  })
})

describe("londonWallToUtc", () => {
  it("converts summer and winter wall-clock times", () => {
    expect(londonWallToUtc("2026-07-01", "09:30").toISOString()).toBe("2026-07-01T08:30:00.000Z")
    expect(londonWallToUtc("2026-01-15", "09:30").toISOString()).toBe("2026-01-15T09:30:00.000Z")
  })

  it("round-trips through London formatting", () => {
    const d = londonWallToUtc("2026-10-04", "00:30")
    expect(londonDateString(d)).toBe("2026-10-04")
    expect(londonTimeString(d)).toBe("00:30")
  })

  it("moves a nonexistent spring-forward time (01:30 on 2026-03-29) forward", () => {
    const d = londonWallToUtc("2026-03-29", "01:30")
    expect(londonTimeString(d)).toBe("02:30")
  })
})

describe("civil arithmetic", () => {
  it("adds days across month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01")
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28")
  })

  it("clamps the day when adding months", () => {
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28")
    expect(addMonths("2026-09-27", -3)).toBe("2026-06-27")
    expect(addMonths("2026-01-15", -2)).toBe("2025-11-15")
  })

  it("diffs days and finds weekdays", () => {
    expect(diffDays("2026-10-01", "2026-10-14")).toBe(13)
    expect(weekdayOf("2026-10-03")).toBe(6) // Saturday
  })

  it("validates date strings strictly", () => {
    expect(isValidDateString("2026-02-29")).toBe(false)
    expect(isValidDateString("2026-2-3")).toBe(false)
    expect(isValidDateString("2026-10-03")).toBe(true)
    expect(isValidDateString(undefined)).toBe(false)
  })
})

describe("timezone independence", () => {
  it("gives the same answers regardless of process.env.TZ", () => {
    const original = process.env.TZ
    try {
      const results = ["UTC", "Asia/Kolkata", "America/Los_Angeles"].map((tz) => {
        process.env.TZ = tz
        return [
          londonDateString(new Date("2026-10-03T23:30:00Z")),
          startOfLondonDay("2026-10-03").toISOString(),
          formatLondonDateTime("2026-10-03T23:30:00Z"),
        ].join("|")
      })
      expect(new Set(results).size).toBe(1)
    } finally {
      if (original === undefined) delete process.env.TZ
      else process.env.TZ = original
    }
  })
})
