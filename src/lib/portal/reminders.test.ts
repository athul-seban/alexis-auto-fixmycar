import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { sendDueBookingReminders } from "@/lib/portal/reminders"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const PREFIX = "reminders-"
const HOUR = 3_600_000
const now = new Date("2026-10-10T09:00:00Z")
const at = (hours: number) => new Date(now.getTime() + hours * HOUR)

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

describe("sendDueBookingReminders", () => {
  it("reminds only active, confirmed-time bookings starting in the next 24h, and only once", async () => {
    const { garage } = await makeGarage(PREFIX)
    const email = { customerEmail: `c@${PREFIX}x.com`, manageToken: "a".repeat(32) }
    const due = await makeWalkInBooking(garage.id, { ...email, scheduledAt: at(5), manageToken: "b".repeat(32) })
    const tooFar = await makeWalkInBooking(garage.id, { ...email, scheduledAt: at(30), manageToken: "c".repeat(32) })
    const placeholder = await makeWalkInBooking(garage.id, { ...email, scheduledAt: at(5), timeConfirmed: false, manageToken: "d".repeat(32) })
    const cancelled = await makeWalkInBooking(garage.id, { ...email, scheduledAt: at(5), status: "CANCELLED", manageToken: "e".repeat(32) })
    const noEmail = await makeWalkInBooking(garage.id, { scheduledAt: at(5), customerEmail: null })

    expect(await sendDueBookingReminders(now)).toEqual({ sent: 1, skipped: 0 })
    const flags = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).reminderSentAt !== null
    expect(await flags(due.id)).toBe(true)
    for (const b of [tooFar, placeholder, cancelled, noEmail]) expect(await flags(b.id)).toBe(false)
    expect(await prisma.bookingEvent.count({ where: { bookingId: due.id, type: "REMINDER" } })).toBe(1)

    expect(await sendDueBookingReminders(now)).toEqual({ sent: 0, skipped: 0 })
  })
})
