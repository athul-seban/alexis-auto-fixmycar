import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { emailGarage } from "@/lib/portal/garage-email"
import { createBooking, transitionBooking } from "@/lib/portal/booking-service"
import { serializePortalSettings, DEFAULT_PORTAL_SETTINGS } from "@/lib/portal/portal-settings"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

const sendMail = vi.hoisted(() =>
  vi.fn(async (_msg: { to: string; subject: string; html: string }) => ({ success: true }))
)
vi.mock("@/lib/mail", () => ({ sendMail }))

const PREFIX = "garageemailtest-"
const off = (key: "emailNewBooking" | "emailCancellation" | "emailReview") =>
  serializePortalSettings({ ...DEFAULT_PORTAL_SETTINGS, notifications: { ...DEFAULT_PORTAL_SETTINGS.notifications, [key]: false } })

beforeEach(async () => {
  sendMail.mockClear()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("emailGarage", () => {
  it("sends to the garage's email when the toggle is on (the default)", async () => {
    const { garage } = await makeGarage(PREFIX)
    const sent = await emailGarage(garage.id, "emailNewBooking", (g) => ({ subject: `Hi ${g.name}`, html: "<p>x</p>" }))
    expect(sent).toBe(true)
    expect(sendMail).toHaveBeenCalledWith({ to: garage.email, subject: `Hi ${garage.name}`, html: "<p>x</p>" })
  })

  it("sends nothing when that kind of email is switched off", async () => {
    const { garage } = await makeGarage(PREFIX, { portalSettings: off("emailReview") })
    expect(await emailGarage(garage.id, "emailReview", () => ({ subject: "s", html: "h" }))).toBe(false)
    expect(sendMail).not.toHaveBeenCalled()
    // …but other kinds still go out.
    expect(await emailGarage(garage.id, "emailNewBooking", () => ({ subject: "s", html: "h" }))).toBe(true)
  })

  it("never throws, even for an unknown garage or a failing mailer", async () => {
    expect(await emailGarage("nope", "emailNewBooking", () => ({ subject: "s", html: "h" }))).toBe(false)
    const { garage } = await makeGarage(PREFIX)
    sendMail.mockRejectedValueOnce(new Error("smtp down"))
    const spy = vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await emailGarage(garage.id, "emailNewBooking", () => ({ subject: "s", html: "h" }))).toBe(false)
    spy.mockRestore()
  })
})

describe("garage emails from booking events", () => {
  const book = async (garageId: string, source: "MARKETPLACE" | "DIRECT" | "WIDGET" | "JOB_REQUEST") => {
    const { user, vehicle } = await makeOwner(PREFIX)
    return createBooking({
      garageId, source,
      ownerId: source === "DIRECT" ? undefined : user.id, vehicleId: source === "DIRECT" ? undefined : vehicle.id,
      customerName: "Someone", vrm: "AB12CDE", serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 50,
    })
  }

  it("emails the garage about marketplace and widget bookings, but not its own direct ones", async () => {
    const { garage } = await makeGarage(PREFIX)
    await book(garage.id, "DIRECT")
    expect(sendMail).not.toHaveBeenCalled()

    await book(garage.id, "MARKETPLACE")
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect(sendMail.mock.calls[0][0]).toMatchObject({ to: garage.email })
    expect((sendMail.mock.calls[0][0] as any).subject).toMatch(/New booking/)
    expect((sendMail.mock.calls[0][0] as any).html).toContain("/garage-dashboard/bookings?booking=")

    await book(garage.id, "WIDGET")
    expect(sendMail).toHaveBeenCalledTimes(2)
  })

  it("leaves guest job bookings to the accept route (no duplicate email from the service)", async () => {
    const { garage } = await makeGarage(PREFIX)
    await book(garage.id, "JOB_REQUEST")
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("honours the new-booking toggle", async () => {
    const { garage } = await makeGarage(PREFIX, { portalSettings: off("emailNewBooking") })
    await book(garage.id, "MARKETPLACE")
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("emails the garage when a customer cancels, unless switched off", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const mk = () => prisma.booking.create({ data: { garageId: garage.id, ownerId: user.id, vehicleId: vehicle.id, serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 1, customerName: "Cust" } })
    const b = await mk()
    await transitionBooking({ bookingId: b.id, to: "CANCELLED", actor: { role: "OWNER", userId: user.id } })
    expect(sendMail).toHaveBeenCalledTimes(1)
    expect((sendMail.mock.calls[0][0] as any).subject).toMatch(/Booking cancelled/)

    sendMail.mockClear()
    await prisma.garage.update({ where: { id: garage.id }, data: { portalSettings: off("emailCancellation") } })
    const b2 = await mk()
    await transitionBooking({ bookingId: b2.id, to: "CANCELLED", actor: { role: "OWNER", userId: user.id } })
    expect(sendMail).not.toHaveBeenCalled()
  })

  it("doesn't email the garage when the garage itself cancels", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await createBooking({ garageId: garage.id, source: "DIRECT", serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 1, customerName: "X" })
    await transitionBooking({ bookingId: b.id, to: "CANCELLED", actor: { role: "GARAGE", garageId: garage.id } })
    expect(sendMail).not.toHaveBeenCalled()
  })
})
