import type { BookingStatus } from "@/types"

export const BOOKING_STATUSES: BookingStatus[] = [
  "PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW",
]
export const ACTIVE_STATUSES: BookingStatus[] = ["PENDING", "CONFIRMED", "IN_PROGRESS"]
export const DEFAULT_DURATION_MINS = 60

export type Actor = "GARAGE" | "OWNER"
export type DisplayStatus = BookingStatus | "AWAITING_OUTCOME"

export const STATUS_LABELS: Record<DisplayStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  IN_PROGRESS: "In progress",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
  NO_SHOW: "No show",
  AWAITING_OUTCOME: "Awaiting outcome",
}

const GARAGE_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED", "NO_SHOW"],
  // CONFIRMED -> COMPLETED stays legal: it is how a quick job is closed in one step.
  CONFIRMED: ["IN_PROGRESS", "COMPLETED", "CANCELLED", "NO_SHOW"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: ["PENDING"], // reinstate
  NO_SHOW: [],
}

const OWNER_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  PENDING: ["CANCELLED"],
  CONFIRMED: ["CANCELLED"],
}

export type TransitionResult =
  | { ok: true }
  | { ok: false; code: "INVALID_TRANSITION" | "TOO_EARLY"; message: string }

export function isBookingStatus(s: unknown): s is BookingStatus {
  return typeof s === "string" && (BOOKING_STATUSES as string[]).includes(s)
}

export function canTransition(
  from: string,
  to: BookingStatus,
  actor: Actor,
  scheduledAt: Date,
  now: Date = new Date()
): TransitionResult {
  if (!isBookingStatus(from)) {
    return { ok: false, code: "INVALID_TRANSITION", message: `Unknown current status ${from}` }
  }
  if (from === to) {
    return { ok: false, code: "INVALID_TRANSITION", message: `Booking is already ${STATUS_LABELS[to].toLowerCase()}` }
  }
  const allowed = (actor === "GARAGE" ? GARAGE_TRANSITIONS[from] : OWNER_TRANSITIONS[from]) ?? []
  if (!allowed.includes(to)) {
    return {
      ok: false,
      code: "INVALID_TRANSITION",
      message: `A ${STATUS_LABELS[from].toLowerCase()} booking cannot be changed to ${STATUS_LABELS[to].toLowerCase()}`,
    }
  }
  if (to === "NO_SHOW" && scheduledAt.getTime() > now.getTime()) {
    return { ok: false, code: "TOO_EARLY", message: "A booking can only be marked no-show once its start time has passed" }
  }
  return { ok: true }
}

export function bookingEnd(scheduledAt: Date, durationMins?: number | null): Date {
  return new Date(scheduledAt.getTime() + (durationMins ?? DEFAULT_DURATION_MINS) * 60000)
}

/** PENDING/CONFIRMED bookings whose slot has passed still need an outcome (attended / no-show). */
export function displayStatus(
  b: { status: string; scheduledAt: Date; durationMins?: number | null },
  now: Date = new Date()
): DisplayStatus {
  const status = isBookingStatus(b.status) ? b.status : "PENDING"
  if ((status === "PENDING" || status === "CONFIRMED") && bookingEnd(b.scheduledAt, b.durationMins) < now) {
    return "AWAITING_OUTCOME"
  }
  return status
}

/** Attended = the customer turned up: completed or currently being worked on. */
export function isAttended(status: string): boolean {
  return status === "COMPLETED" || status === "IN_PROGRESS"
}
