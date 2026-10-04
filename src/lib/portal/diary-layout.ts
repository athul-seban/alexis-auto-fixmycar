import type { OpeningHours } from "@/types"
import { addDays, londonDateString, londonParts, londonWallToUtc, startOfLondonDay, weekdayOf } from "@/lib/portal/tz"
import { DAY_ORDER, type DayKey } from "@/lib/portal/opening-hours"
import { toMinutes } from "@/lib/portal/availability"

// Geometry for the diary grid. Everything is in London *wall-clock* minutes since midnight, so a
// 09:00 booking sits at the 09:00 line even on the 23/25-hour clock-change days.

/** Monday of the week containing a civil date. */
export function startOfWeek(dateStr: string): string {
  const dow = weekdayOf(dateStr) // 0 = Sunday
  return addDays(dateStr, dow === 0 ? -6 : 1 - dow)
}

export function weekDays(dateStr: string): string[] {
  const start = startOfWeek(dateStr)
  return Array.from({ length: 7 }, (_, i) => addDays(start, i))
}

/** Wall-clock minutes (London) of an instant on the given civil day; clipped to the day's bounds. */
export function minutesOnDay(instant: Date, day: string, edge: "start" | "end"): number {
  const date = londonDateString(instant)
  if (date < day) return 0
  if (date > day) return 1440
  const p = londonParts(instant)
  const m = p.hour * 60 + p.minute
  // An end at exactly 00:00 of this day belongs to the previous day's end-of-day (24:00).
  return edge === "end" && m === 0 ? 1440 : m
}

export interface DiaryEvent {
  id: string
  start: Date
  end: Date
}

export interface PlacedEvent<T extends DiaryEvent> {
  event: T
  /** minutes from midnight, clipped to the visible window */
  top: number
  height: number
  /** overlap column (0-based) and how many columns share this cluster */
  column: number
  columns: number
}

/**
 * Lays one day's events out in a [windowStart, windowEnd) minute window. Events that overlap in
 * time are placed side by side (greedy column assignment per overlapping cluster).
 */
export function layoutDay<T extends DiaryEvent>(
  events: T[],
  day: string,
  windowStart: number,
  windowEnd: number,
  minHeight = 20
): PlacedEvent<T>[] {
  const items = events
    .map((event) => {
      const s = minutesOnDay(event.start, day, "start")
      const e = Math.max(minutesOnDay(event.end, day, "end"), s + 1)
      return { event, s, e }
    })
    .filter((x) => x.e > windowStart && x.s < windowEnd && x.s < 1440)
    .sort((a, b) => a.s - b.s || b.e - a.e)

  const placed: PlacedEvent<T>[] = []
  let cluster: { item: (typeof items)[number]; column: number }[] = []
  let clusterEnd = -1
  let colEnds: number[] = []

  const flush = () => {
    const columns = Math.max(1, colEnds.length)
    for (const { item, column } of cluster) {
      const s = Math.max(item.s, windowStart)
      const e = Math.min(item.e, windowEnd)
      placed.push({ event: item.event, top: s - windowStart, height: Math.max(e - s, minHeight), column, columns })
    }
    cluster = []
    colEnds = []
    clusterEnd = -1
  }

  for (const item of items) {
    if (cluster.length > 0 && item.s >= clusterEnd) flush()
    let column = colEnds.findIndex((end) => end <= item.s)
    if (column === -1) {
      column = colEnds.length
      colEnds.push(item.e)
    } else {
      colEnds[column] = item.e
    }
    cluster.push({ item, column })
    clusterEnd = Math.max(clusterEnd, item.e)
  }
  flush()
  return placed
}

export interface HourWindow {
  /** inclusive start hour (0-23) */
  startHour: number
  /** exclusive end hour (1-24) */
  endHour: number
}

/**
 * The hours the grid shows: the earliest opening to the latest closing across the week, widened
 * to include any booking/block outside those hours so nothing is ever hidden.
 */
export function hourWindow(openingHours: OpeningHours | null, extraMinutes: { start: number; end: number }[] = []): HourWindow {
  let start = 8 * 60
  let end = 18 * 60
  if (openingHours) {
    const opens = DAY_ORDER.map((d: DayKey) => openingHours[d]).filter((d) => d?.open && d.from && d.to)
    if (opens.length > 0) {
      start = Math.min(...opens.map((d) => toMinutes(d.from)))
      end = Math.max(...opens.map((d) => toMinutes(d.to)))
    }
  }
  for (const x of extraMinutes) {
    start = Math.min(start, x.start)
    end = Math.max(end, x.end)
  }
  return { startHour: Math.max(0, Math.floor(start / 60)), endHour: Math.min(24, Math.ceil(end / 60)) }
}

/** Minute ranges inside the window that fall outside opening hours on `day` (to shade as "closed"). */
export function closedRanges(openingHours: OpeningHours | null, day: string, windowStart: number, windowEnd: number): { top: number; height: number }[] {
  if (!openingHours) return []
  const d = openingHours[DAY_ORDER[(weekdayOf(day) + 6) % 7]]
  if (!d?.open || !d.from || !d.to) return [{ top: 0, height: windowEnd - windowStart }]
  const open = Math.max(toMinutes(d.from), windowStart)
  const close = Math.min(toMinutes(d.to), windowEnd)
  const out: { top: number; height: number }[] = []
  if (open > windowStart) out.push({ top: 0, height: open - windowStart })
  if (close < windowEnd) out.push({ top: close - windowStart, height: windowEnd - close })
  return out
}

/** Snap a pixel/minute offset to the nearest slot (default 30 min), returning "HH:mm". */
export function snapToTime(minutesFromMidnight: number, slot = 30): string {
  const snapped = Math.min(1440 - slot, Math.max(0, Math.floor(minutesFromMidnight / slot) * slot))
  return `${String(Math.floor(snapped / 60)).padStart(2, "0")}:${String(snapped % 60).padStart(2, "0")}`
}

// ───────────────────────────── month view ─────────────────────────────

export interface MonthGrid {
  /** "YYYY-MM" of the month being shown. */
  month: string
  /** Six Monday-first weeks, always — the same height every month, and exactly the diary API's 42-day limit. */
  weeks: string[][]
  from: string
  to: string
}

/** The six-week grid for the month containing a civil date (leading/trailing days belong to neighbouring months). */
export function monthGrid(dateStr: string): MonthGrid {
  const first = `${dateStr.slice(0, 7)}-01`
  const start = startOfWeek(first)
  const weeks = Array.from({ length: 6 }, (_, w) => Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d)))
  return { month: dateStr.slice(0, 7), weeks, from: weeks[0][0], to: weeks[5][6] }
}

export const isInMonth = (day: string, month: string) => day.startsWith(month)

/** Group events by the London day they start on (events outside `days` are dropped). */
export function groupByDay<T extends { start: Date }>(events: T[], days: string[]): Map<string, T[]> {
  const map = new Map<string, T[]>(days.map((d) => [d, []]))
  for (const e of events) map.get(londonDateString(e.start))?.push(e)
  for (const list of map.values()) list.sort((a, b) => a.start.getTime() - b.start.getTime())
  return map
}

// ───────────────────────────── drag and drop ─────────────────────────────

/** Where a drop landed: a pointer offset down a day column → the snapped "HH:mm" slot it represents. */
export function dropSlot(offsetY: number, pxPerMin: number, windowStartMinutes: number, slot = 30): string {
  return snapToTime(windowStartMinutes + Math.max(0, offsetY) / pxPerMin, slot)
}

/**
 * The instant for "keep this booking's London wall-clock time, but on another day". Done on wall-clock time so a
 * 09:00 booking stays at 09:00 across the clock changes (a plain +N×24h would drift an hour).
 */
export function sameTimeOnDay(original: Date, targetDay: string): Date {
  const p = londonParts(original)
  return londonWallToUtc(targetDay, `${String(p.hour).padStart(2, "0")}:${String(p.minute).padStart(2, "0")}`)
}

/** The London days (out of `days`) that any time-off block touches. A block ending exactly at midnight doesn't touch the next day. */
export function blockedDays(blocks: { start: Date; end: Date }[], days: string[]): Set<string> {
  const out = new Set<string>()
  for (const day of days) {
    const from = startOfLondonDay(day).getTime()
    const to = startOfLondonDay(addDays(day, 1)).getTime()
    if (blocks.some((b) => b.start.getTime() < to && b.end.getTime() > from)) out.add(day)
  }
  return out
}
