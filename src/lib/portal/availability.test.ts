import { describe, it, expect } from "vitest"
import type { OpeningHours } from "@/types"
import {
  overlaps,
  bookingInterval,
  garageCapacity,
  hasCapacity,
  computeSlots,
  isWithinOpeningHours,
} from "@/lib/portal/availability"
import { londonWallToUtc } from "@/lib/portal/tz"

const day = (open: boolean, from = "09:00", to = "17:00") => ({ open, from, to })
const HOURS: OpeningHours = {
  monday: day(true), tuesday: day(true), wednesday: day(true), thursday: day(true), friday: day(true),
  saturday: day(true, "09:00", "13:00"),
  sunday: day(false),
}

// Wednesday 7 Oct 2026, 08:00 BST — well before any slot that day.
const NOW = new Date("2026-10-07T07:00:00Z")

const base = {
  openingHours: HOURS,
  durationMins: 60,
  slotMins: 60,
  leadHours: 0,
  maxDaysAhead: 60,
  capacity: 1,
  bookings: [],
  blocks: [],
  now: NOW,
}

describe("overlaps", () => {
  const t = (h: number) => new Date(Date.UTC(2026, 9, 7, h))
  it("is half-open: touching intervals do not overlap", () => {
    expect(overlaps(t(9), t(10), t(10), t(11))).toBe(false)
    expect(overlaps(t(9), t(11), t(10), t(12))).toBe(true)
    expect(overlaps(t(9), t(12), t(10), t(11))).toBe(true)
  })
})

describe("bookingInterval / garageCapacity", () => {
  it("defaults a missing duration to 60 minutes", () => {
    const start = new Date("2026-10-07T09:00:00Z")
    const i = bookingInterval({ scheduledAt: start })
    expect(i.end.getTime() - start.getTime()).toBe(3600000)
  })

  it("uses the bay override, else active technicians, minimum 1", () => {
    expect(garageCapacity(0)).toBe(1)
    expect(garageCapacity(3)).toBe(3)
    expect(garageCapacity(3, 5)).toBe(5)
  })
})

describe("hasCapacity", () => {
  const start = londonWallToUtc("2026-10-07", "10:00")
  const end = londonWallToUtc("2026-10-07", "11:00")
  const busy = (techId: string | null = null) => ({ start, end, technicianId: techId })

  it("is full when concurrent jobs reach capacity", () => {
    expect(hasCapacity(start, end, 1, [busy()], [])).toBe(false)
    expect(hasCapacity(start, end, 2, [busy()], [])).toBe(true)
  })

  it("a garage-wide block closes the slot regardless of capacity", () => {
    expect(hasCapacity(start, end, 5, [], [busy(null)])).toBe(false)
  })

  it("each blocked technician removes one unit of capacity", () => {
    expect(hasCapacity(start, end, 2, [], [busy("t1")])).toBe(true)
    expect(hasCapacity(start, end, 2, [], [busy("t1"), busy("t2")])).toBe(false)
  })

  it("ignores non-overlapping bookings", () => {
    const later = { start: londonWallToUtc("2026-10-07", "11:00"), end: londonWallToUtc("2026-10-07", "12:00") }
    expect(hasCapacity(start, end, 1, [later], [])).toBe(true)
  })
})

describe("computeSlots", () => {
  it("lists hourly slots within opening hours, last start leaving room for the job", () => {
    const slots = computeSlots({ ...base, date: "2026-10-08" }) // Thursday 09:00–17:00
    expect(slots.map((s) => s.label)).toEqual(["09:00", "10:00", "11:00", "12:00", "13:00", "14:00", "15:00", "16:00"])
  })

  it("respects a longer job duration at the end of the day", () => {
    const slots = computeSlots({ ...base, date: "2026-10-08", durationMins: 120 })
    expect(slots.at(-1)?.label).toBe("15:00")
  })

  it("uses shorter Saturday hours and returns nothing for a closed Sunday", () => {
    expect(computeSlots({ ...base, date: "2026-10-10" }).map((s) => s.label)).toEqual(["09:00", "10:00", "11:00", "12:00"])
    expect(computeSlots({ ...base, date: "2026-10-11" })).toEqual([])
  })

  it("returns nothing when opening hours aren't configured", () => {
    expect(computeSlots({ ...base, date: "2026-10-08", openingHours: null })).toEqual([])
  })

  it("converts London wall time to the right UTC instant (BST)", () => {
    const [first] = computeSlots({ ...base, date: "2026-10-08" })
    expect(first.start.toISOString()).toBe("2026-10-08T08:00:00.000Z")
  })

  it("enforces lead time", () => {
    // now = 08:00 BST on the 7th; 4h lead => nothing before 12:00 BST.
    const slots = computeSlots({ ...base, date: "2026-10-07", leadHours: 4 })
    expect(slots[0].label).toBe("12:00")
  })

  it("excludes past days and days beyond the booking window", () => {
    expect(computeSlots({ ...base, date: "2026-10-06" })).toEqual([])
    expect(computeSlots({ ...base, date: "2026-10-20", maxDaysAhead: 5 })).toEqual([])
    expect(computeSlots({ ...base, date: "2026-10-12", maxDaysAhead: 5 }).length).toBeGreaterThan(0)
  })

  it("drops slots that are full or blocked", () => {
    const booked = bookingInterval({ scheduledAt: londonWallToUtc("2026-10-08", "10:00"), durationMins: 60 })
    const block = {
      start: londonWallToUtc("2026-10-08", "13:00"),
      end: londonWallToUtc("2026-10-08", "15:00"),
      technicianId: null,
    }
    const labels = computeSlots({ ...base, date: "2026-10-08", bookings: [booked], blocks: [block] }).map((s) => s.label)
    expect(labels).not.toContain("10:00")
    expect(labels).not.toContain("13:00")
    expect(labels).not.toContain("14:00")
    expect(labels).toContain("11:00")
    expect(labels).toContain("15:00")
  })

  it("offers more slots when capacity allows concurrent jobs", () => {
    const booked = bookingInterval({ scheduledAt: londonWallToUtc("2026-10-08", "10:00"), durationMins: 60 })
    const labels = computeSlots({ ...base, date: "2026-10-08", bookings: [booked], capacity: 2 }).map((s) => s.label)
    expect(labels).toContain("10:00")
  })

  it("handles the autumn clock-change day (2026-10-25, Sunday) when open", () => {
    const hours = { ...HOURS, sunday: day(true, "09:00", "12:00") }
    const slots = computeSlots({ ...base, openingHours: hours, date: "2026-10-25", now: new Date("2026-10-20T10:00:00Z") })
    // 25 Oct is GMT after the change: 09:00 London = 09:00 UTC.
    expect(slots[0].start.toISOString()).toBe("2026-10-25T09:00:00.000Z")
    expect(slots.map((s) => s.label)).toEqual(["09:00", "10:00", "11:00"])
  })
})

describe("isWithinOpeningHours", () => {
  it("accepts times inside hours and rejects outside / closed days", () => {
    expect(isWithinOpeningHours(HOURS, "2026-10-08", "09:00", 60)).toBe(true)
    expect(isWithinOpeningHours(HOURS, "2026-10-08", "16:30", 60)).toBe(false)
    expect(isWithinOpeningHours(HOURS, "2026-10-11", "10:00", 60)).toBe(false)
  })

  it("never warns when hours are unset", () => {
    expect(isWithinOpeningHours(null, "2026-10-11", "03:00", 60)).toBe(true)
  })
})
