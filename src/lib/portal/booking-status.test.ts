import { describe, it, expect } from "vitest"
import {
  canTransition,
  displayStatus,
  isAttended,
  bookingEnd,
  BOOKING_STATUSES,
} from "@/lib/portal/booking-status"

const NOW = new Date("2026-10-03T12:00:00Z")
const PAST = new Date("2026-10-01T10:00:00Z")
const FUTURE = new Date("2026-10-10T10:00:00Z")

describe("canTransition — garage", () => {
  it("allows the normal lifecycle", () => {
    expect(canTransition("PENDING", "CONFIRMED", "GARAGE", FUTURE, NOW).ok).toBe(true)
    expect(canTransition("CONFIRMED", "IN_PROGRESS", "GARAGE", PAST, NOW).ok).toBe(true)
    expect(canTransition("IN_PROGRESS", "COMPLETED", "GARAGE", PAST, NOW).ok).toBe(true)
  })

  it("keeps CONFIRMED -> COMPLETED legal (legacy tests rely on it)", () => {
    expect(canTransition("CONFIRMED", "COMPLETED", "GARAGE", FUTURE, NOW).ok).toBe(true)
  })

  it("treats COMPLETED and NO_SHOW as terminal", () => {
    for (const to of BOOKING_STATUSES) {
      expect(canTransition("COMPLETED", to, "GARAGE", PAST, NOW).ok).toBe(false)
      expect(canTransition("NO_SHOW", to, "GARAGE", PAST, NOW).ok).toBe(false)
    }
  })

  it("lets a cancelled booking be reinstated to PENDING only", () => {
    expect(canTransition("CANCELLED", "PENDING", "GARAGE", FUTURE, NOW).ok).toBe(true)
    expect(canTransition("CANCELLED", "COMPLETED", "GARAGE", FUTURE, NOW).ok).toBe(false)
  })

  it("rejects skipping steps and no-op transitions", () => {
    expect(canTransition("PENDING", "COMPLETED", "GARAGE", PAST, NOW).ok).toBe(false)
    expect(canTransition("PENDING", "IN_PROGRESS", "GARAGE", PAST, NOW).ok).toBe(false)
    expect(canTransition("PENDING", "PENDING", "GARAGE", PAST, NOW)).toMatchObject({ ok: false, code: "INVALID_TRANSITION" })
  })

  it("only allows NO_SHOW once the start time has passed", () => {
    expect(canTransition("CONFIRMED", "NO_SHOW", "GARAGE", FUTURE, NOW)).toMatchObject({ ok: false, code: "TOO_EARLY" })
    expect(canTransition("CONFIRMED", "NO_SHOW", "GARAGE", PAST, NOW).ok).toBe(true)
    expect(canTransition("PENDING", "NO_SHOW", "GARAGE", PAST, NOW).ok).toBe(true)
  })

  it("rejects an unknown current status", () => {
    expect(canTransition("WEIRD", "CONFIRMED", "GARAGE", PAST, NOW).ok).toBe(false)
  })
})

describe("canTransition — owner", () => {
  it("may only cancel pending or confirmed bookings", () => {
    expect(canTransition("PENDING", "CANCELLED", "OWNER", FUTURE, NOW).ok).toBe(true)
    expect(canTransition("CONFIRMED", "CANCELLED", "OWNER", FUTURE, NOW).ok).toBe(true)
    expect(canTransition("IN_PROGRESS", "CANCELLED", "OWNER", FUTURE, NOW).ok).toBe(false)
    expect(canTransition("COMPLETED", "CANCELLED", "OWNER", PAST, NOW).ok).toBe(false)
    expect(canTransition("PENDING", "CONFIRMED", "OWNER", FUTURE, NOW).ok).toBe(false)
  })
})

describe("displayStatus", () => {
  it("flags past pending/confirmed bookings as awaiting an outcome", () => {
    expect(displayStatus({ status: "CONFIRMED", scheduledAt: PAST }, NOW)).toBe("AWAITING_OUTCOME")
    expect(displayStatus({ status: "PENDING", scheduledAt: PAST }, NOW)).toBe("AWAITING_OUTCOME")
  })

  it("leaves future and terminal bookings alone", () => {
    expect(displayStatus({ status: "CONFIRMED", scheduledAt: FUTURE }, NOW)).toBe("CONFIRMED")
    expect(displayStatus({ status: "COMPLETED", scheduledAt: PAST }, NOW)).toBe("COMPLETED")
    expect(displayStatus({ status: "NO_SHOW", scheduledAt: PAST }, NOW)).toBe("NO_SHOW")
  })

  it("uses the booking duration, so an in-slot booking is not yet 'awaiting'", () => {
    const start = new Date("2026-10-03T11:30:00Z")
    expect(displayStatus({ status: "CONFIRMED", scheduledAt: start, durationMins: 120 }, NOW)).toBe("CONFIRMED")
    expect(displayStatus({ status: "CONFIRMED", scheduledAt: start, durationMins: 15 }, NOW)).toBe("AWAITING_OUTCOME")
  })
})

describe("helpers", () => {
  it("counts completed and in-progress as attended", () => {
    expect(isAttended("COMPLETED")).toBe(true)
    expect(isAttended("IN_PROGRESS")).toBe(true)
    expect(isAttended("NO_SHOW")).toBe(false)
    expect(isAttended("CONFIRMED")).toBe(false)
  })

  it("defaults duration to 60 minutes", () => {
    expect(bookingEnd(PAST).getTime() - PAST.getTime()).toBe(3600000)
  })
})
