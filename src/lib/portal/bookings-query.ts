import { z } from "zod"
import type { Prisma } from "@prisma/client"
import { SERVICE_TYPES } from "@/lib/constants"
import { BOOKING_STATUSES } from "@/lib/portal/booking-status"
import { normaliseSearchQuery } from "@/lib/portal/search-text"
import { normaliseVrm } from "@/lib/portal/vrm"
import { addDays, isValidDateString, londonDayRange, startOfLondonDay, todayLondon } from "@/lib/portal/tz"

export const PAGE_SIZES = [10, 25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
export const TABS = ["all", "upcoming", "today", "completed", "cancelled"] as const
export const SOURCES = ["MARKETPLACE", "QUOTE", "JOB_REQUEST", "WIDGET", "DIRECT"] as const

export type Tab = (typeof TABS)[number]
export type SortKey = "vrm" | "name" | "vehicle" | "source" | "type" | "status" | "booked" | "created" | "price"

// Whitelist: user-supplied `sort` only ever selects one of these; never interpolated.
const SORT_COLUMNS: Record<SortKey, string[]> = {
  vrm: ["vrm"],
  name: ["customerName"],
  vehicle: ["vehicleMake", "vehicleModel"],
  source: ["source"],
  type: ["serviceType"],
  status: ["status"],
  booked: ["scheduledAt"],
  created: ["createdAt"],
  price: ["totalPrice"],
}
const SORT_KEYS = Object.keys(SORT_COLUMNS) as [SortKey, ...SortKey[]]

// "" and the UI's "all" sentinel both mean "no filter".
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((v) => (v === "" || v === "all" || v === null ? undefined : v), schema.optional())

const dateParam = z.string().refine(isValidDateString, "Expected YYYY-MM-DD")

const schema = z.object({
  tab: optional(z.enum(TABS)),
  q: optional(z.string().max(100)),
  vrm: optional(z.string().max(12)),
  source: optional(z.enum(SOURCES)),
  serviceType: optional(z.enum(SERVICE_TYPES)),
  contacted: optional(z.enum(["yes", "no"])),
  bookedFrom: optional(dateParam),
  bookedTo: optional(dateParam),
  createdFrom: optional(dateParam),
  createdTo: optional(dateParam),
  status: optional(z.enum(BOOKING_STATUSES as [string, ...string[]])),
  technicianId: optional(z.string().max(40)),
  // "pending" = slot has passed but no outcome (attended / no-show / cancelled) recorded. Resolved
  // in the route (it depends on each booking's duration), not in buildBookingsWhere.
  outcome: optional(z.enum(["pending"])),
  sort: optional(z.enum(SORT_KEYS)),
  dir: optional(z.enum(["asc", "desc"])),
  page: optional(z.coerce.number().int().min(1).max(100000)),
  pageSize: optional(z.coerce.number().int().refine((n) => (PAGE_SIZES as readonly number[]).includes(n), "Unsupported page size")),
  format: optional(z.enum(["json", "csv"])),
})

export interface BookingsQuery {
  tab: Tab
  q?: string
  vrm?: string
  source?: (typeof SOURCES)[number]
  serviceType?: (typeof SERVICE_TYPES)[number]
  contacted?: "yes" | "no"
  bookedFrom?: string
  bookedTo?: string
  createdFrom?: string
  createdTo?: string
  status?: string
  technicianId?: string
  outcome?: "pending"
  sort: SortKey
  dir: "asc" | "desc"
  page: number
  pageSize: number
  format: "json" | "csv"
}

export type ParsedBookingsQuery = { ok: true; value: BookingsQuery } | { ok: false; error: string }

/** Soonest-first for forward-looking tabs; newest-first for history; A→Z for text columns. */
export function defaultDir(sort: SortKey, tab: Tab): "asc" | "desc" {
  if (sort === "booked" || sort === "created") return tab === "upcoming" || tab === "today" ? "asc" : "desc"
  if (sort === "price") return "desc"
  return "asc"
}

export function parseBookingsQuery(params: URLSearchParams): ParsedBookingsQuery {
  const raw: Record<string, string | undefined> = {}
  for (const key of Object.keys(schema.shape)) raw[key] = params.get(key) ?? undefined

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return { ok: false, error: `Invalid ${issue.path.join(".") || "query"}: ${issue.message}` }
  }
  const v = parsed.data
  for (const [from, to] of [["bookedFrom", "bookedTo"], ["createdFrom", "createdTo"]] as const) {
    if (v[from] && v[to] && v[from]! > v[to]!) return { ok: false, error: `${from} must not be after ${to}` }
  }

  const tab = v.tab ?? "all"
  const sort = v.sort ?? "booked"
  return {
    ok: true,
    value: {
      tab,
      q: v.q?.trim() || undefined,
      vrm: v.vrm,
      source: v.source,
      serviceType: v.serviceType,
      contacted: v.contacted,
      bookedFrom: v.bookedFrom,
      bookedTo: v.bookedTo,
      createdFrom: v.createdFrom,
      createdTo: v.createdTo,
      status: v.status,
      technicianId: v.technicianId,
      outcome: v.outcome,
      sort,
      dir: v.dir ?? defaultDir(sort, tab),
      page: v.page ?? 1,
      pageSize: v.pageSize ?? DEFAULT_PAGE_SIZE,
      format: v.format ?? "json",
    },
  }
}

export function tabWhere(tab: Tab, now: Date = new Date()): Prisma.BookingWhereInput {
  switch (tab) {
    case "all":
      return {}
    case "upcoming":
      return { scheduledAt: { gte: now }, status: { in: ["PENDING", "CONFIRMED"] } }
    case "today": {
      const today = todayLondon(now)
      return {
        scheduledAt: { gte: startOfLondonDay(today), lt: startOfLondonDay(addDays(today, 1)) },
        status: { notIn: ["CANCELLED"] },
      }
    }
    case "completed":
      return { status: "COMPLETED" }
    case "cancelled":
      return { status: "CANCELLED" }
  }
}

/** Every where-clause is scoped to `garageId` — tenant isolation lives here. */
export function buildBookingsWhere(garageId: string, q: BookingsQuery, now: Date = new Date()): Prisma.BookingWhereInput {
  const and: Prisma.BookingWhereInput[] = [{ garageId }, tabWhere(q.tab, now)]

  if (q.q) {
    const needle = normaliseSearchQuery(q.q)
    // searchText stores the VRM without spaces, so "ab12 cde" must also be tried as "ab12cde".
    const vrmNeedle = /^[a-z0-9]+(\s+[a-z0-9]+)+$/i.test(q.q) ? normaliseVrm(q.q).toLowerCase() : ""
    and.push(
      vrmNeedle && vrmNeedle !== needle
        ? { OR: [{ searchText: { contains: needle } }, { searchText: { contains: vrmNeedle } }] }
        : { searchText: { contains: needle } }
    )
  }
  if (q.vrm) {
    const vrm = normaliseVrm(q.vrm)
    if (vrm) and.push({ vrm: { contains: vrm } })
  }
  if (q.source) and.push({ source: q.source })
  if (q.serviceType) and.push({ serviceType: q.serviceType })
  if (q.contacted === "yes") and.push({ contactedAt: { not: null } })
  if (q.contacted === "no") and.push({ contactedAt: null })
  if (q.status) and.push({ status: q.status })
  if (q.technicianId) and.push({ technicianId: q.technicianId })
  if (q.bookedFrom || q.bookedTo) {
    and.push({ scheduledAt: dateBounds(q.bookedFrom, q.bookedTo) })
  }
  if (q.createdFrom || q.createdTo) {
    and.push({ createdAt: dateBounds(q.createdFrom, q.createdTo) })
  }
  return { AND: and }
}

function dateBounds(from?: string, to?: string): Prisma.DateTimeFilter {
  const f: Prisma.DateTimeFilter = {}
  if (from) f.gte = londonDayRange(from, from).gte
  if (to) f.lt = londonDayRange(to, to).lt
  return f
}

export function buildOrderBy(q: Pick<BookingsQuery, "sort" | "dir">): Prisma.BookingOrderByWithRelationInput[] {
  const order = SORT_COLUMNS[q.sort].map((col) => ({ [col]: q.dir }) as Prisma.BookingOrderByWithRelationInput)
  return [...order, { id: q.dir }] // id tie-break keeps pagination stable
}
