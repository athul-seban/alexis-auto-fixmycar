import { describe, it, expect, beforeEach, afterAll } from "vitest"
import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { accessToLocation, pickActiveLocation, resolveActiveGarage, resolveGarageAccess } from "@/lib/org/resolve"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"

const PREFIX = "resolvetest-"
beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

const g = (id: string, over: Partial<Garage> = {}) => ({ id, userId: `u-${id}`, createdAt: new Date(2026, 0, Number(id.replace(/\D/g, "")) || 1), ...over }) as Garage

describe("pickActiveLocation", () => {
  const garages = [g("c3"), g("a1", { userId: "me" }), g("b2")]

  it("takes the requested location when it is one of theirs", () => {
    expect(pickActiveLocation(garages, "me", "b2")?.id).toBe("b2")
  })

  it("otherwise the garage their login originally owned", () => {
    expect(pickActiveLocation(garages, "me", null)?.id).toBe("a1")
    expect(pickActiveLocation(garages, "me", "not-theirs")?.id).toBe("a1")
  })

  it("otherwise the oldest location, deterministically (a refresh never jumps)", () => {
    expect(pickActiveLocation(garages, "someone-else", undefined)?.id).toBe("a1")
    const same = new Date(2026, 5, 1)
    const tie = [g("z9", { createdAt: same }), g("m5", { createdAt: same })]
    expect(pickActiveLocation(tie, "x", null)?.id).toBe("m5")
    expect(pickActiveLocation([...tie].reverse(), "x", null)?.id).toBe("m5")
  })

  it("is null when there is nowhere to act", () => {
    expect(pickActiveLocation([], "me", "a1")).toBeNull()
  })
})

describe("resolveGarageAccess", () => {
  it("gives a business owner every location, with the legacy login's own garage as default", async () => {
    const b = await makeGarage(PREFIX, { key: "home" })
    const second = await makeLocation(PREFIX, b.organisation!.id, { key: "second" })
    const r = await resolveGarageAccess(b.user.id)
    expect(r.ok && r.value.garage.id).toBe(b.garage.id)
    expect(r.ok && r.value.locations.map((l) => l.id).sort()).toEqual([b.garage.id, second.id].sort())
    expect(r.ok && r.value.access.locations).toBe("all")
    expect(r.ok && r.value.membershipId).toBe(b.membership!.id)
  })

  it("a member with only one location sees only that one", async () => {
    const b = await makeGarage(PREFIX, { key: "home" })
    const second = await makeLocation(PREFIX, b.organisation!.id, { key: "second" })
    const staff = await makeStaff(PREFIX, b.organisation!.id, { role: "staff", locations: [second.id] })
    const r = await resolveGarageAccess(staff.user.id, b.garage.id)
    expect(r.ok && r.value.garage.id).toBe(second.id) // asked for another location: refused quietly
    expect(r.ok && r.value.locations).toHaveLength(1)
    expect(r.ok && r.value.access.locations).toEqual([second.id])
  })

  it("someone in two businesses acts in the one that owns the requested location", async () => {
    const one = await makeGarage(PREFIX, { key: "one" })
    const two = await makeGarage(PREFIX, { key: "two" })
    const both = await makeStaff(PREFIX, one.organisation!.id, { role: "manager", key: "both" })
    await prisma.membership.create({
      data: {
        userId: both.user.id,
        organisationId: two.organisation!.id,
        assignments: { create: { roleId: (await prisma.role.findFirstOrThrow({ where: { organisationId: two.organisation!.id, presetKey: "staff" } })).id, scopeKey: "*" } },
      },
    })
    const inOne = await resolveGarageAccess(both.user.id, one.garage.id)
    const inTwo = await resolveGarageAccess(both.user.id, two.garage.id)
    expect(inOne.ok && inOne.value.organisation?.id).toBe(one.organisation!.id)
    expect(inTwo.ok && inTwo.value.organisation?.id).toBe(two.organisation!.id)
    // and the permissions follow the business: manager in one, plain staff in two
    expect(inOne.ok && inOne.value.access.permissions.has("pricing.edit")).toBe(true)
    expect(inTwo.ok && inTwo.value.access.permissions.has("pricing.edit")).toBe(false)
  })

  it("refuses an account that isn't a garage login, or is suspended", async () => {
    const b = await makeGarage(PREFIX, { key: "x" })
    await prisma.user.update({ where: { id: b.user.id }, data: { role: "OWNER" } })
    const r = await resolveGarageAccess(b.user.id)
    expect(!r.ok && r.failure.status).toBe(403)
    const suspended = await makeGarage(PREFIX, { key: "sus", userSuspended: true })
    expect((await resolveGarageAccess(suspended.user.id)).ok).toBe(false)
    expect((await resolveGarageAccess("no-such-user")).ok).toBe(false)
  })
})

describe("accessToLocation", () => {
  it("returns access only to a location the person may open, whichever one is 'active'", async () => {
    const b = await makeGarage(PREFIX, { key: "home" })
    const second = await makeLocation(PREFIX, b.organisation!.id, { key: "second" })
    const other = await makeGarage(PREFIX, { key: "other" })
    expect((await accessToLocation(b.user.id, second.id))?.garage.id).toBe(second.id)
    expect((await accessToLocation(b.user.id, b.garage.id))?.garage.id).toBe(b.garage.id)
    expect(await accessToLocation(b.user.id, other.garage.id)).toBeNull()
    expect(await accessToLocation(b.user.id, "does-not-exist")).toBeNull()
  })

  it("is null for a member who isn't assigned to the location", async () => {
    const b = await makeGarage(PREFIX, { key: "home" })
    const second = await makeLocation(PREFIX, b.organisation!.id, { key: "second" })
    const staff = await makeStaff(PREFIX, b.organisation!.id, { role: "staff", locations: [second.id] })
    expect(await accessToLocation(staff.user.id, b.garage.id)).toBeNull()
    expect((await accessToLocation(staff.user.id, second.id))?.garage.id).toBe(second.id)
  })
})

describe("resolveActiveGarage", () => {
  it("honours the x-qmg-location header", async () => {
    const b = await makeGarage(PREFIX, { key: "home" })
    const second = await makeLocation(PREFIX, b.organisation!.id, { key: "second" })
    const r = await resolveActiveGarage(b.user.id, new Request("http://localhost/x", { headers: { "x-qmg-location": second.id } }))
    expect(r.ok && r.value.garage.id).toBe(second.id)
  })
})
