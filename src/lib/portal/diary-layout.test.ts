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
