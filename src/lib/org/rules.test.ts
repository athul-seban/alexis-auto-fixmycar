import { describe, it, expect } from "vitest"
import { ALL_LOCATIONS, type AssignmentLike, type RoleLike } from "@/lib/org/access"
import { permissionsToJson, type PermissionKey } from "@/lib/org/permissions"
import { PRESET_ROLES, SYSTEM_ROLES } from "@/lib/org/presets"
import { actorPower, assignmentProblem, isOwnerRole, legacyPower, roleDefinitionProblem, roleNameProblem, selfChangeProblem } from "@/lib/org/rules"

const LEEDS = "garage-leeds"
const YORK = "garage-york"

const tpl = (key: string) => [...SYSTEM_ROLES, ...PRESET_ROLES].find((r) => r.key === key)!
const role = (key: string, over: Partial<RoleLike> = {}): RoleLike => ({
  id: `role-${key}`,
  presetKey: key,
  isSystem: SYSTEM_ROLES.some((r) => r.key === key),
  isEnabled: true,
  permissions: permissionsToJson(tpl(key).permissions),
  ...over,
})
const custom = (id: string, perms: PermissionKey[]): RoleLike => ({ id, presetKey: null, isSystem: false, isEnabled: true, permissions: permissionsToJson(perms) })
const at = (r: RoleLike, scopeKey: string): AssignmentLike => ({ roleId: r.id, scopeKey })

const owner = role("owner")
const manager = role("manager")
const staff = role("staff")
const people = role("people_manager")
const generalManager = role("general_manager")
const ROLES = [owner, manager, staff, people, generalManager, role("accounts"), role("technician")]

const power = (...a: AssignmentLike[]) => actorPower(a, ROLES)

describe("actorPower", () => {
  it("an Owner holds everything everywhere", () => {
    const p = power(at(owner, ALL_LOCATIONS))
    expect(p.isOwner).toBe(true)
    expect(p.ceiling.has("billing.manage")).toBe(true)
    expect(p.at(YORK).has("pricing.edit")).toBe(true)
  })

  it("a manager at one location has a ceiling of nothing (no business-wide role) but full power there", () => {
    const p = power(at(manager, LEEDS))
    expect(p.isOwner).toBe(false)
    expect(p.ceiling.size).toBe(0)
    expect(p.at(LEEDS).has("staff.manage")).toBe(true)
    expect(p.at(YORK).size).toBe(0)
  })

  it("a legacy owner holds everything", () => {
    const p = legacyPower()
    expect(p.isOwner && p.ceiling.has("roles.manage") && p.at("anything").has("billing.manage")).toBe(true)
  })
})

describe("roleDefinitionProblem: no escalation when defining a role", () => {
  it("an Owner can define any role", () => {
    expect(roleDefinitionProblem(power(at(owner, ALL_LOCATIONS)), ["billing.manage", "roles.manage", "pricing.edit"])).toBeNull()
  })

  it("needs roles.manage, which only a business-wide role can carry", () => {
    expect(roleDefinitionProblem(power(at(manager, LEEDS)), ["pricing.view"])).toMatch(/permission to manage roles/)
    expect(roleDefinitionProblem(power(at(staff, ALL_LOCATIONS)), ["pricing.view"])).toMatch(/permission to manage roles/)
  })

  it("someone holding roles.manage can't give a role anything they lack", () => {
    const rolesAdmin = custom("roles-admin", ["roles.manage", "pricing.view", "pricing.edit"])
    const p = actorPower([at(rolesAdmin, ALL_LOCATIONS)], [rolesAdmin])
    expect(roleDefinitionProblem(p, ["pricing.view", "pricing.edit"])).toBeNull()
    expect(roleDefinitionProblem(p, ["pricing.edit", "billing.manage", "customers.export"])).toMatch(/don't have yourself: .*billing.*export/)
  })

  it("rejects an escalation hidden inside an otherwise fine role", () => {
    const rolesAdmin = custom("roles-admin", ["roles.manage", "bookings.view"])
    const p = actorPower([at(rolesAdmin, ALL_LOCATIONS)], [rolesAdmin])
    expect(roleDefinitionProblem(p, ["bookings.view", "roles.manage"])).toBeNull() // may pass on what they hold, roles.manage included
    expect(roleDefinitionProblem(p, ["bookings.view", "staff.manage"])).not.toBeNull()
  })
})

describe("assignmentProblem: handing a role to someone", () => {
  it("the Owner role needs an Owner, and only ever everywhere", () => {
    const o = power(at(owner, ALL_LOCATIONS))
    expect(assignmentProblem(o, owner, ALL_LOCATIONS)).toBeNull()
    expect(assignmentProblem(o, owner, LEEDS)).toMatch(/whole business/)
    expect(assignmentProblem(power(at(generalManager, ALL_LOCATIONS)), owner, ALL_LOCATIONS)).toMatch(/Only an Owner/)
    expect(assignmentProblem(power(at(manager, LEEDS)), owner, LEEDS)).toMatch(/Only an Owner/)
  })

  it("a location manager can hand out roles at their location, not elsewhere", () => {
    const p = power(at(manager, LEEDS))
    expect(assignmentProblem(p, staff, LEEDS)).toBeNull()
    expect(assignmentProblem(p, manager, LEEDS)).toBeNull() // a peer manager: same permissions
    expect(assignmentProblem(p, staff, YORK)).toMatch(/permission to manage staff at that location/)
    expect(assignmentProblem(p, staff, ALL_LOCATIONS)).toMatch(/at all locations/)
  })

  it("can't hand out a role stronger than your own at that place", () => {
    const p = power(at(role("people_manager"), LEEDS)) // staff.manage, bookings.view, diary.view
    expect(assignmentProblem(p, role("trainee", { id: "role-trainee" }), LEEDS)).toBeNull() // bookings + diary view: within it
    expect(assignmentProblem(p, staff, LEEDS)).toMatch(/don't hold at that location/) // staff can manage bookings: more than a people manager
    expect(assignmentProblem(p, manager, LEEDS)).not.toBeNull()
  })

  it("a role's business-wide permissions are inert at one location, so they don't count against you there", () => {
    // general_manager includes locations.manage / website.edit, which only apply from an all-locations assignment
    const mgr = power(at(manager, LEEDS))
    expect(assignmentProblem(mgr, generalManager, LEEDS)).toBeNull()
    expect(assignmentProblem(mgr, generalManager, ALL_LOCATIONS)).not.toBeNull()
  })

  it("assigning everywhere needs the permissions everywhere", () => {
    const everywhere = power(at(generalManager, ALL_LOCATIONS))
    expect(assignmentProblem(everywhere, staff, ALL_LOCATIONS)).toBeNull()
    expect(assignmentProblem(everywhere, generalManager, ALL_LOCATIONS)).toBeNull()
    const atOne = power(at(manager, LEEDS), at(staff, YORK))
    expect(assignmentProblem(atOne, staff, ALL_LOCATIONS)).not.toBeNull()
  })

  it("a switched-off role can't be given out, but can be taken away", () => {
    const off = { ...staff, isEnabled: false }
    const p = power(at(manager, LEEDS))
    expect(assignmentProblem(p, off, LEEDS)).toMatch(/switched off/)
    expect(assignmentProblem(p, off, LEEDS, { removing: true })).toBeNull()
  })

  it("someone without staff.manage can't do any of it", () => {
    const p = power(at(staff, LEEDS))
    expect(assignmentProblem(p, staff, LEEDS)).toMatch(/permission to manage staff/)
  })

  it("holding the right role at two locations lets you manage both, separately", () => {
    const p = power(at(manager, LEEDS), at(staff, YORK))
    expect(assignmentProblem(p, staff, LEEDS)).toBeNull()
    expect(assignmentProblem(p, staff, YORK)).toMatch(/permission to manage staff/)
  })

  it("can't remove someone above you: removing needs the same power as granting", () => {
    const p = power(at(people, LEEDS))
    expect(assignmentProblem(p, manager, LEEDS, { removing: true })).not.toBeNull()
    expect(assignmentProblem(power(at(manager, LEEDS)), manager, LEEDS, { removing: true })).toBeNull()
  })

  it("a custom role named 'owner' is not the Owner role", () => {
    const fake = { ...custom("fake", ["pricing.view"]), presetKey: "owner" }
    expect(isOwnerRole(fake)).toBe(false)
    expect(assignmentProblem(power(at(manager, LEEDS)), fake, LEEDS)).toBeNull()
  })
})

describe("selfChangeProblem and roleNameProblem", () => {
  it("nobody changes their own access", () => {
    expect(selfChangeProblem("u1", "u1")).toMatch(/can't change your own/)
    expect(selfChangeProblem("u1", "u2")).toBeNull()
  })

  it("role names are tidy and unique within the business (case-insensitively)", () => {
    const existing = [{ id: "a", name: "Front Desk" }, { id: "b", name: "Mechanic" }]
    expect(roleNameProblem("Service Lead", existing)).toBeNull()
    expect(roleNameProblem("  Service Lead  ", existing)).toBeNull()
    expect(roleNameProblem("front desk", existing)).toMatch(/already exists/)
    expect(roleNameProblem("Front Desk", existing, "a")).toBeNull() // renaming a role to itself is fine
    expect(roleNameProblem("x", existing)).toMatch(/at least 2/)
    expect(roleNameProblem("y".repeat(61), existing)).toMatch(/at most 60/)
    expect(roleNameProblem("<script>", existing)).toMatch(/aren't allowed/)
    expect(roleNameProblem("line\nbreak", existing)).toMatch(/aren't allowed/)
  })
})
