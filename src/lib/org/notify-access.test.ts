import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"
import { NOTIFICATION_PERMISSION, canSeeNotification, recipientsForLocation, visibleNotificationTypes } from "@/lib/org/notify-access"
import { PERMISSION_KEYS } from "@/lib/org/permissions"
import { notifyGarage, type NotificationType } from "@/lib/notifications"

const webpush = vi.hoisted(() => ({ setVapidDetails: vi.fn(), sendNotification: vi.fn(async () => ({})) }))
vi.mock("web-push", () => ({ default: webpush }))

const PREFIX = "notifyacc-"
const endpointOf = (who: string) => `https://push.example.com/${PREFIX}${who}`

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "test-public-key"
  process.env.VAPID_PRIVATE_KEY = "test-private-key"
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})
afterAll(async () => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

const access = (...keys: (typeof PERMISSION_KEYS)[number][]) => ({ permissions: new Set(keys) })

describe("which notifications a role can see", () => {
  it("maps every kind to real permission keys", () => {
    for (const [type, keys] of Object.entries(NOTIFICATION_PERMISSION)) {
      expect(keys.length, type).toBeGreaterThan(0)
      for (const k of keys) expect(PERMISSION_KEYS, `${type} -> ${k}`).toContain(k)
    }
  })

  it("shows each kind only to roles that hold one of its permissions", () => {
    const reception = access("bookings.view", "messages.view")
    expect(canSeeNotification(reception, "BOOKING_CREATED")).toBe(true)
    expect(canSeeNotification(reception, "MESSAGE_RECEIVED")).toBe(true)
    expect(canSeeNotification(reception, "REVIEW_RECEIVED")).toBe(false)
    expect(canSeeNotification(reception, "GARAGE_STATUS_CHANGED")).toBe(false)
    expect(canSeeNotification(access("profile.edit"), "GARAGE_STATUS_CHANGED")).toBe(true)
    expect(visibleNotificationTypes(access())).toEqual([])
  })

  it("hides a kind nobody mapped, rather than showing it to everyone", () => {
    expect(canSeeNotification(access(...PERMISSION_KEYS), "SOMETHING_NEW")).toBe(false)
  })
})

describe("recipientsForLocation", () => {
  it("is the people who can open the location and hold the permission, and nobody else", async () => {
    const { user: owner, garage, organisation } = await makeGarage(PREFIX)
    const second = await makeLocation(PREFIX, organisation!.id)
    const manager = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [garage.id] })
    const desk = await makeStaff(PREFIX, organisation!.id, { permissions: ["bookings.view"], locations: [garage.id] })
    const elsewhere = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [second.id] })
    const everywhere = await makeStaff(PREFIX, organisation!.id, { role: "staff" }) // all locations, Staff role

    const forBooking = await recipientsForLocation(garage.id, "BOOKING_CREATED")
    expect(forBooking.sort()).toEqual([owner.id, manager.user.id, desk.user.id, everywhere.user.id].sort())
    expect(forBooking).not.toContain(elsewhere.user.id)

    // A review notice needs reviews.view, which the desk role doesn't have.
    const forReview = await recipientsForLocation(garage.id, "REVIEW_RECEIVED")
    expect(forReview).toContain(manager.user.id)
    expect(forReview).not.toContain(desk.user.id)

    // The second location's people are told about the second location, not the first.
    expect((await recipientsForLocation(second.id, "BOOKING_CREATED")).sort()).toEqual([owner.id, elsewhere.user.id, everywhere.user.id].sort())
  })

  it("leaves out suspended members, suspended accounts and suspended businesses", async () => {
    const { user: owner, garage, organisation } = await makeGarage(PREFIX)
    const off = await makeStaff(PREFIX, organisation!.id, { role: "manager", status: "SUSPENDED" })
    const banned = await makeStaff(PREFIX, organisation!.id, { role: "manager", userSuspended: true })
    expect(await recipientsForLocation(garage.id, "BOOKING_CREATED")).toEqual([owner.id])
    expect(await recipientsForLocation(garage.id, "BOOKING_CREATED")).not.toContain(off.user.id)
    expect(await recipientsForLocation(garage.id, "BOOKING_CREATED")).not.toContain(banned.user.id)

    await prisma.organisation.update({ where: { id: organisation!.id }, data: { suspendedAt: new Date() } })
    expect(await recipientsForLocation(garage.id, "BOOKING_CREATED")).toEqual([])
  })

  it("tells a garage that predates businesses through its one login", async () => {
    const { user, garage } = await makeGarage(PREFIX, { legacy: true })
    expect(await recipientsForLocation(garage.id, "BOOKING_CREATED")).toEqual([user.id])
    await prisma.user.update({ where: { id: user.id }, data: { suspendedAt: new Date() } })
    expect(await recipientsForLocation(garage.id, "BOOKING_CREATED")).toEqual([])
    expect(await recipientsForLocation("no-such-garage", "BOOKING_CREATED")).toEqual([])
  })
})

describe("push fan-out for a location", () => {
  const subscribe = (endpoint: string, owner: { userId?: string; garageId?: string }) =>
    prisma.pushSubscription.create({ data: { endpoint, p256dh: "p".repeat(20), auth: "a".repeat(20), ...owner } })
  const sentTo = () => (webpush.sendNotification.mock.calls as unknown as [{ endpoint: string }][]).map((c) => c[0].endpoint).sort()

  it("reaches the devices of exactly the people who can see that kind of notification", async () => {
    const { user: owner, garage, organisation } = await makeGarage(PREFIX)
    const second = await makeLocation(PREFIX, organisation!.id)
    const manager = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [garage.id] })
    const desk = await makeStaff(PREFIX, organisation!.id, { permissions: ["bookings.view"], locations: [garage.id] })
    const elsewhere = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [second.id] })
    const suspended = await makeStaff(PREFIX, organisation!.id, { role: "manager", status: "SUSPENDED" })
    await subscribe(endpointOf("owner"), { userId: owner.id })
    await subscribe(endpointOf("manager"), { userId: manager.user.id })
    await subscribe(endpointOf("desk"), { userId: desk.user.id })
    await subscribe(endpointOf("elsewhere"), { userId: elsewhere.user.id })
    await subscribe(endpointOf("suspended"), { userId: suspended.user.id })
    await subscribe(endpointOf("legacy"), { garageId: garage.id }) // registered before subscriptions followed the person

    await notifyGarage({ garageId: garage.id, type: "BOOKING_CREATED", title: "New booking", body: "b" })
    expect(sentTo()).toEqual(["desk", "legacy", "manager", "owner"].map(endpointOf).sort())

    webpush.sendNotification.mockClear()
    await notifyGarage({ garageId: garage.id, type: "REVIEW_RECEIVED", title: "New review", body: "b" })
    expect(sentTo()).toEqual(["legacy", "manager", "owner"].map(endpointOf).sort()) // not the desk
  })

  it("stops reaching a member the moment their access is removed", async () => {
    const { garage, organisation } = await makeGarage(PREFIX)
    const member = await makeStaff(PREFIX, organisation!.id, { role: "manager", locations: [garage.id] })
    await subscribe(endpointOf("member"), { userId: member.user.id })
    await notifyGarage({ garageId: garage.id, type: "MESSAGE_RECEIVED", title: "Hi", body: "b" })
    expect(sentTo()).toContain(endpointOf("member"))

    webpush.sendNotification.mockClear()
    await prisma.membership.update({ where: { id: member.membership.id }, data: { status: "SUSPENDED" } })
    await notifyGarage({ garageId: garage.id, type: "MESSAGE_RECEIVED" as NotificationType, title: "Hi again", body: "b" })
    expect(sentTo()).not.toContain(endpointOf("member"))
  })

  it("still saves the in-app notification when nobody has a device", async () => {
    const { garage } = await makeGarage(PREFIX)
    await notifyGarage({ garageId: garage.id, type: "BOOKING_CREATED", title: "Quiet", body: "b" })
    expect(await prisma.notification.count({ where: { garageId: garage.id, title: "Quiet" } })).toBe(1)
    expect(webpush.sendNotification).not.toHaveBeenCalled()
  })
})
