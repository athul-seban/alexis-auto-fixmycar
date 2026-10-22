import { describe, it, expect } from "vitest"
import { LOCATION_PERMISSION_KEYS, ORGANISATION_PERMISSION_KEYS, PERMISSION_KEYS, PERMISSIONS, normalisePermissions } from "@/lib/org/permissions"
import { OWNER_ROLE_KEY, PRESET_ROLES, PRESET_ROLE_KEYS, SYSTEM_ROLES, findPreset, findTemplate, isSystemRoleKey } from "@/lib/org/presets"

const system = (key: string) => SYSTEM_ROLES.find((r) => r.key === key)!
const preset = (key: string) => findPreset(key)!

describe("role templates: integrity", () => {
  it("has unique keys across system roles and presets", () => {
    const keys = [...SYSTEM_ROLES, ...PRESET_ROLES].map((r) => r.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it("stores only valid, fully-expanded permissions (so a copy never needs fixing up)", () => {
    for (const r of [...SYSTEM_ROLES, ...PRESET_ROLES]) {
      expect(r.permissions.length, r.key).toBeGreaterThan(0)
      expect(normalisePermissions(r.permissions), r.key).toEqual([...r.permissions])
    }
  })

  it("gives every template a name, a description and a version", () => {
    for (const r of [...SYSTEM_ROLES, ...PRESET_ROLES]) {
      expect(r.name.length).toBeGreaterThan(2)
      expect(r.description.length).toBeGreaterThan(15)
      expect(r.version).toBeGreaterThanOrEqual(1)
    }
  })

  it("keeps preset keys snake_case and never collides with a system role", () => {
    for (const k of PRESET_ROLE_KEYS) {
      expect(k).toMatch(/^[a-z][a-z_]*$/)
      expect(isSystemRoleKey(k)).toBe(false)
    }
    expect(findTemplate("manager")?.name).toBe("Manager")
    expect(findPreset("manager")).toBeUndefined()
  })

  it("ships the roles the product promises", () => {
    expect(SYSTEM_ROLES.map((r) => r.key)).toEqual(["owner", "manager", "staff"])
    for (const k of ["general_manager", "service_advisor", "receptionist", "technician", "mot_tester", "accounts", "marketing", "auditor", "trainee"]) {
      expect(PRESET_ROLE_KEYS, k).toContain(k)
    }
  })
})

describe("system roles", () => {
  it("Owner has every permission", () => {
    expect(OWNER_ROLE_KEY).toBe("owner")
    expect([...system("owner").permissions]).toEqual(PERMISSION_KEYS)
  })

  it("Manager has every location permission and no business-wide ones", () => {
    expect([...system("manager").permissions]).toEqual(LOCATION_PERMISSION_KEYS)
    for (const k of ORGANISATION_PERMISSION_KEYS) expect(system("manager").permissions).not.toContain(k)
  })

  it("Staff can take bookings and talk to customers, but not change money, people or data exports", () => {
    const p = system("staff").permissions
    for (const k of ["bookings.manage", "customers.view", "messages.reply", "pricing.view"] as const) expect(p).toContain(k)
    for (const k of ["pricing.edit", "bookings.export", "customers.export", "invoices.issue", "insights.view", "staff.manage", "billing.manage", "roles.manage"] as const) {
      expect(p, k).not.toContain(k)
    }
  })
})

describe("preset roles: safe patterns", () => {
  it("only Owner can manage roles or billing; presets never hand those out", () => {
    for (const r of PRESET_ROLES) {
      expect(r.permissions, r.key).not.toContain("roles.manage")
      expect(r.permissions, r.key).not.toContain("billing.manage")
    }
  })

  it("Technician sees only their own jobs: no all-bookings or all-diary access, and no customer data", () => {
    const p = preset("technician").permissions
    expect([...p].sort()).toEqual(["bookings.updateOwn", "bookings.viewOwn", "diary.viewOwn"])
  })

  it("Auditor is read-only: every permission is a view", () => {
    for (const k of preset("auditor").permissions) expect(k.endsWith(".view") || k.endsWith(".viewOwn"), k).toBe(true)
  })

  it("Trainee can see bookings and diary and nothing else", () => {
    expect([...preset("trainee").permissions].sort()).toEqual(["bookings.view", "bookings.viewOwn", "diary.view", "diary.viewOwn"])
  })

  it("Accounts can export and invoice but not change bookings", () => {
    const p = preset("accounts").permissions
    expect(p).toContain("invoices.issue")
    expect(p).toContain("bookings.export")
    expect(p).not.toContain("bookings.manage")
  })

  it("Receptionist can't see prices' edit, exports or other people's data beyond the job", () => {
    const p = preset("receptionist").permissions
    for (const k of ["pricing.edit", "bookings.export", "customers.export", "staff.manage"] as const) expect(p).not.toContain(k)
  })

  it("General manager is the only preset with locations.manage, and it has no more than Owner", () => {
    expect(PRESET_ROLES.filter((r) => r.permissions.includes("locations.manage")).map((r) => r.key)).toEqual(["general_manager"])
    for (const k of preset("general_manager").permissions) expect(PERMISSION_KEYS).toContain(k)
  })

  it("never grants an organisation-wide key that has no matching business-wide purpose for the role", () => {
    // marketing edits the website; accounts/auditor view billing and the log; general manager has its own list
    const orgKeysByPreset = Object.fromEntries(PRESET_ROLES.map((r) => [r.key, r.permissions.filter((k) => PERMISSIONS[k].scope === "organisation")]))
    expect(orgKeysByPreset.marketing).toEqual(["website.edit"])
    expect(orgKeysByPreset.technician).toEqual([])
    expect(orgKeysByPreset.receptionist).toEqual([])
    expect(orgKeysByPreset.service_advisor).toEqual([])
  })
})
