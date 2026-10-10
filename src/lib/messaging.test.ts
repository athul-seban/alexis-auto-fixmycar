import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { createBooking } from "@/lib/portal/booking-service"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"
import { garageUnreadCount, isFirstUnreadFromSender, markThreadRead, ownerUnreadCount, threadSummaries } from "./messaging"

const PREFIX = "msgunread-"

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

async function setup() {
  const { user: garageUser, garage } = await makeGarage(PREFIX)
  const { user: owner, vehicle } = await makeOwner(PREFIX)
  const booking = await createBooking({
    garageId: garage.id, source: "MARKETPLACE", ownerId: owner.id, vehicleId: vehicle.id,
    serviceType: "MOT", scheduledAt: new Date(Date.now() + 86400000), totalPrice: 50, notify: false,
  })
  const say = (senderId: string, body: string) => prisma.message.create({ data: { bookingId: booking.id, senderId, garageId: garage.id, body } })
  return { garageUser, garage, owner, booking, say }
}

describe("unread counts", () => {
  it("counts only messages from the other side, for each side", async () => {
    const { garageUser, garage, owner, say } = await setup()
    await say(garageUser.id, "Your car is booked in")
    await say(garageUser.id, "Any questions, shout")
    await say(owner.id, "Thanks!")

    expect(await ownerUnreadCount(owner.id)).toBe(2)
    expect(await garageUnreadCount({ id: garage.id, userId: garageUser.id })).toBe(1)
  })

  it("is zero for someone with no conversations", async () => {
    const { user } = await makeOwner(PREFIX, "loner")
    expect(await ownerUnreadCount(user.id)).toBe(0)
  })
})

describe("markThreadRead", () => {
  it("reads the other side's messages and leaves the reader's own alone", async () => {
    const { garageUser, owner, booking, say } = await setup()
    await say(garageUser.id, "hello")
    const mine = await say(owner.id, "hi back")

    expect(await markThreadRead(owner.id, { bookingId: booking.id })).toBe(1)
    expect(await ownerUnreadCount(owner.id)).toBe(0)
    // The owner reading must not mark their own message as read by the garage.
    expect((await prisma.message.findUniqueOrThrow({ where: { id: mine.id } })).readAt).toBeNull()
    expect(await markThreadRead(owner.id, { bookingId: booking.id })).toBe(0)
  })
})

describe("isFirstUnreadFromSender", () => {
  it("is true for the first message of a burst and false for the rest", async () => {
    const { garageUser, owner, say } = await setup()
    const first = await say(garageUser.id, "one")
    expect(await isFirstUnreadFromSender(first)).toBe(true)
    const second = await say(garageUser.id, "two")
    expect(await isFirstUnreadFromSender(second)).toBe(false)
    // The other side talking doesn't count as the same burst.
    const reply = await say(owner.id, "reply")
    expect(await isFirstUnreadFromSender(reply)).toBe(true)
  })
})

describe("threadSummaries", () => {
  it("lists a conversation with its unread count from each side's point of view", async () => {
    const { garageUser, garage, owner, booking, say } = await setup()
    await say(garageUser.id, "Your car is ready")
    await say(garageUser.id, "Open until 5pm")

    const [forOwner] = await threadSummaries({ role: "OWNER", userId: owner.id })
    expect(forOwner).toMatchObject({ key: `b:${booking.id}`, kind: "booking", unread: 2, lastBody: "Open until 5pm" })
    expect(forOwner.with).toBe(garage.name)
    expect(forOwner.about).toMatch(/^Booking · /)

    const [forGarage] = await threadSummaries({ role: "GARAGE", userId: garageUser.id, garageId: garage.id })
    expect(forGarage.unread).toBe(0)
    expect(forGarage.link).toBe(`/garage-dashboard/bookings?booking=${booking.id}`)
  })

  it("doesn't leak another customer's conversation", async () => {
    const { garageUser, say } = await setup()
    await say(garageUser.id, "private")
    const { user: stranger } = await makeOwner(PREFIX, "stranger")
    expect(await threadSummaries({ role: "OWNER", userId: stranger.id })).toEqual([])
  })
})
