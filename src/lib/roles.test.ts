import { describe, it, expect } from "vitest"
import { isAdmin, isSuperAdmin, ROLES } from "@/lib/roles"

describe("roles", () => {
  it("treats SUPER_ADMIN as an admin too, but not the other way round", () => {
    expect(isAdmin("ADMIN")).toBe(true)
    expect(isAdmin("SUPER_ADMIN")).toBe(true)
    expect(isSuperAdmin("SUPER_ADMIN")).toBe(true)
    expect(isSuperAdmin("ADMIN")).toBe(false)
  })

  it("denies customers, garages and anything missing or unknown", () => {
    for (const r of ["OWNER", "GARAGE", "admin", "super_admin", "", null, undefined]) {
      expect(isAdmin(r)).toBe(false)
      expect(isSuperAdmin(r)).toBe(false)
    }
  })

  it("lists the four roles", () => {
    expect([...ROLES]).toEqual(["OWNER", "GARAGE", "ADMIN", "SUPER_ADMIN"])
  })
})
