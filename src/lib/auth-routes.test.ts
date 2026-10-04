import { describe, it, expect } from "vitest"
import { roleHome, safeCallbackUrl, isAllowedForRole, postLoginPath } from "@/lib/auth-routes"

describe("roleHome", () => {
  it("maps each role to its dashboard", () => {
    expect(roleHome("ADMIN")).toBe("/admin")
    expect(roleHome("GARAGE")).toBe("/garage-dashboard")
    expect(roleHome("OWNER")).toBe("/dashboard")
  })

  it("defaults to the owner dashboard for unknown or missing roles", () => {
    expect(roleHome(undefined)).toBe("/dashboard")
    expect(roleHome("SOMETHING")).toBe("/dashboard")
  })
})

describe("safeCallbackUrl", () => {
  it("accepts same-origin relative paths", () => {
    expect(safeCallbackUrl("/garage-dashboard/bookings?booking=1")).toBe("/garage-dashboard/bookings?booking=1")
    expect(safeCallbackUrl("/")).toBe("/")
  })

  it("rejects absolute, protocol-relative, backslash and control-char urls", () => {
    expect(safeCallbackUrl("https://evil.com")).toBeNull()
    expect(safeCallbackUrl("//evil.com")).toBeNull()
    expect(safeCallbackUrl("/\\evil.com")).toBeNull()
    expect(safeCallbackUrl("/ok\nSet-Cookie: x")).toBeNull()
    expect(safeCallbackUrl("javascript:alert(1)")).toBeNull()
  })

  it("rejects empty values", () => {
    expect(safeCallbackUrl("")).toBeNull()
    expect(safeCallbackUrl(null)).toBeNull()
    expect(safeCallbackUrl(undefined)).toBeNull()
  })
})

describe("isAllowedForRole", () => {
  it("only lets each role into its own restricted area", () => {
    expect(isAllowedForRole("GARAGE", "/garage-dashboard/bookings")).toBe(true)
    expect(isAllowedForRole("OWNER", "/garage-dashboard")).toBe(false)
    expect(isAllowedForRole("GARAGE", "/dashboard")).toBe(false)
    expect(isAllowedForRole("OWNER", "/dashboard?quote=1")).toBe(true)
    expect(isAllowedForRole("OWNER", "/admin")).toBe(false)
    expect(isAllowedForRole("ADMIN", "/admin")).toBe(true)
  })

  it("allows unrestricted public paths for everyone", () => {
    expect(isAllowedForRole("GARAGE", "/search?service=MOT")).toBe(true)
    expect(isAllowedForRole(undefined, "/compare")).toBe(true)
  })
})

describe("postLoginPath", () => {
  it("encodes a safe callback into the next param", () => {
    expect(postLoginPath("/garage-dashboard/bookings?booking=1")).toBe(
      "/post-login?next=%2Fgarage-dashboard%2Fbookings%3Fbooking%3D1"
    )
  })

  it("drops unsafe or missing callbacks", () => {
    expect(postLoginPath("https://evil.com")).toBe("/post-login")
    expect(postLoginPath(null)).toBe("/post-login")
  })
})
