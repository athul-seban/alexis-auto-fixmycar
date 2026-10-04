import type { OpeningHours } from "@/types"
import { DEFAULT_DURATION_MINS } from "@/lib/portal/booking-status"
import { diffDays, londonWallToUtc, todayLondon, weekdayOf } from "@/lib/portal/tz"

export interface BusyInterval {
  start: Date
  end: Date
  /** Booking's technician, or a block's technician. A block with no technician closes the whole garage. */
  technicianId?: string | null
}

export const overlaps = (aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) =>
  aStart < bEnd && bStart < aEnd

/** A booking's busy interval; legacy rows without a duration count as 60 minutes. */
export function bookingInterval(b: { scheduledAt: Date; durationMins?: number | null; technicianId?: string | null }): BusyInterval {
  return {
    start: b.scheduledAt,
    end: new Date(b.scheduledAt.getTime() + (b.durationMins ?? DEFAULT_DURATION_MINS) * 60000),
    technicianId: b.technicianId ?? null,
  }
}

/** Number of concurrent jobs the garage can run: its bay override, else active technicians (min 1). */
export function garageCapacity(activeTechnicians: number, bays?: number | null): number {
  return Math.max(1, bays ?? activeTechnicians)
}

/**
 * Can another job start at [start, end)? Garage-wide blocks close it completely; technician
 * blocks each remove one unit of capacity.
 */
export function hasCapacity(
  start: Date,
  end: Date,
  capacity: number,
  bookings: BusyInterval[],
  blocks: BusyInterval[]
): boolean {
  const overlappingBlocks = blocks.filter((b) => overlaps(start, end, b.start, b.end))
  if (overlappingBlocks.some((b) => !b.technicianId)) return false
  const blockedTechs = new Set(overlappingBlocks.map((b) => b.technicianId))
  const concurrent = bookings.filter((b) => overlaps(start, end, b.start, b.end)).length
  return concurrent < capacity - blockedTechs.size
}

const DAY_KEYS: (keyof OpeningHours)[] = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"]

export const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number)
  return h * 60 + m
}

export interface SlotInput {
  date: string // civil London date
  openingHours: OpeningHours | null
  durationMins: number
  slotMins: number
  leadHours: number
  maxDaysAhead: number
  capacity: number
  bookings: BusyInterval[]
  blocks: BusyInterval[]
  now?: Date
}

export interface Slot {
  start: Date
  /** London wall-clock "HH:mm". */
  label: string
}

/**
 * Bookable start times for one London day. Closed days, unset opening hours, days beyond the
 * booking window, slots inside the lead time, and slots without free capacity are excluded.
 */
export function computeSlots(i: SlotInput): Slot[] {
  const now = i.now ?? new Date()
  if (!i.openingHours) return []

  const today = todayLondon(now)
  const daysAhead = diffDays(today, i.date)
  if (daysAhead < 0 || daysAhead > i.maxDaysAhead) return []

  const day = i.openingHours[DAY_KEYS[weekdayOf(i.date)]]
  if (!day?.open) return []

  const openMin = toMinutes(day.from)
  const closeMin = toMinutes(day.to)
  const earliest = now.getTime() + i.leadHours * 3600000
  const slots: Slot[] = []

  for (let m = openMin; m + i.durationMins <= closeMin; m += i.slotMins) {
    const label = `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`
    const start = londonWallToUtc(i.date, label)
    if (start.getTime() < earliest) continue
    const end = new Date(start.getTime() + i.durationMins * 60000)
    if (!hasCapacity(start, end, i.capacity, i.bookings, i.blocks)) continue
    slots.push({ start, label })
  }
  return slots
}

/**
 * True if a job starting at London `startLabel` ("HH:mm") on civil `dateStr` fits inside that
 * day's opening hours. Garage-created bookings only warn on false; unset hours never warn.
 */
export function isWithinOpeningHours(
  openingHours: OpeningHours | null,
  dateStr: string,
  startLabel: string,
  durationMins: number
): boolean {
  if (!openingHours) return true
  const day = openingHours[DAY_KEYS[weekdayOf(dateStr)]]
  if (!day?.open) return false
  const startMin = toMinutes(startLabel)
  return startMin >= toMinutes(day.from) && startMin + durationMins <= toMinutes(day.to)
}
