import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { backfillOrganisations, verifyOrganisations } from "@/lib/org/backfill"
import { ALL_LOCATIONS, computeAccess } from "@/lib/org/access"
import { cleanupPrefix, makeGarage, makeLocation, makeOwner, makeWalkInBooking } from "@/test/fixtures"

// Every call is scoped to this file's own garages (garageIds): other test files run in parallel against the same
// database and create legacy garages of their own, which a global backfill would convert under their feet.

const PREFIX = "orgbackfill-" // unique across test files: cleanupPrefix deletes everything under it, even another file's rows
beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

const legacy = (key: string, extra: Parameters<typeof makeGarage>[1] = {}) => makeGarage(PREFIX, { key, legacy: true, ...extra })

describe("backfillOrganisations", () => {
  it("makes a legacy garage the first location of its own business, with its login as Owner", async () => {
    const { user, garage } = await legacy("a")
    const r = await backfillOrganisations({ garageIds: [garage.id] })
    expect(r).toMatchObject({ scanned: 1, created: 1 })

    const after = await prisma.garage.findUniqueOrThrow({ where: { id: garage.id }, include: { organisation: { include: { roles: true } } } })
    const org = after.organisation!
    expect(org.name).toBe(garage.name)
    expect(org.roles.map((x) => x.presetKey).sort()).toEqual(["manager", "owner", "staff"])
    expect(org.roles.every((x) => x.isSystem && x.isEnabled)).toBe(true)

    const membership = await prisma.membership.findUniqueOrThrow({ where: { userId_organisationId: { userId: user.id, organisationId: org.id } }, include: { assignments: true } })
    expect(membership.status).toBe("ACTIVE")
    expect(membership.assignments).toHaveLength(1)
    expect(membership.assignments[0]).toMatchObject({ scopeKey: ALL_LOCATIONS, garageId: null, roleId: org.roles.find((x) => x.presetKey === "owner")!.id })

    // and that membership really does make them the Owner
    const access = computeAccess(membership.assignments, org.roles, garage.id)
    expect(access.isOwner).toBe(true)
    expect(access.permissions.has("billing.manage")).toBe(true)
  })

  it("is idempotent: running it again changes nothing", async () => {
    const { garage } = await legacy("idem")
    await backfillOrganisations({ garageIds: [garage.id] })
    const second = await backfillOrganisations({ garageIds: [garage.id] })
    expect(second).toMatchObject({ scanned: 0, created: 0 })
    // Counted for THIS garage only: other test files create organisations in parallel, so a global count would be flaky.
    expect(await prisma.organisation.count({ where: { locations: { some: { id: garage.id } } } })).toBe(1)
    const org = (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).organisationId!
    expect(await prisma.role.count({ where: { organisationId: org } })).toBe(3)
    expect(await prisma.membership.count({ where: { organisationId: org } })).toBe(1)
  })

  it("--dry-run writes nothing but reports what it would do", async () => {
    const { garage, user } = await legacy("dry")
    const r = await backfillOrganisations({ garageIds: [garage.id], dryRun: true })
    expect(r).toMatchObject({ scanned: 1, created: 1 })
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).organisationId).toBeNull()
    expect(await prisma.membership.count({ where: { userId: user.id } })).toBe(0)
  })

  it("copies the billing relationship and branding onto the business, Stripe ids included", async () => {
    const { garage } = await legacy("bill")
    await prisma.garage.update({
      where: { id: garage.id },
      data: {
        plan: "PRO", stripeCustomerId: `${PREFIX}cus`, stripeSubscriptionId: `${PREFIX}sub`, subscriptionStatus: "active", leadCredits: 7,
        stripeAccountId: `${PREFIX}acct`, stripeChargesEnabled: true, invoiceCounter: 12, vatNumber: "GB123456789", description: "Family garage since 1984", website: "https://example.com",
      },
    })
    await backfillOrganisations({ garageIds: [garage.id] })
    const org = (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id }, include: { organisation: true } })).organisation!
    expect(org).toMatchObject({
      plan: "PRO", stripeCustomerId: `${PREFIX}cus`, stripeSubscriptionId: `${PREFIX}sub`, subscriptionStatus: "active", leadCredits: 7,
      stripeAccountId: `${PREFIX}acct`, stripeChargesEnabled: true, invoiceCounter: 12, vatNumber: "GB123456789", description: "Family garage since 1984", website: "https://example.com",
    })
    // the garage keeps its own copy (older code still reads it)
    expect(await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).toMatchObject({ plan: "PRO", leadCredits: 7, invoiceCounter: 12 })
  })

  it("gives two garages with the same name different business slugs", async () => {
    const a = await legacy("same")
    const b = await legacy("same2")
    await prisma.garage.updateMany({ where: { id: { in: [a.garage.id, b.garage.id] } }, data: { name: `${PREFIX}Twin Garage` } })
    await backfillOrganisations({ garageIds: [a.garage.id, b.garage.id] })
    const orgs = await prisma.organisation.findMany({ where: { locations: { some: { id: { in: [a.garage.id, b.garage.id] } } } } })
    expect(orgs).toHaveLength(2)
    expect(new Set(orgs.map((o) => o.slug)).size).toBe(2)
  })

  it("flags messages sent by the garage's own login, not the customer's, and links lead-credit rows to the business", async () => {
    const { garage, user } = await legacy("msgs")
    const { user: customer, vehicle } = await makeOwner(PREFIX)
    const booking = await makeWalkInBooking(garage.id, { ownerId: customer.id, vehicleId: vehicle.id })
    await prisma.message.create({ data: { bookingId: booking.id, senderId: user.id, garageId: garage.id, body: "From the garage" } })
    await prisma.message.create({ data: { bookingId: booking.id, senderId: customer.id, garageId: garage.id, body: "From the customer" } })
    await prisma.leadCreditTransaction.create({ data: { garageId: garage.id, delta: 5, reason: "PURCHASE" } })

    const r = await backfillOrganisations({ garageIds: [garage.id] })
    expect(r.messagesFlagged).toBe(1)
    expect(r.creditRowsLinked).toBe(1)
    const msgs = await prisma.message.findMany({ where: { garageId: garage.id }, orderBy: { createdAt: "asc" } })
    expect(msgs.map((m) => [m.body, m.fromGarage])).toEqual([["From the garage", true], ["From the customer", false]])
    const orgId = (await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).organisationId
    expect((await prisma.leadCreditTransaction.findFirstOrThrow({ where: { garageId: garage.id } })).organisationId).toBe(orgId)
  })

  it("a re-run catches rows the OLD code wrote after the first run (new messages, new garages)", async () => {
    const first = await legacy("first")
    await backfillOrganisations({ garageIds: [first.garage.id] })
    const { user: customer, vehicle } = await makeOwner(PREFIX)
    const booking = await makeWalkInBooking(first.garage.id, { ownerId: customer.id, vehicleId: vehicle.id })
    await prisma.message.create({ data: { bookingId: booking.id, senderId: first.user.id, garageId: first.garage.id, body: "sent by old code" } })
    const late = await legacy("late") // registered by old code after the first run

    const r = await backfillOrganisations({ garageIds: [first.garage.id, late.garage.id] })
    expect(r).toMatchObject({ scanned: 1, created: 1, messagesFlagged: 1 })
    expect((await prisma.message.findFirstOrThrow({ where: { garageId: first.garage.id } })).fromGarage).toBe(true)
  })

  it("--sync-billing copies garage billing across for a single-location business, and never for a multi-location one", async () => {
    const solo = await legacy("solo")
    const multi = await legacy("multi")
    await backfillOrganisations({ garageIds: [solo.garage.id, multi.garage.id] })
    const multiOrg = (await prisma.garage.findUniqueOrThrow({ where: { id: multi.garage.id } })).organisationId!
    await makeLocation(PREFIX, multiOrg, { key: "second" })

    // the old code later changed the garages' billing
    await prisma.garage.update({ where: { id: solo.garage.id }, data: { plan: "PREMIUM", leadCredits: 9 } })
    await prisma.garage.update({ where: { id: multi.garage.id }, data: { plan: "PREMIUM", leadCredits: 9 } })

    const r = await backfillOrganisations({ garageIds: [solo.garage.id, multi.garage.id], syncBilling: true })
    expect(r.billingSynced).toBe(1)
    const soloOrg = await prisma.organisation.findFirstOrThrow({ where: { locations: { some: { id: solo.garage.id } } } })
    expect(soloOrg).toMatchObject({ plan: "PREMIUM", leadCredits: 9 })
    expect(await prisma.organisation.findUniqueOrThrow({ where: { id: multiOrg } })).toMatchObject({ plan: "FREE", leadCredits: 0 })
  })

  it("without --sync-billing it never overwrites the business's billing", async () => {
    const { garage } = await legacy("nosync")
    await backfillOrganisations({ garageIds: [garage.id] })
    await prisma.garage.update({ where: { id: garage.id }, data: { plan: "PRO" } })
    await backfillOrganisations({ garageIds: [garage.id] })
    expect((await prisma.organisation.findFirstOrThrow({ where: { locations: { some: { id: garage.id } } } })).plan).toBe("FREE")
  })
})

describe("verifyOrganisations", () => {
  it("passes for a healthy business, and for one the backfill just made", async () => {
    const ok = await makeGarage(PREFIX, { key: "ok" })
    const old = await legacy("old")
    await backfillOrganisations({ garageIds: [old.garage.id] })
    const r = await verifyOrganisations(prisma, { garageIds: [ok.garage.id, old.garage.id] })
    expect(r.problems).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.counts).toMatchObject({ garages: 2, organisations: 2, memberships: 2 })
  })

  it("reports a garage that has no business yet", async () => {
    const { garage } = await legacy("orphan")
    const r = await verifyOrganisations(prisma, { garageIds: [garage.id] })
    expect(r.ok).toBe(false)
    expect(r.problems.join("\n")).toMatch(/1 garage\(s\) have no business/)
  })

  it("reports a missing system role and a business with no active Owner", async () => {
    const { organisation, membership } = await makeGarage(PREFIX, { key: "broken" })
    await prisma.roleAssignment.deleteMany({ where: { membershipId: membership!.id } })
    await prisma.role.deleteMany({ where: { organisationId: organisation!.id, presetKey: "staff" } })
    const garageId = (await prisma.garage.findFirstOrThrow({ where: { organisationId: organisation!.id } })).id
    const r = await verifyOrganisations(prisma, { garageIds: [garageId] })
    expect(r.ok).toBe(false)
    expect(r.problems.join("\n")).toMatch(/missing system role\(s\): staff/)
    expect(r.problems.join("\n")).toMatch(/no active Owner/)
  })

  it("reports a member who couldn't sign in to the portal (wrong login role)", async () => {
    const { garage, membership } = await makeGarage(PREFIX, { key: "wrongrole" })
    await prisma.user.update({ where: { id: membership!.userId }, data: { role: "OWNER" } })
    const r = await verifyOrganisations(prisma, { garageIds: [garage.id] })
    expect(r.problems.join("\n")).toMatch(/don't have the GARAGE login role/)
  })

  it("reports owner-login messages that aren't flagged yet", async () => {
    const { garage, user } = await legacy("unflagged")
    await backfillOrganisations({ garageIds: [garage.id] })
    const { user: customer, vehicle } = await makeOwner(PREFIX)
    const booking = await makeWalkInBooking(garage.id, { ownerId: customer.id, vehicleId: vehicle.id })
    await prisma.message.create({ data: { bookingId: booking.id, senderId: user.id, garageId: garage.id, body: "old" } })
    expect((await verifyOrganisations(prisma, { garageIds: [garage.id] })).problems.join("\n")).toMatch(/1 message\(s\) from garage logins/)
    await backfillOrganisations({ garageIds: [garage.id] })
    expect((await verifyOrganisations(prisma, { garageIds: [garage.id] })).ok).toBe(true)
  })
})
