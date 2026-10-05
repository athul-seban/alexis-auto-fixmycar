import { describe, it, expect } from "vitest"
import { DEFAULT_OPENING_HOURS } from "@/lib/portal/opening-hours"
import {
  startOfWeek,
  weekDays,
  minutesOnDay,
  layoutDay,
  hourWindow,
  closedRanges,
  snapToTime,
  monthGrid,
  isInMonth,
  groupByDay,
  dropSlot,
  sameTimeOnDay,
  blockedDays,
  shiftSlot,
  keyboardMove,
} from "@/lib/portal/diary-layout"
import { londonWallToUtc } from "@/lib/portal/tz"

const at = (day: string, hhmm: string) => londonWallToUtc(day, hhmm)
const ev = (id: string, day: string, from: string, to: string) => ({ id, start: at(day, from), end: at(day, to) })

describe("weeks", () => {
  it("starts weeks on Monday", () => {
    expect(startOfWeek("2026-10-03")).toBe("2026-09-28") // Saturday → Monday
    expect(startOfWeek("2026-10-05")).toBe("2026-10-05") // Monday
    expect(startOfWeek("2026-10-04")).toBe("2026-09-28") // Sunday belongs to the week that began the previous Monday
  })

  it("lists seven consecutive days", () => {
    expect(weekDays("2026-10-07")).toEqual(["2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"])
  })
})

describe("minutesOnDay", () => {
  it("reads London wall-clock minutes, including summer time", () => {
    expect(minutesOnDay(at("2026-07-01", "09:30"), "2026-07-01", "start")).toBe(570)
  })

  it("clips events that cross midnight", () => {
    const late = new Date(at("2026-10-07", "23:00").getTime() + 3 * 3600000) // 02:00 next day
    expect(minutesOnDay(late, "2026-10-07", "end")).toBe(1440)
    expect(minutesOnDay(late, "2026-10-08", "start")).toBe(120)
    expect(minutesOnDay(at("2026-10-07", "10:00"), "2026-10-08", "start")).toBe(0)
  })

  it("treats an end of exactly 00:00 as the end of the previous day", () => {
    expect(minutesOnDay(at("2026-10-08", "00:00"), "2026-10-07", "end")).toBe(1440)
  })

  it("keeps wall-clock position on the 25-hour clock-change day", () => {
    expect(minutesOnDay(at("2026-10-25", "09:00"), "2026-10-25", "start")).toBe(540)
  })
})

describe("layoutDay", () => {
  const day = "2026-10-07"
  const place = (events: ReturnType<typeof ev>[], ws = 480, we = 1080) => layoutDay(events, day, ws, we)

  it("positions a lone event by its start and duration inside the window", () => {
    const [p] = place([ev("a", day, "10:00", "11:30")])
    expect(p).toMatchObject({ top: 120, height: 90, column: 0, columns: 1 })
  })

  it("puts overlapping events side by side and shares the width", () => {
    const placed = place([ev("a", day, "10:00", "12:00"), ev("b", day, "11:00", "13:00"), ev("c", day, "10:30", "11:30")])
    const by = Object.fromEntries(placed.map((p) => [p.event.id, p]))
    expect(new Set(placed.map((p) => p.column)).size).toBe(3)
    expect(placed.every((p) => p.columns === 3)).toBe(true)
    expect(by.a.column).toBe(0)
  })

  it("reuses a column once an earlier event has finished", () => {
    const placed = place([ev("a", day, "09:00", "10:00"), ev("b", day, "09:30", "10:30"), ev("c", day, "10:00", "11:00")])
    const by = Object.fromEntries(placed.map((p) => [p.event.id, p]))
    expect(by.c.column).toBe(by.a.column) // slots into a's column after it ends
    expect(placed.every((p) => p.columns === 2)).toBe(true)
  })

  it("does not widen separate clusters (back-to-back events stay full width)", () => {
    const placed = place([ev("a", day, "09:00", "10:00"), ev("b", day, "10:00", "11:00")])
    expect(placed.every((p) => p.columns === 1 && p.column === 0)).toBe(true)
  })

  it("clips to the visible window and drops events entirely outside it", () => {
    const placed = place([ev("early", day, "07:00", "09:00"), ev("out", day, "20:00", "21:00"), ev("late", day, "17:00", "19:00")])
    const ids = placed.map((p) => p.event.id)
    expect(ids).toContain("early")
    expect(ids).toContain("late")
    expect(ids).not.toContain("out")
    const early = placed.find((p) => p.event.id === "early")!
    expect(early.top).toBe(0)
    expect(early.height).toBe(60) // 08:00–09:00 visible
  })

  it("gives very short events a minimum visible height", () => {
    const [p] = place([ev("tiny", day, "10:00", "10:05")])
    expect(p.height).toBeGreaterThanOrEqual(20)
  })

  it("ignores events on other days", () => {
    expect(place([ev("other", "2026-10-08", "10:00", "11:00")])).toEqual([])
  })
})

describe("hourWindow", () => {
  it("spans the earliest opening to the latest closing across the week", () => {
    expect(hourWindow(DEFAULT_OPENING_HOURS)).toEqual({ startHour: 9, endHour: 18 })
  })

  it("defaults to 08:00–18:00 without opening hours", () => {
    expect(hourWindow(null)).toEqual({ startHour: 8, endHour: 18 })
  })

  it("widens to include bookings outside opening hours", () => {
    expect(hourWindow(DEFAULT_OPENING_HOURS, [{ start: 7 * 60 + 30, end: 20 * 60 + 15 }])).toEqual({ startHour: 7, endHour: 21 })
  })
})

describe("closedRanges", () => {
  const ws = 8 * 60
  const we = 19 * 60
  it("shades before opening and after closing", () => {
    // Wednesday 09:00–17:30 inside an 08:00–19:00 window
    expect(closedRanges(DEFAULT_OPENING_HOURS, "2026-10-07", ws, we)).toEqual([
      { top: 0, height: 60 },
      { top: 570, height: 90 },
    ])
  })

  it("shades the whole day when closed", () => {
    expect(closedRanges(DEFAULT_OPENING_HOURS, "2026-10-11", ws, we)).toEqual([{ top: 0, height: 660 }]) // Sunday
  })

  it("shades nothing without opening hours", () => {
    expect(closedRanges(null, "2026-10-07", ws, we)).toEqual([])
  })
})

describe("snapToTime", () => {
  it("snaps down to the slot size and clamps within the day", () => {
    expect(snapToTime(9 * 60 + 44)).toBe("09:30")
    expect(snapToTime(9 * 60 + 15, 15)).toBe("09:15")
    expect(snapToTime(-5)).toBe("00:00")
    expect(snapToTime(5000)).toBe("23:30")
  })
})

describe("monthGrid", () => {
  it("always returns six Monday-first weeks that contain the whole month", () => {
    for (const date of ["2026-10-15", "2026-02-10", "2026-03-31", "2027-01-01"]) {
      const g = monthGrid(date)
      expect(g.weeks).toHaveLength(6)
      expect(g.weeks.every((w) => w.length === 7)).toBe(true)
      expect(weekdayOfDay(g.weeks[0][0])).toBe(1) // Monday
      expect(g.from).toBe(g.weeks[0][0])
      expect(g.to).toBe(g.weeks[5][6])
      const inMonth = g.weeks.flat().filter((d) => isInMonth(d, g.month))
      expect(inMonth[0].endsWith("-01")).toBe(true)
    }
  })

  it("starts on the Monday on or before the 1st", () => {
    expect(monthGrid("2026-10-15").from).toBe("2026-09-28") // 1 Oct 2026 is a Thursday
    expect(monthGrid("2026-06-20").from).toBe("2026-06-01") // 1 Jun 2026 is a Monday
    expect(monthGrid("2026-02-10").weeks.flat()).toContain("2026-02-28")
  })

  it("spans exactly the 42 days the diary API allows", () => {
    const g = monthGrid("2026-10-15")
    expect(g.weeks.flat()).toHaveLength(42)
  })
})

function weekdayOfDay(d: string) {
  return new Date(`${d}T12:00:00Z`).getUTCDay()
}

describe("groupByDay", () => {
  it("buckets by London day (not UTC) and sorts each day by start time", () => {
    const days = ["2026-07-01", "2026-07-02"]
    const e = (iso: string) => ({ start: new Date(iso) })
    const map = groupByDay([e("2026-07-01T23:30:00Z"), e("2026-07-01T08:00:00Z"), e("2026-07-02T09:00:00Z"), e("2026-07-09T09:00:00Z")], days)
    // 23:30Z on 1 Jul is 00:30 BST on 2 Jul
    expect(map.get("2026-07-01")!.map((x) => x.start.toISOString())).toEqual(["2026-07-01T08:00:00.000Z"])
    expect(map.get("2026-07-02")!.map((x) => x.start.toISOString())).toEqual(["2026-07-01T23:30:00.000Z", "2026-07-02T09:00:00.000Z"])
  })
})

describe("dropSlot", () => {
  it("turns a pointer offset into a snapped slot, from the grid's first visible minute", () => {
    // 1px per minute, grid starts at 08:00
    expect(dropSlot(0, 1, 8 * 60)).toBe("08:00")
    expect(dropSlot(95, 1, 8 * 60)).toBe("09:30") // 09:35 snaps down to 09:30
    expect(dropSlot(30, 1, 8 * 60)).toBe("08:30")
    expect(dropSlot(-20, 1, 8 * 60)).toBe("08:00") // above the grid clamps to the top
    expect(dropSlot(10_000, 1, 8 * 60)).toBe("23:30") // below clamps to the last slot of the day
  })
  it("respects the pixel scale", () => {
    expect(dropSlot(60, 1, 0)).toBe("01:00")
    expect(dropSlot(60, 2, 0)).toBe("00:30") // 2px per minute
  })
})

describe("sameTimeOnDay", () => {
  it("keeps the London wall-clock time on the new day", () => {
    const original = londonWallToUtc("2026-10-20", "14:30")
    expect(sameTimeOnDay(original, "2026-10-22").toISOString()).toBe(londonWallToUtc("2026-10-22", "14:30").toISOString())
  })
  it("stays at the same wall-clock time across the autumn clock change", () => {
    const before = londonWallToUtc("2026-10-23", "09:00") // BST
    const moved = sameTimeOnDay(before, "2026-10-27") // GMT
    expect(moved.toISOString()).toBe("2026-10-27T09:00:00.000Z")
    expect(before.toISOString()).toBe("2026-10-23T08:00:00.000Z") // proves the offset really differed
  })
  it("stays at the same wall-clock time across the spring clock change", () => {
    const before = londonWallToUtc("2026-03-27", "09:00") // GMT
    expect(sameTimeOnDay(before, "2026-03-31").toISOString()).toBe("2026-03-31T08:00:00.000Z") // BST
  })
})

describe("blockedDays", () => {
  const days = ["2026-10-12", "2026-10-13", "2026-10-14"]
  const block = (from: string, to: string) => ({ start: londonWallToUtc(from.slice(0, 10), from.slice(11)), end: londonWallToUtc(to.slice(0, 10), to.slice(11)) })

  it("marks only the days a block overlaps", () => {
    expect([...blockedDays([block("2026-10-13 10:00", "2026-10-13 12:00")], days)]).toEqual(["2026-10-13"])
  })
  it("marks every day of a multi-day block", () => {
    expect([...blockedDays([block("2026-10-12 09:00", "2026-10-14 09:00")], days)]).toEqual(days)
  })
  it("treats an all-day block (midnight to midnight) as that day only", () => {
    expect([...blockedDays([block("2026-10-13 00:00", "2026-10-14 00:00")], days)]).toEqual(["2026-10-13"])
  })
  it("ignores blocks outside the range and handles none", () => {
    expect(blockedDays([block("2026-11-01 09:00", "2026-11-01 10:00")], days).size).toBe(0)
    expect(blockedDays([], days).size).toBe(0)
  })
})

describe("shiftSlot", () => {
  const at = (day: string, hhmm: string) => londonWallToUtc(day, hhmm).toISOString()
  it("moves by days or by half hours, keeping wall-clock time", () => {
    expect(shiftSlot(londonWallToUtc("2026-10-20", "09:00"), 1, 0).toISOString()).toBe(at("2026-10-21", "09:00"))
    expect(shiftSlot(londonWallToUtc("2026-10-20", "09:00"), 0, 30).toISOString()).toBe(at("2026-10-20", "09:30"))
    expect(shiftSlot(londonWallToUtc("2026-10-20", "09:00"), 0, -30).toISOString()).toBe(at("2026-10-20", "08:30"))
  })
  it("carries minutes across midnight in both directions", () => {
    expect(shiftSlot(londonWallToUtc("2026-10-20", "23:30"), 0, 30).toISOString()).toBe(at("2026-10-21", "00:00"))
    expect(shiftSlot(londonWallToUtc("2026-10-20", "00:00"), 0, -30).toISOString()).toBe(at("2026-10-19", "23:30"))
  })
  it("holds 09:00 across the clock change", () => {
    expect(shiftSlot(londonWallToUtc("2026-10-23", "09:00"), 4, 0).toISOString()).toBe("2026-10-27T09:00:00.000Z")
  })
  it("combines a day and minute shift", () => {
    expect(shiftSlot(londonWallToUtc("2026-10-20", "23:30"), 1, 60).toISOString()).toBe(at("2026-10-22", "00:30"))
  })
})

describe("keyboardMove", () => {
  const k = (key: string, extra = {}) => ({ key, altKey: true, ...extra })
  it("maps Alt+arrows to day moves and (outside month view) half-hour moves", () => {
    expect(keyboardMove(k("ArrowRight"), "week")).toEqual({ days: 1, minutes: 0 })
    expect(keyboardMove(k("ArrowLeft"), "day")).toEqual({ days: -1, minutes: 0 })
    expect(keyboardMove(k("ArrowDown"), "week")).toEqual({ days: 0, minutes: 30 })
    expect(keyboardMove(k("ArrowUp"), "day")).toEqual({ days: 0, minutes: -30 })
  })
  it("moves by whole weeks with up/down in the month view", () => {
    expect(keyboardMove(k("ArrowDown"), "month")).toEqual({ days: 7, minutes: 0 })
    expect(keyboardMove(k("ArrowUp"), "month")).toEqual({ days: -7, minutes: 0 })
  })
  it("ignores plain arrows, other modifiers and other keys", () => {
    expect(keyboardMove({ key: "ArrowRight", altKey: false }, "week")).toBeNull()
    expect(keyboardMove(k("ArrowRight", { ctrlKey: true }), "week")).toBeNull()
    expect(keyboardMove(k("Enter"), "week")).toBeNull()
  })
})
