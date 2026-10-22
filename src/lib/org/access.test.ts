import { describe, it, expect } from "vitest"
import { ALL_LOCATIONS, accessibleLocations, can, canAccessLocation, canAll, canAny, computeAccess, permissionList, type AssignmentLike, type RoleLike } from "@/lib/org/access"
import { PERMISSION_KEYS, permissionsToJson, type PermissionKey } from "@/lib/org/permissions"
import { PRESET_ROLES, SYSTEM_ROLES } from "@/lib/org/presets"

const LEEDS = "garage-leeds"
const YORK = "garage-york"

const roleFrom = (key: string, over: Partial<RoleLike> = {}): RoleLike => {
  const tpl = [...SYSTEM_ROLES, ...PRESET_ROLES].find((r) => r.key === key)!
  const isSystem = SYSTEM_ROLES.some((r) => r.key === key)
  return { id: `role-${key}`, presetKey: key, isSystem, isEnabled: true, permissions: permissionsToJson(tpl.permissions), ...over }
}
const custom = (id: string, perms: PermissionKey[], over: Partial<RoleLike> = {}): RoleLike => ({ id, presetKey: null, isSystem: false, isEnabled: true, permissions: permissionsToJson(perms), ...over })
const at = (key: string, scopeKey: string): AssignmentLike => ({ roleId: `role-${key}`, scopeKey })

const ROLES = [roleFrom("owner"), roleFrom("manager"), roleFrom("staff"), roleFrom("accounts"), roleFrom("technician"), roleFrom("general_manager")]

describe("computeAccess: owner", () => {
  it("an Owner holding the role everywhere has every permission at any location", () => {
    const a = computeAccess([at("owner", ALL_LOCATIONS)], ROLES, YORK)
    expect(a.isOwner).toBe(true)
    expect(a.locations).toBe("all")
    expect(permissionList(a)).toEqual(PERMISSION_KEYS)
  })

  it("ignores whatever is stored in the Owner role's permissions: it always grants everything", () => {
    const hollow = [roleFrom("owner", { permissions: "[]" })]
    expect(permissionList(computeAccess([at("owner", ALL_LOCATIONS)], hollow, LEEDS))).toEqual(PERMISSION_KEYS)
  })

  it("an Owner role held at ONE location grants that location's keys but no business-wide ones", () => {
    const a = computeAccess([at("owner", LEEDS)], ROLES, LEEDS)
    expect(a.isOwner).toBe(false)
    expect(can(a, "bookings.manage")).toBe(true)
    expect(can(a, "billing.manage")).toBe(false)
    expect(can(a, "roles.manage")).toBe(false)
    expect(computeAccess([at("owner", LEEDS)], ROLES, YORK).permissions.size).toBe(0)
  })
})

describe("computeAccess: scope", () => {
  it("a role at one location grants nothing at another", () => {
    const assigned = [at("manager", LEEDS)]
    expect(can(computeAccess(assigned, ROLES, LEEDS), "bookings.manage")).toBe(true)
    expect(computeAccess(assigned, ROLES, YORK).permissions.size).toBe(0)
  })

  it("can be Manager at Leeds and Staff at York at the same time", () => {
    const assigned = [at("manager", LEEDS), at("staff", YORK)]
    expect(can(computeAccess(assigned, ROLES, LEEDS), "pricing.edit")).toBe(true)
    expect(can(computeAccess(assigned, ROLES, YORK), "pricing.edit")).toBe(false)
    expect(can(computeAccess(assigned, ROLES, YORK), "bookings.manage")).toBe(true)
  })

  it("a role held at ALL locations covers locations added later", () => {
    const assigned = [at("manager", ALL_LOCATIONS)]
    expect(can(computeAccess(assigned, ROLES, "a-brand-new-location"), "bookings.manage")).toBe(true)
  })

  it("business-wide keys count only from an all-locations assignment (regression: a manager must not gain billing)", () => {
    const atOne = computeAccess([at("general_manager", LEEDS)], ROLES, LEEDS)
    expect(can(atOne, "bookings.manage")).toBe(true)
    expect(can(atOne, "locations.manage")).toBe(false)
    expect(can(atOne, "website.edit")).toBe(false)
    expect(can(atOne, "billing.view")).toBe(false)

    const everywhere = computeAccess([at("general_manager", ALL_LOCATIONS)], ROLES, LEEDS)
    expect(can(everywhere, "locations.manage")).toBe(true)
    expect(can(everywhere, "website.edit")).toBe(true)
    expect(can(everywhere, "billing.view")).toBe(true)
    expect(can(everywhere, "billing.manage")).toBe(false)
    expect(everywhere.isOwner).toBe(false)
  })

  it("combines permissions from several roles at the same location", () => {
    const a = computeAccess([at("staff", LEEDS), at("accounts", LEEDS)], ROLES, LEEDS)
    expect(can(a, "bookings.manage")).toBe(true)
    expect(can(a, "invoices.issue")).toBe(true)
    expect(can(a, "bookings.export")).toBe(true)
    expect(can(a, "pricing.edit")).toBe(false)
  })
})

describe("computeAccess: disabled, missing and odd roles", () => {
  it("a disabled role grants nothing", () => {
    const roles = [roleFrom("manager", { isEnabled: false })]
    expect(computeAccess([at("manager", ALL_LOCATIONS)], roles, LEEDS).permissions.size).toBe(0)
  })

  it("an assignment whose role is missing grants nothing and doesn't throw", () => {
    expect(computeAccess([{ roleId: "ghost", scopeKey: ALL_LOCATIONS }], ROLES, LEEDS).permissions.size).toBe(0)
  })

  it("no assignments means no access", () => {
    const a = computeAccess([], ROLES, LEEDS)
    expect(a.permissions.size).toBe(0)
    expect(a.locations).toEqual([])
    expect(a.isOwner).toBe(false)
  })

  it("a custom role named 'owner' is not the Owner role (only the system role is)", () => {
    const fake = custom("role-owner", ["pricing.view"], { presetKey: "owner", isSystem: false })
    const a = computeAccess([{ roleId: "role-owner", scopeKey: ALL_LOCATIONS }], [fake], LEEDS)
    expect(a.isOwner).toBe(false)
    expect(permissionList(a)).toEqual(["pricing.view"])
  })

  it("ignores unknown or tampered permission strings in a stored role", () => {
    const messy = custom("role-messy", [], { permissions: '["pricing.view","admin.everything","__proto__"]' })
    const a = computeAccess([{ roleId: "role-messy", scopeKey: ALL_LOCATIONS }], [messy], LEEDS)
    expect(permissionList(a)).toEqual(["pricing.view"])
  })

  it("a technician has only own-job access", () => {
    const a = computeAccess([at("technician", LEEDS)], ROLES, LEEDS)
    expect(permissionList(a)).toEqual(["bookings.viewOwn", "bookings.updateOwn", "diary.viewOwn"])
    expect(can(a, "bookings.view")).toBe(false)
    expect(can(a, "customers.view")).toBe(false)
  })
})

describe("locations", () => {
  it("lists the locations someone can open", () => {
    expect(accessibleLocations([at("staff", ALL_LOCATIONS)])).toBe("all")
    expect(accessibleLocations([at("staff", ALL_LOCATIONS), at("manager", LEEDS)])).toBe("all")
    expect((accessibleLocations([at("staff", LEEDS), at("manager", LEEDS), at("staff", YORK)]) as string[]).sort()).toEqual([LEEDS, YORK])
    expect(accessibleLocations([])).toEqual([])
  })

  it("can open a location only if assigned there or everywhere", () => {
    expect(canAccessLocation([at("staff", LEEDS)], LEEDS)).toBe(true)
    expect(canAccessLocation([at("staff", LEEDS)], YORK)).toBe(false)
    expect(canAccessLocation([at("staff", ALL_LOCATIONS)], YORK)).toBe(true)
    expect(canAccessLocation([], YORK)).toBe(false)
  })
})

describe("can / canAll / canAny", () => {
  const a = computeAccess([at("staff", LEEDS)], ROLES, LEEDS)
  it("checks single, all-of and any-of requirements", () => {
    expect(can(a, "messages.reply")).toBe(true)
    expect(canAll(a, ["messages.reply", "bookings.manage"])).toBe(true)
    expect(canAll(a, ["messages.reply", "pricing.edit"])).toBe(false)
    expect(canAny(a, ["pricing.edit", "messages.reply"])).toBe(true)
    expect(canAny(a, ["pricing.edit", "invoices.issue"])).toBe(false)
    expect(canAny(a, [])).toBe(false)
    expect(canAll(a, [])).toBe(true)
  })
})
