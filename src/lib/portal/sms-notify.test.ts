import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { createBooking, rescheduleBooking, transitionBooking } from "@/lib/portal/booking-service"
import { inQuietHours, MAX_SMS_PER_BOOKING, notifyCustomerSms, smsText } from "@/lib/portal/sms-notify"
import { sendDueSmsReminders } from "@/lib/portal/reminders"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

const sendSms = vi.hoisted(() => vi.fn())
vi.mock("@/lib/sms", () => ({ sendSms }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn(async () => ({ success: true })) }))

const PREFIX = "smsnotify-"
const HOUR = 3_600_000
const DAY = 24 * HOUR
const on = JSON.stringify({ notifications: { smsCustomer: true } })
const noon = new Date("2026-10-10T11:00:00Z") // 12:00 BST: not quiet

beforeEach(async () => {
  sendSms.mockReset().mockResolvedValue({ success: true })
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function setup(opts: { garageOn?: boolean; optIn?: boolean; phone?: string | null; startInHours?: number } = {}) {
  const { garage } = await makeGarage(PREFIX, { portalSettings: opts.garageOn === false ? null : on })
  const booking = await createBooking({
    garageId: garage.id, source: "DIRECT", customerName: "Sam", customerPhone: opts.phone === undefined ? "07700 900123" : opts.phone, vrm: "AB12CDE",
    serviceType: "MOT", scheduledAt: new Date(noon.getTime() + (opts.startInHours ?? 5) * HOUR), totalPrice: 50, notify: false,
  } as any)
  if (opts.optIn !== false) await prisma.booking.update({ where: { id: booking.id }, data: { smsOptIn: true } })
  return { garage, booking }
}

describe("inQuietHours (Europe/London)", () => {
  it("is quiet from 21:00 to 08:00 local time, across daylight saving", () => {
    expect(inQuietHours(new Date("2026-07-01T20:30:00Z"))).toBe(true) // 21:30 BST
    expect(inQuietHours(new Date("2026-12-01T20:30:00Z"))).toBe(false) // 20:30 GMT
    expect(inQuietHours(new Date("2026-12-01T21:30:00Z"))).toBe(true)
    expect(inQuietHours(new Date("2026-07-01T06:59:00Z"))).toBe(true) // 07:59 BST
    expect(inQuietHours(new Date("2026-07-01T07:00:00Z"))).toBe(false) // 08:00 BST
  })
})

describe("smsText", () => {
  const ctx = { garage: "Acme Motors", garagePhone: "01234 567890", service: "MOT Test", when: "Sat 10 Oct, 14:00", link: "https://qmg.test/booking/abc" }
  it("keeps each message short and includes the manage link where there is one", () => {
    for (const kind of ["REMINDER", "CONFIRMED", "RESCHEDULED", "CANCELLED"] as const) expect(smsText(kind, ctx).length).toBeLessThanOrEqual(160)
    expect(smsText("REMINDER", ctx)).toContain("https://qmg.test/booking/abc")
    expect(smsText("CANCELLED", ctx)).toContain("01234 567890")
  })
})

describe("notifyCustomerSms", () => {
  it("texts an opted-in customer of a garage that has texting on, and records it", async () => {
    const { booking } = await setup()
    expect(await notifyCustomerSms(booking.id, "CONFIRMED", noon)).toBe("sent")
    expect(sendSms).toHaveBeenCalledWith({ to: "+447700900123", body: expect.stringContaining("has confirmed your") })
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, type: "SMS" } })).toBe(1)
  })

  it("never texts without consent, with the garage switch off, or without a mobile", async () => {
    const noConsent = await setup({ optIn: false })
    expect(await notifyCustomerSms(noConsent.booking.id, "CONFIRMED", noon)).toBe("skipped:no-consent")
    const garageOff = await setup({ garageOn: false })
    expect(await notifyCustomerSms(garageOff.booking.id, "CONFIRMED", noon)).toBe("skipped:garage-off")
    const landline = await setup({ phone: "01632 960001" })
    expect(await notifyCustomerSms(landline.booking.id, "CONFIRMED", noon)).toBe("skipped:no-mobile")
    expect(sendSms).not.toHaveBeenCalled()
  })

  it("uses an account holder's own consent and phone", async () => {
    const { garage } = await makeGarage(PREFIX, { key: "acct", portalSettings: on })
    const { user, vehicle } = await makeOwner(PREFIX)
    await prisma.user.update({ where: { id: user.id }, data: { smsOptIn: true, phone: "07700 900456" } })
    const booking = await createBooking({ garageId: garage.id, source: "MARKETPLACE", ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(noon.getTime() + 5 * HOUR), totalPrice: 40, notify: false } as any)
    expect(await notifyCustomerSms(booking.id, "CONFIRMED", noon)).toBe("sent")
    expect(sendSms.mock.calls[0][0].to).toBe("+447700900456")
  })

  it("holds reminders overnight but still sends other updates", async () => {
    const { booking } = await setup()
    const night = new Date("2026-10-10T22:30:00Z") // 23:30 BST
    expect(await notifyCustomerSms(booking.id, "REMINDER", night)).toBe("skipped:quiet-hours")
    expect(await notifyCustomerSms(booking.id, "CANCELLED", night)).toBe("sent")
  })

  it("stops after the per-booking cap", async () => {
    const { booking } = await setup()
    for (let i = 0; i < MAX_SMS_PER_BOOKING; i++) expect(await notifyCustomerSms(booking.id, "RESCHEDULED", noon)).toBe("sent")
    expect(await notifyCustomerSms(booking.id, "RESCHEDULED", noon)).toBe("skipped:cap")
    expect(sendSms).toHaveBeenCalledTimes(MAX_SMS_PER_BOOKING)
  })

  it("reports a provider failure without throwing, and logs it", async () => {
    const { booking } = await setup()
    sendSms.mockResolvedValueOnce({ success: false, error: "Invalid number" })
    expect(await notifyCustomerSms(booking.id, "CONFIRMED", noon)).toBe("failed")
    expect((await prisma.bookingEvent.findFirstOrThrow({ where: { bookingId: booking.id, type: "SMS" } })).detail).toContain("FAILED")
  })

  it("does nothing when no SMS provider is configured (dev/CI)", async () => {
    const { booking } = await setup()
    sendSms.mockResolvedValueOnce({ success: false, skipped: true })
    expect(await notifyCustomerSms(booking.id, "CONFIRMED", noon)).toBe("skipped:no-provider")
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, type: "SMS" } })).toBe(0)
  })
})

describe("booking changes by the garage text the customer", () => {
  it("texts on confirm, reschedule and cancel", async () => {
    const { garage, booking } = await setup({ startInHours: 72 })
    await transitionBooking({ bookingId: booking.id, to: "CONFIRMED", actor: { role: "GARAGE", garageId: garage.id } })
    await rescheduleBooking({ bookingId: booking.id, garageId: garage.id, scheduledAt: new Date(booking.scheduledAt.getTime() + DAY), allowOverlap: true })
    await transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor: { role: "GARAGE", garageId: garage.id } })
    expect(sendSms).toHaveBeenCalledTimes(3)
    expect(sendSms.mock.calls.map((c) => c[0].body).join("|")).toMatch(/confirmed.*moved.*cancelled/i)
  })

  it("doesn't text a customer about a cancellation they made themselves", async () => {
    const { booking } = await setup({ startInHours: 72 })
    await transitionBooking({ bookingId: booking.id, to: "CANCELLED", actor: { role: "OWNER", viaToken: true } })
    expect(sendSms).not.toHaveBeenCalled()
  })
})

describe("sendDueSmsReminders", () => {
  it("texts due bookings once, and holds back reminders during quiet hours until the next run", async () => {
    const { booking } = await setup({ startInHours: 5 })
    await setup({ startInHours: 6 })

    expect(await sendDueSmsReminders(noon)).toMatchObject({ sent: 2 })
    expect(await sendDueSmsReminders(noon)).toEqual({ sent: 0, deferred: 0, skipped: 0 })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).smsReminderSentAt).not.toBeNull()
  })

  it("defers during quiet hours and releases the claim so the next run retries", async () => {
    const night = new Date("2026-10-10T22:30:00Z")
    const { booking } = await setup({ startInHours: 0 })
    await prisma.booking.update({ where: { id: booking.id }, data: { scheduledAt: new Date(night.getTime() + 20 * HOUR) } })
    expect(await sendDueSmsReminders(night)).toEqual({ sent: 0, deferred: 1, skipped: 0 })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: booking.id } })).smsReminderSentAt).toBeNull()
    // Next morning (09:00 BST) it goes out.
    expect(await sendDueSmsReminders(new Date("2026-10-11T08:00:00Z"))).toMatchObject({ sent: 1 })
  })

  it("skips (and doesn't rescan) bookings that can't be texted", async () => {
    const landline = await setup({ phone: "01632 960001" })
    expect(await sendDueSmsReminders(noon)).toMatchObject({ sent: 0, skipped: 1 })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: landline.booking.id } })).smsReminderSentAt).not.toBeNull()
  })
})

describe("notifyCustomerSms — plan gating", () => {
  afterEach(() => {
    delete process.env.PLANS_ENFORCED
  })

  it("doesn't text for a garage whose plan excludes texting, but does once it subscribes", async () => {
    process.env.PLANS_ENFORCED = "true"
    const { garage, booking } = await setup()
    expect(await notifyCustomerSms(booking.id, "CONFIRMED", noon)).toBe("skipped:garage-off")
    expect(sendSms).not.toHaveBeenCalled()

    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PRO", subscriptionStatus: "active" } })
    expect(await notifyCustomerSms(booking.id, "CONFIRMED", noon)).toBe("sent")
  })
})
