import {
  addDays,
  addMonths,
  diffDays,
  isValidDateString,
  londonDayRange,
  todayLondon,
} from "@/lib/portal/tz"

export type RangePreset = "14d" | "3m" | "ytd" | "lastYear"

export interface CivilRange {
  from: string // inclusive "YYYY-MM-DD" (London)
  to: string // inclusive "YYYY-MM-DD" (London)
}

export const MAX_RANGE_DAYS = 800

export function presetRange(preset: RangePreset, now: Date = new Date()): CivilRange {
  const today = todayLondon(now)
  const year = Number(today.slice(0, 4))
  switch (preset) {
    case "14d":
      return { from: addDays(today, -13), to: today }
    case "3m":
      return { from: addMonths(today, -3), to: today }
    case "ytd":
      return { from: `${year}-01-01`, to: today }
    case "lastYear":
      return { from: `${year - 1}-01-01`, to: `${year - 1}-12-31` }
  }
}

export function presetLabel(preset: RangePreset, now: Date = new Date()): string {
  const year = Number(todayLondon(now).slice(0, 4))
  switch (preset) {
    case "14d":
      return "14 Days"
    case "3m":
      return "3 Months"
    case "ytd":
      return "YTD"
    case "lastYear":
      return String(year - 1)
  }
}

export const RANGE_PRESETS: RangePreset[] = ["14d", "3m", "ytd", "lastYear"]

/** Which preset (if any) a range corresponds to — used to highlight the active chip. */
export function matchPreset(range: CivilRange, now: Date = new Date()): RangePreset | null {
  return RANGE_PRESETS.find((p) => {
    const r = presetRange(p, now)
    return r.from === range.from && r.to === range.to
  }) ?? null
}

export type ParsedRange = { ok: true; range: CivilRange } | { ok: false; error: string }

/** Validates from/to query params, defaulting to the last 14 days. */
export function parseCivilRange(
  from: string | null | undefined,
  to: string | null | undefined,
  now: Date = new Date()
): ParsedRange {
  if (!from && !to) return { ok: true, range: presetRange("14d", now) }
  if (!isValidDateString(from) || !isValidDateString(to)) {
    return { ok: false, error: "from and to must both be valid YYYY-MM-DD dates" }
  }
  if (from > to) return { ok: false, error: "from must not be after to" }
  if (diffDays(from, to) > MAX_RANGE_DAYS) {
    return { ok: false, error: `Date range cannot exceed ${MAX_RANGE_DAYS} days` }
  }
  return { ok: true, range: { from, to } }
}

export function rangeToUtc(range: CivilRange): { gte: Date; lt: Date } {
  return londonDayRange(range.from, range.to)
}
