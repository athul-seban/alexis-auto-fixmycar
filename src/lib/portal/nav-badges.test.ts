import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"
import { garageNavBadges } from "@/lib/portal/nav-badges"
import { PERMISSION_KEYS, type PermissionKey } from "@/lib/org/permissions"

const PREFIX = "navbadge-"
const HOUR = 3_600_000

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

const viewer = (userId: string, keys: readonly PermissionKey[]) => ({ userId, can: (k: PermissionKey) => keys.includes(k) })

async function setup() {
  const { user, garage } = await makeGarage(PREFIX)
  const tech = await prisma.technician.create({ data: { garageId: garage.id, name: "Tess", userId: user.id } })
  const past = new Date(Date.now() - 3 * HOUR)
  // Three bookings whose time has passed without an outcome: one is Tess's.
  await makeWalkInBooking(garage.id, { technicianId: tech.id, scheduledAt: past, status: "CONFIRMED", timeConfirmed: true })
  await makeWalkInBooking(garage.id, { technicianId: null, scheduledAt: past, status: "CONFIRMED", timeConfirmed: true })
  await makeWalkInBooking(garage.id, { technicianId: null, scheduledAt: past, status: "PENDING", timeConfirmed: true })
  return { user, garage }
}

describe("garageNavBadges", () => {
  it("counts the whole location when nobody in particular is looking", async () => {
    const { garage } = await setup()
    expect((await garageNavBadges(garage)).needsOutcome).toBe(3)
  })

  it("counts everything for a role that sees every booking", async () => {
    const { user, garage } = await setup()
    expect((await garageNavBadges(garage, viewer(user.id, PERMISSION_KEYS))).needsOutcome).toBe(3)
  })

  it("counts only their own jobs for a technician", async () => {
    const { user, garage } = await setup()
    const badges = await garageNavBadges(garage, viewer(user.id, ["bookings.viewOwn", "bookings.updateOwn", "diary.viewOwn"]))
    expect(badges.needsOutcome).toBe(1)
  })

  it("counts nothing for a login that isn't linked to a technician, or has no booking access", async () => {
    const { user, garage } = await setup()
    await prisma.technician.deleteMany({ where: { garageId: garage.id } })
    expect((await garageNavBadges(garage, viewer(user.id, ["bookings.viewOwn"]))).needsOutcome).toBe(0)
    expect((await garageNavBadges(garage, viewer(user.id, ["profile.edit"]))).needsOutcome).toBe(0)
  })

  it("leaves out reviews, enquiries and messages for roles that can't open those pages", async () => {
    const { user, garage } = await setup()
    const badges = await garageNavBadges(garage, viewer(user.id, ["bookings.view"]))
    expect(badges).toMatchObject({ unrepliedReviews: 0, newEnquiries: 0, unreadMessages: 0 })
  })
})
