import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

const sendMail = vi.hoisted(() => vi.fn())
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "invoiceapi-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const ctx = (id: string) => ({ params: Promise.resolve({ id }) })
const post = (id: string, body: unknown = {}) => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx(id))

beforeEach(async () => {
  mockSession.mockReset()
  sendMail.mockReset().mockResolvedValue({ success: true })
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function setup(status = "COMPLETED") {
  const { user, garage } = await makeGarage(PREFIX)
  asUser(user.id)
  const booking = await makeWalkInBooking(garage.id, { status, customerEmail: "cust@example.com", customerName: "Cass Tomer", totalPrice: 90 })
  return { user, garage, booking }
}

describe("GET /api/garage/bookings/[id]/invoice", () => {
  it("downloads a PDF named after the invoice number, and numbers it once", async () => {
    const { booking } = await setup()
    const res = await GET(new Request("http://x"), ctx(booking.id))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toBe("application/pdf")
    expect(res.headers.get("content-disposition")).toContain("INV-0001.pdf")
    expect(Buffer.from(await res.arrayBuffer()).subarray(0, 5).toString()).toBe("%PDF-")
    const again = await GET(new Request("http://x"), ctx(booking.id))
    expect(again.headers.get("content-disposition")).toContain("INV-0001.pdf")
  })

  it("refuses an unfinished booking and another garage's booking", async () => {
    const open = await setup("CONFIRMED")
    expect((await GET(new Request("http://x"), ctx(open.booking.id))).status).toBe(409)
    const { user: other } = await makeGarage(PREFIX, { key: "other" })
    const done = await setup()
    asUser(other.id)
    expect((await GET(new Request("http://x"), ctx(done.booking.id))).status).toBe(404)
  })

  it("still allows a suspended garage to download its own invoices (read-only)", async () => {
    const { user, garage } = await makeGarage(PREFIX, { key: "sus", status: "SUSPENDED" })
    asUser(user.id)
    const b = await makeWalkInBooking(garage.id, { status: "COMPLETED" })
    expect((await GET(new Request("http://x"), ctx(b.id))).status).toBe(200)
    expect((await post(b.id)).status).toBe(403) // but emailing is a write
  })
})

describe("POST /api/garage/bookings/[id]/invoice (email)", () => {
  it("emails the PDF to the customer and records it on the booking", async () => {
    const { booking } = await setup()
    const res = await post(booking.id)
    expect(res.status).toBe(200)
    expect((await res.json()).to).toBe("cust@example.com")
    const mail = sendMail.mock.calls[0][0]
    expect(mail.to).toBe("cust@example.com")
    expect(mail.subject).toContain("INV-0001")
    expect(mail.attachments[0]).toMatchObject({ filename: "INV-0001.pdf", contentType: "application/pdf" })
    expect(mail.attachments[0].content.subarray(0, 5).toString()).toBe("%PDF-")
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, detail: { contains: "emailed" } } })).toBe(1)
  })

  it("can send to a typed address, and needs one when the booking has none", async () => {
    const { garage, user } = await setup()
    const noEmail = await makeWalkInBooking(garage.id, { status: "COMPLETED", customerEmail: null })
    asUser(user.id)
    expect((await post(noEmail.id)).status).toBe(400)
    expect((await post(noEmail.id, { to: "new@example.com" })).status).toBe(200)
    expect(sendMail.mock.calls[0][0].to).toBe("new@example.com")
    expect((await post(noEmail.id, { to: "not-an-email" })).status).toBe(400)
  })

  it("reports a mail failure instead of claiming success", async () => {
    const { booking } = await setup()
    sendMail.mockResolvedValueOnce({ success: false })
    expect((await post(booking.id)).status).toBe(502)
    expect(await prisma.bookingEvent.count({ where: { bookingId: booking.id, detail: { contains: "emailed" } } })).toBe(0)
  })
})
