import { displayStatus, isAttended } from "@/lib/portal/booking-status"
import { londonDayRange, todayLondon } from "@/lib/portal/tz"

// KPI definitions (also surfaced in the dashboard UI):
//  - "Created"  counts bookings by createdAt.
//  - "Attended" and FIV count bookings by scheduledAt. Attended = COMPLETED or IN_PROGRESS.
//  - FIV (final invoice value) = sum over COMPLETED of finalInvoiceValue ?? totalPrice.
//  - No-show rate = NO_SHOW / (attended + NO_SHOW), all sources.
//  - Marketplace = MARKETPLACE | QUOTE | JOB_REQUEST; Widget = WIDGET; DIRECT is reported separately.

export const MARKETPLACE_SOURCES = ["MARKETPLACE", "QUOTE", "JOB_REQUEST"]
export type Channel = "marketplace" | "widget" | "direct"

export interface KpiRow {
  source: string
  status: string
  scheduledAt: Date
  createdAt: Date
  durationMins?: number | null
  totalPrice: number
  finalInvoiceValue?: number | null
}

export interface ChannelKpis {
  created: number
  attended: number
  fiv: number
}

export interface Kpis {
  marketplace: ChannelKpis
  widget: ChannelKpis
  direct: ChannelKpis
  noShow: number
  attended: number
  noShowRate: number | null
}

export function channelOf(source: string): Channel {
  if (source === "WIDGET") return "widget"
  if (source === "DIRECT") return "direct"
  return "marketplace" // MARKETPLACE | QUOTE | JOB_REQUEST (and any legacy/unknown value)
}

export const invoiceValue = (r: Pick<KpiRow, "totalPrice" | "finalInvoiceValue">) =>
  r.finalInvoiceValue ?? r.totalPrice

const round2 = (n: number) => Math.round(n * 100) / 100
const within = (d: Date, r: { gte: Date; lt: Date }) => d >= r.gte && d < r.lt

export function computeKpis(rows: KpiRow[], range: { gte: Date; lt: Date }): Kpis {
  const out: Kpis = {
    marketplace: { created: 0, attended: 0, fiv: 0 },
    widget: { created: 0, attended: 0, fiv: 0 },
    direct: { created: 0, attended: 0, fiv: 0 },
    noShow: 0,
    attended: 0,
    noShowRate: null,
  }

  for (const r of rows) {
    const ch = out[channelOf(r.source)]
    if (within(r.createdAt, range)) ch.created += 1
    if (within(r.scheduledAt, range)) {
      if (isAttended(r.status)) {
        ch.attended += 1
        out.attended += 1
      }
      if (r.status === "COMPLETED") ch.fiv += invoiceValue(r)
      if (r.status === "NO_SHOW") out.noShow += 1
    }
  }

  out.marketplace.fiv = round2(out.marketplace.fiv)
  out.widget.fiv = round2(out.widget.fiv)
  out.direct.fiv = round2(out.direct.fiv)
  const denom = out.attended + out.noShow
  out.noShowRate = denom === 0 ? null : Math.round((out.noShow / denom) * 1000) / 10
  return out
}

export interface TodayCounts {
  dueToday: number
  createdToday: number
  needsOutcome: number
}

export function computeToday(rows: KpiRow[], now: Date = new Date()): TodayCounts {
  const today = todayLondon(now)
  const range = londonDayRange(today, today)
  let dueToday = 0
  let createdToday = 0
  let needsOutcome = 0
  for (const r of rows) {
    if (within(r.createdAt, range)) createdToday += 1
    if (within(r.scheduledAt, range) && r.status !== "CANCELLED" && r.status !== "NO_SHOW") dueToday += 1
    if (displayStatus(r, now) === "AWAITING_OUTCOME") needsOutcome += 1
  }
  return { dueToday, createdToday, needsOutcome }
}
