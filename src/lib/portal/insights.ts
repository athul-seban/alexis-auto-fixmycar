import { isAttended } from "@/lib/portal/booking-status"
import { channelOf, invoiceValue, type Channel, type KpiRow } from "@/lib/portal/kpi"
import { startOfWeek } from "@/lib/portal/diary-layout"
import { addDays, addMonths, diffDays, londonDateString } from "@/lib/portal/tz"
import type { CivilRange } from "@/lib/portal/date-range"

export type Granularity = "day" | "week" | "month"

/** Day buckets up to ~2 months, weekly up to ~1 year, monthly beyond — keeps charts readable. */
export function defaultGranularity(range: CivilRange): Granularity {
  const days = diffDays(range.from, range.to) + 1
  return days <= 62 ? "day" : days <= 400 ? "week" : "month"
}

/** The bucket (its first civil date) a London date falls in. */
export function bucketOf(date: string, g: Granularity): string {
  if (g === "day") return date
  if (g === "week") return startOfWeek(date)
  return `${date.slice(0, 7)}-01`
}

/** Every bucket between from and to, so quiet periods show as zero rather than disappearing. */
export function bucketKeys(range: CivilRange, g: Granularity): string[] {
  const keys: string[] = []
  let cur = bucketOf(range.from, g)
  const last = bucketOf(range.to, g)
  while (cur <= last) {
    keys.push(cur)
    cur = g === "day" ? addDays(cur, 1) : g === "week" ? addDays(cur, 7) : addMonths(cur, 1)
  }
  return keys
}

export interface SeriesPoint {
  bucket: string
  created: number
  attended: number
  noShow: number
  revenue: number
  noShowRate: number | null
}

const inRange = (d: string, r: CivilRange) => d >= r.from && d <= r.to
const round2 = (n: number) => Math.round(n * 100) / 100

export function buildSeries(rows: KpiRow[], range: CivilRange, g: Granularity): SeriesPoint[] {
  const points = new Map<string, SeriesPoint>(
    bucketKeys(range, g).map((bucket) => [bucket, { bucket, created: 0, attended: 0, noShow: 0, revenue: 0, noShowRate: null }])
  )
  for (const r of rows) {
    const made = londonDateString(r.createdAt)
    if (inRange(made, range)) points.get(bucketOf(made, g))!.created += 1

    const due = londonDateString(r.scheduledAt)
    if (!inRange(due, range)) continue
    const p = points.get(bucketOf(due, g))!
    if (isAttended(r.status)) p.attended += 1
    if (r.status === "NO_SHOW") p.noShow += 1
    if (r.status === "COMPLETED") p.revenue += invoiceValue(r)
  }
  for (const p of points.values()) {
    p.revenue = round2(p.revenue)
    const denom = p.attended + p.noShow
    p.noShowRate = denom === 0 ? null : Math.round((p.noShow / denom) * 1000) / 10
  }
  return [...points.values()]
}

export interface Breakdown {
  key: string
  count: number
  revenue: number
}

/** Bookings scheduled in range, grouped by `keyOf`, biggest first. */
export function breakdown(rows: (KpiRow & { serviceType?: string })[], range: CivilRange, keyOf: (r: KpiRow & { serviceType?: string }) => string): Breakdown[] {
  const map = new Map<string, Breakdown>()
  for (const r of rows) {
    if (!inRange(londonDateString(r.scheduledAt), range) || r.status === "CANCELLED") continue
    const key = keyOf(r)
    const b = map.get(key) ?? { key, count: 0, revenue: 0 }
    b.count += 1
    if (r.status === "COMPLETED") b.revenue = round2(b.revenue + invoiceValue(r))
    map.set(key, b)
  }
  return [...map.values()].sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

export const bySource = (rows: KpiRow[], range: CivilRange) => breakdown(rows, range, (r) => r.source)
export const byChannel = (rows: KpiRow[], range: CivilRange): Breakdown[] =>
  breakdown(rows, range, (r) => channelOf(r.source) satisfies Channel)
export const byService = (rows: (KpiRow & { serviceType: string })[], range: CivilRange) =>
  breakdown(rows, range, (r) => r.serviceType ?? "OTHER")

export interface Funnel {
  requests: number
  quoted: number
  booked: number
  /** booked ÷ quoted, as a percentage; null when nothing was quoted. */
  winRate: number | null
}

export function buildFunnel(input: { quoteStatuses: string[]; responseStatuses: string[] }): Funnel {
  const quotedQuotes = input.quoteStatuses.filter((s) => s !== "PENDING" && s !== "REJECTED")
  const requests = input.quoteStatuses.length + input.responseStatuses.length
  const quoted = quotedQuotes.length + input.responseStatuses.length
  const booked = input.quoteStatuses.filter((s) => s === "ACCEPTED").length + input.responseStatuses.filter((s) => s === "ACCEPTED").length
  return { requests, quoted, booked, winRate: quoted === 0 ? null : Math.round((booked / quoted) * 1000) / 10 }
}
