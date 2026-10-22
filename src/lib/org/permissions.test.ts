import { describe, it, expect } from "vitest"
import {
  IMPLIES,
  LOCATION_PERMISSION_KEYS,
  ORGANISATION_PERMISSION_KEYS,
  PERMISSIONS,
  PERMISSION_GROUPS,
  PERMISSION_KEYS,
  expandPermission,
  isPermissionKey,
  normalisePermissions,
  permissionsFromJson,
  permissionsToJson,
} from "@/lib/org/permissions"

describe("permission catalogue", () => {
  it("describes every permission, in a known group, with exactly one scope", () => {
    for (const k of PERMISSION_KEYS) {
      const p = PERMISSIONS[k]
      expect(p.label.length, k).toBeGreaterThan(2)
      expect(p.description.length, k).toBeGreaterThan(10)
      expect((PERMISSION_GROUPS as readonly string[]).includes(p.group), `${k} group ${p.group}`).toBe(true)
      expect(["location", "organisation"]).toContain(p.scope)
    }
  })

  it("uses dotted lowercase keys and splits cleanly into the two scopes", () => {
    for (const k of PERMISSION_KEYS) expect(k).toMatch(/^[a-z]+\.[a-zA-Z]+$/)
    expect(LOCATION_PERMISSION_KEYS.length + ORGANISATION_PERMISSION_KEYS.length).toBe(PERMISSION_KEYS.length)
    expect(ORGANISATION_PERMISSION_KEYS.sort()).toEqual(["audit.view", "billing.manage", "billing.view", "locations.manage", "organisation.edit", "roles.manage", "website.edit"])
  })

  it("never lets a location-scope permission imply an organisation-scope one (that would leak business-wide rights)", () => {
    for (const [from, tos] of Object.entries(IMPLIES)) {
      for (const to of tos ?? []) {
        if (PERMISSIONS[from as keyof typeof PERMISSIONS].scope === "location") expect(PERMISSIONS[to].scope, `${from} -> ${to}`).toBe("location")
      }
    }
  })

  it("only implies keys that exist, never itself, and has no cycles", () => {
    for (const [from, tos] of Object.entries(IMPLIES)) {
      expect(isPermissionKey(from)).toBe(true)
      for (const to of tos ?? []) {
        expect(isPermissionKey(to), `${from} -> ${to}`).toBe(true)
        expect(to).not.toBe(from)
      }
    }
    // A cycle would still terminate in expandPermission, but would mean two keys are secretly the same permission.
    for (const k of PERMISSION_KEYS) {
      for (const implied of expandPermission(k)) {
        if (implied !== k) expect(expandPermission(implied), `${k} <-> ${implied}`).not.toContain(k)
      }
    }
  })
})

describe("expandPermission and normalisePermissions", () => {
  it("expands transitively and includes the key itself", () => {
    expect(expandPermission("bookings.manage").sort()).toEqual(["bookings.manage", "bookings.updateOwn", "bookings.view", "bookings.viewOwn"])
    expect(expandPermission("invoices.issue").sort()).toEqual(["bookings.view", "bookings.viewOwn", "invoices.issue"])
    expect(expandPermission("billing.manage").sort()).toEqual(["billing.manage", "billing.view"])
    expect(expandPermission("pricing.view")).toEqual(["pricing.view"])
  })

  it("drops unknown keys, de-duplicates and sorts in catalogue order", () => {
    const out = normalisePermissions(["nope", "pricing.edit", 42, null, "pricing.view", "bookings.view", "bookings.view"])
    expect(out).toEqual(["bookings.view", "bookings.viewOwn", "pricing.view", "pricing.edit"])
  })

  it("is idempotent: normalising twice changes nothing", () => {
    for (const k of PERMISSION_KEYS) {
      const once = normalisePermissions([k])
      expect(normalisePermissions(once)).toEqual(once)
    }
  })

  it("isn't fooled by prototype keys", () => {
    for (const k of ["__proto__", "constructor", "toString", "hasOwnProperty"]) expect(isPermissionKey(k)).toBe(false)
    expect(normalisePermissions(["__proto__", "constructor"])).toEqual([])
  })
})

describe("JSON storage", () => {
  it("round-trips", () => {
    const json = permissionsToJson(["staff.manage", "pricing.edit"])
    expect(permissionsFromJson(json)).toEqual(["pricing.view", "pricing.edit", "staff.manage"])
  })

  it("is tolerant of bad data instead of throwing", () => {
    for (const bad of [null, undefined, "", "not json", "{}", '"x"', "42", "[1,2,3]", '["nope"]']) {
      expect(permissionsFromJson(bad as string)).toEqual([])
    }
    expect(permissionsFromJson('["pricing.view","nope"]')).toEqual(["pricing.view"])
  })
})
