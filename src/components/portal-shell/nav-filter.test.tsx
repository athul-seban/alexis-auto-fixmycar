import { describe, expect, it } from "vitest"
import { PERMISSION_KEYS } from "@/lib/org/permissions"
import { ADMIN_NAV, GARAGE_NAV } from "./nav"
import { filterNav, isPageAllowed, meets, type PortalAccess } from "./nav-filter"

const G = "/garage-dashboard"
const allOn = { staff: true, locations: true, sites: true }
const access = (permissions: readonly string[], features = allOn): PortalAccess => ({ permissions, features, isOwner: false })
const labels = (nav: ReturnType<typeof filterNav>) => nav.sections.flatMap((s) => s.items.map((i) => i.label))

describe("meets", () => {
  it("treats no requirement as open, a key as needed, and anyOf as any one", () => {
    expect(meets([], undefined)).toBe(true)
    expect(meets(["a"], "bookings.view")).toBe(false)
    expect(meets(["bookings.view"], "bookings.view")).toBe(true)
    expect(meets(["diary.viewOwn"], { anyOf: ["diary.view", "diary.viewOwn"] })).toBe(true)
    expect(meets([], { anyOf: ["diary.view", "diary.viewOwn"] })).toBe(false)
  })
})

describe("filterNav", () => {
  it("leaves the nav alone when there is no access info (admin and customer portals)", () => {
    expect(filterNav(ADMIN_NAV, undefined)).toBe(ADMIN_NAV)
  })

  it("shows an owner every page", () => {
    const nav = filterNav(GARAGE_NAV, access(PERMISSION_KEYS))
    expect(labels(nav)).toEqual(GARAGE_NAV.sections.flatMap((s) => s.items.map((i) => i.label)))
    expect(nav.settingsHref).toBe(`${G}/settings`)
  })

  it("shows a front-desk role only what it can use, and drops sections left empty", () => {
    const nav = filterNav(GARAGE_NAV, access(["bookings.view", "bookings.viewOwn", "messages.view"]))
    expect(labels(nav)).toEqual(["Dashboard", "Bookings", "Messages"])
    expect(nav.sections.map((s) => s.label)).toEqual([undefined])
    expect(nav.settingsHref).toBeUndefined()
  })

  it("shows a technician their dashboard, diary and own bookings, and nothing about the business", () => {
    const nav = filterNav(GARAGE_NAV, access(["bookings.viewOwn", "bookings.updateOwn", "diary.viewOwn"]))
    expect(labels(nav)).toEqual(["Dashboard", "Diary", "Bookings"])
  })

  it("hides Team, Roles, Business details and Activity while staff management is off, even for an owner", () => {
    const nav = filterNav(GARAGE_NAV, access(PERMISSION_KEYS, { staff: false, locations: true, sites: false }))
    expect(labels(nav)).not.toContain("Team")
    expect(labels(nav)).not.toContain("Roles")
    expect(labels(nav)).not.toContain("Business details")
    expect(labels(nav)).not.toContain("Activity")
    expect(labels(nav)).toContain("Locations")
    const off = filterNav(GARAGE_NAV, access(PERMISSION_KEYS, { staff: false, locations: false, sites: false }))
    expect(off.sections.map((s) => s.label)).not.toContain("Business")
  })

  it("shows Roles to someone who can manage staff (they need the list to invite) but Team only with staff.manage", () => {
    expect(labels(filterNav(GARAGE_NAV, access(["staff.manage"])))).toEqual(expect.arrayContaining(["Team", "Roles"]))
    const rolesOnly = labels(filterNav(GARAGE_NAV, access(["roles.manage"])))
    expect(rolesOnly).toContain("Roles")
    expect(rolesOnly).not.toContain("Team")
  })

  it("does not change the original nav", () => {
    const before = JSON.stringify(GARAGE_NAV.sections.map((s) => s.items.map((i) => i.href)))
    filterNav(GARAGE_NAV, access([]))
    expect(JSON.stringify(GARAGE_NAV.sections.map((s) => s.items.map((i) => i.href)))).toBe(before)
  })
})

describe("isPageAllowed", () => {
  const tech = access(["bookings.viewOwn", "bookings.updateOwn", "diary.viewOwn"])

  it("refuses a page the person has no permission for, including its sub-pages", () => {
    expect(isPageAllowed(`${G}/billing`, GARAGE_NAV, tech)).toBe(false)
    expect(isPageAllowed(`${G}/customers`, GARAGE_NAV, tech)).toBe(false)
    expect(isPageAllowed(`${G}/team`, GARAGE_NAV, access(["staff.manage"], { ...allOn, staff: false }))).toBe(false)
    expect(isPageAllowed(`${G}/insights`, GARAGE_NAV, tech)).toBe(false)
    expect(isPageAllowed(`${G}/settings`, GARAGE_NAV, tech)).toBe(false)
  })

  it("allows the pages they can use, and sub-pages follow their parent", () => {
    expect(isPageAllowed(`${G}/bookings`, GARAGE_NAV, tech)).toBe(true)
    expect(isPageAllowed(`${G}/bookings/abc123/job-sheet`, GARAGE_NAV, tech)).toBe(true)
    expect(isPageAllowed(`${G}/insights`, GARAGE_NAV, access(["insights.view"]))).toBe(true)
  })

  it("allows the home page, the account page and pages the nav doesn't know about", () => {
    expect(isPageAllowed(G, GARAGE_NAV, access([]))).toBe(true)
    expect(isPageAllowed(`${G}/account`, GARAGE_NAV, access([]))).toBe(true)
    expect(isPageAllowed(`${G}/something-new`, GARAGE_NAV, access([]))).toBe(true)
  })

  it("allows everything when there is no access info", () => {
    expect(isPageAllowed(`${G}/billing`, GARAGE_NAV, undefined)).toBe(true)
  })
})
