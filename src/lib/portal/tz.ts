// Europe/London civil-date helpers. All portal "today"/range logic goes through here so it
// is independent of the server's (UTC) or developer's local timezone, and DST-correct.
// A "civil date" is a plain "YYYY-MM-DD" string (a London calendar day).

export const LONDON = "Europe/London"

const partsFormat = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
})

export function londonParts(d: Date) {
  const o: Record<string, number> = {}
  for (const p of partsFormat.formatToParts(d)) {
    if (p.type !== "literal") o[p.type] = Number(p.value)
  }
  return { year: o.year, month: o.month, day: o.day, hour: o.hour % 24, minute: o.minute, second: o.second }
}

/** Minutes London is ahead of UTC at the given instant (0 in winter, 60 in summer). */
export function londonOffsetMinutes(d: Date): number {
  const p = londonParts(d)
  const asIfUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second)
  return Math.round((asIfUtc - Math.floor(d.getTime() / 1000) * 1000) / 60000)
}

const pad = (n: number) => String(n).padStart(2, "0")

export function londonDateString(d: Date): string {
  const p = londonParts(d)
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`
}

export function londonTimeString(d: Date): string {
  const p = londonParts(d)
  return `${pad(p.hour)}:${pad(p.minute)}`
}

export function todayLondon(now: Date = new Date()): string {
  return londonDateString(now)
}

export function isValidDateString(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split("-").map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

/** Pure civil-calendar arithmetic (no timezone involved). */
export function addDays(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10)
}

/** Adds calendar months, clamping the day (31 Jan + 1 month = 28/29 Feb). */
export function addMonths(dateStr: string, n: number): string {
  const [y, m, d] = dateStr.split("-").map(Number)
  const target = new Date(Date.UTC(y, m - 1 + n, 1))
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate()
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(Math.min(d, lastDay))}`
}

export function diffDays(from: string, to: string): number {
  const [y1, m1, d1] = from.split("-").map(Number)
  const [y2, m2, d2] = to.split("-").map(Number)
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000)
}

/** 0 = Sunday … 6 = Saturday, for a civil date. */
export function weekdayOf(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/** The instant at which the given London wall-clock time occurs. */
export function londonWallToUtc(dateStr: string, hhmm = "00:00"): Date {
  const [y, m, d] = dateStr.split("-").map(Number)
  const [hh, mm] = hhmm.split(":").map(Number)
  const guess = Date.UTC(y, m - 1, d, hh, mm)
  const off = londonOffsetMinutes(new Date(guess))
  let ts = guess - off * 60000
  const off2 = londonOffsetMinutes(new Date(ts))
  if (off2 !== off) ts = guess - off2 * 60000 // landed across a DST change
  return new Date(ts)
}

export function startOfLondonDay(dateStr: string): Date {
  return londonWallToUtc(dateStr, "00:00")
}

/** Inclusive civil dates → half-open UTC interval [gte, lt). */
export function londonDayRange(from: string, to: string): { gte: Date; lt: Date } {
  return { gte: startOfLondonDay(from), lt: startOfLondonDay(addDays(to, 1)) }
}

const dateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, day: "numeric", month: "short", year: "numeric" })
const dateTimeFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: LONDON, day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
})
const timeFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
const longDateFmt = new Intl.DateTimeFormat("en-GB", { timeZone: LONDON, weekday: "long", day: "numeric", month: "long", year: "numeric" })

export const formatLondonDate = (d: Date | string) => dateFmt.format(new Date(d))
export const formatLondonDateTime = (d: Date | string) => dateTimeFmt.format(new Date(d))
export const formatLondonTime = (d: Date | string) => timeFmt.format(new Date(d))
export const formatLondonLongDate = (d: Date | string) => longDateFmt.format(new Date(d))
/** Formats a civil "YYYY-MM-DD" string like "3 Oct 2026". */
export const formatCivilDate = (dateStr: string) => dateFmt.format(londonWallToUtc(dateStr, "12:00"))
