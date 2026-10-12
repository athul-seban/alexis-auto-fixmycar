import { describe, it, expect, afterAll, beforeEach, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { sendDueReviewRequests } from "@/lib/portal/review-requests"
import { suppress } from "@/lib/unsubscribe"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue(undefined) }))

const mail = vi.mocked(sendMail)
const PREFIX = "reviewreq-"
const DAY = 24 * 3_600_000
const now = new Date("2026-10-12T09:00:00Z")
const ago = (days: number) => new Date(now.getTime() - days * DAY)
let n = 0
const completed = (garageId: string, over: Record<string, unknown> = {}) =>
  makeWalkInBooking(garageId, {
    status: "COMPLETED",
    completedAt: ago(2),
    customerEmail: `${PREFIX}c${++n}@example.com`,
    manageToken: `${PREFIX}tok${n}`.padEnd(32, "x"),
    ...over,
  })

beforeEach(async () => {
  mail.mockClear()
  mail.mockResolvedValue(undefined as never)
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("sendDueReviewRequests", () => {
  it("asks completed customers once, inside the 1 to 14 day window", async () => {
    const { garage } = await makeGarage(PREFIX)
    const due = await completed(garage.id)
    const tooSoon = await completed(garage.id, { completedAt: new Date(now.getTime() - 3_600_000) })
    const tooOld = await completed(garage.id, { completedAt: ago(30) })
    const notDone = await completed(garage.id, { status: "CONFIRMED", completedAt: null })
    const noEmail = await completed(garage.id, { customerEmail: null })

    expect(await sendDueReviewRequests(now)).toEqual({ sent: 1, skipped: 0 })
    expect(mail).toHaveBeenCalledTimes(1)
    expect(mail.mock.calls[0][0].html).toContain(`/booking/${due.manageToken}?review=1`)
    expect(mail.mock.calls[0][0].headers?.["List-Unsubscribe"]).toBeTruthy()
    const asked = async (id: string) => (await prisma.booking.findUniqueOrThrow({ where: { id } })).reviewRequestedAt !== null
    expect(await asked(due.id)).toBe(true)
    for (const b of [tooSoon, tooOld, notDone, noEmail]) expect(await asked(b.id)).toBe(false)

    expect(await sendDueReviewRequests(now)).toEqual({ sent: 0, skipped: 0 })
  })

  it("skips bookings that already have a review, garages that turned it off, and unsubscribed addresses", async () => {
    const on = await makeGarage(PREFIX, { key: "on" })
    const off = await makeGarage(PREFIX, { key: "off", portalSettings: JSON.stringify({ notifications: { reviewRequests: false } }) })
    const reviewed = await completed(on.garage.id)
    await prisma.review.create({ data: { garageId: on.garage.id, bookingId: reviewed.id, rating: 5, comment: "Lovely job done", customerName: "A B" } })
    await completed(off.garage.id)
    const unsub = await completed(on.garage.id)
    await suppress(unsub.customerEmail!, on.garage.id)

    expect((await sendDueReviewRequests(now)).sent).toBe(0)
    expect(mail).not.toHaveBeenCalled()
  })

  it("asks a returning customer only once per run", async () => {
    const { garage } = await makeGarage(PREFIX)
    const email = `${PREFIX}repeat@example.com`
    await completed(garage.id, { customerEmail: email })
    await completed(garage.id, { customerEmail: email })
    expect((await sendDueReviewRequests(now)).sent).toBe(1)
    expect(mail).toHaveBeenCalledTimes(1)
  })

  it("releases the claim when the email fails so the next run retries", async () => {
    const { garage } = await makeGarage(PREFIX)
    const b = await completed(garage.id)
    mail.mockResolvedValueOnce({ success: false } as never)
    expect(await sendDueReviewRequests(now)).toEqual({ sent: 0, skipped: 1 })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).reviewRequestedAt).toBeNull()
    expect((await sendDueReviewRequests(now)).sent).toBe(1)
  })
})
