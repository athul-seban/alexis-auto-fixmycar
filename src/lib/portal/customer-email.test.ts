import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { emailCustomerAboutBooking } from "@/lib/portal/customer-email"
import { transitionBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mail = vi.mocked(sendMail)
const PREFIX = "custmail-"
const email = `${PREFIX}c@example.com`

beforeEach(async () => {
  mail.mockClear()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("emailCustomerAboutBooking", () => {
  it("emails the customer, logs it, and carries the manage link", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await makeWalkInBooking(garage.id, { customerEmail: email, manageToken: "m".repeat(32) })
    expect(await emailCustomerAboutBooking(b.id, "CONFIRMED")).toBe(true)
    expect(mail.mock.calls[0][0].to).toBe(email)
    expect(mail.mock.calls[0][0].html).toContain(`/booking/${"m".repeat(32)}`)
    expect(await prisma.bookingEvent.count({ where: { bookingId: b.id, type: "EMAIL" } })).toBe(1)
  })

  it("does nothing without an address or when the garage switched customer emails off", async () => {
    const on = await makeGarage(PREFIX, { key: "on" })
    const off = await makeGarage(PREFIX, { key: "off", portalSettings: JSON.stringify({ notifications: { customerEmails: false } }) })
    const noAddress = await makeWalkInBooking(on.garage.id, { customerEmail: null })
    const switchedOff = await makeWalkInBooking(off.garage.id, { customerEmail: email })
    expect(await emailCustomerAboutBooking(noAddress.id, "CONFIRMED")).toBe(false)
    expect(await emailCustomerAboutBooking(switchedOff.id, "CANCELLED")).toBe(false)
    expect(mail).not.toHaveBeenCalled()
  })

  it("never throws when sending fails", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await makeWalkInBooking(garage.id, { customerEmail: email })
    mail.mockResolvedValueOnce({ success: false })
    expect(await emailCustomerAboutBooking(b.id, "RESCHEDULED", { previousScheduledAt: new Date() })).toBe(false)
  })
})

describe("transitionBooking sends the customer email", () => {
  it("when a garage confirms or cancels, and when the customer cancels", async () => {
    const { garage } = await makeGarage(PREFIX)
    const pending = await makeWalkInBooking(garage.id, { status: "PENDING", customerEmail: email })
    await transitionBooking({ bookingId: pending.id, to: "CONFIRMED", actor: { role: "GARAGE", garageId: garage.id } })
    expect(mail.mock.calls.at(-1)![0].subject).toMatch(/confirmed/i)

    await transitionBooking({ bookingId: pending.id, to: "CANCELLED", actor: { role: "GARAGE", garageId: garage.id }, cancelReason: "Parts delay" })
    expect(mail.mock.calls.at(-1)![0].subject).toMatch(/cancelled/i)
    expect(mail.mock.calls.at(-1)![0].html).toContain("Parts delay")

    const mine = await makeWalkInBooking(garage.id, { customerEmail: email, manageToken: "t".repeat(32) })
    mail.mockClear()
    await transitionBooking({ bookingId: mine.id, to: "CANCELLED", actor: { role: "OWNER", viaToken: true } as never })
    expect(mail.mock.calls[0][0].subject).toMatch(/you cancelled/i)
  })
})
