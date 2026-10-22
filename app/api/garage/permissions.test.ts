import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff, makeWalkInBooking } from "@/test/fixtures"
import { PRESET_ROLES } from "@/lib/org/presets"
import { permissionsToJson } from "@/lib/org/permissions"

import { GET as pricingGet, PUT as pricingPut } from "./pricing/route"
import { GET as billingGet, POST as billingPost } from "./billing/route"
import { GET as insightsGet } from "./insights/route"
import { GET as bookingsGet, POST as bookingsPost } from "./bookings/route"
import { GET as customersGet } from "./customers/route"
import { GET as diaryGet } from "./diary/route"
import { POST as blocksPost } from "./diary/blocks/route"
import { GET as techniciansGet, POST as techniciansPost } from "./technicians/route"
import { GET as documentsGet } from "./documents/route"
import { POST as connectPost } from "./stripe/connect/route"
import { PATCH as settingsPatch } from "./settings/route"
import { GET as reviewsGet } from "./reviews/route"
import { GET as enquiriesGet } from "./enquiries/route"
import { GET as overviewGet } from "./overview/route"
import { GET as meGet } from "./me/route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "permmatrix-"
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as never)
const url = (p: string, init?: RequestInit, location?: string) =>
  new Request(`http://localhost/api/garage/${p}`, { ...init, headers: { "Content-Type": "application/json", ...(location ? { "x-qmg-location": location } : {}), ...(init?.headers ?? {}) } })
const send = (method: string, body: unknown = {}) => ({ method, body: JSON.stringify(body) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function business() {
  const biz = await makeGarage(PREFIX, { key: "leeds" })
  const roles = await Promise.all(
    PRESET_ROLES.filter((r) => ["auditor", "trainee", "accounts"].includes(r.key)).map((r) =>
      prisma.role.create({ data: { organisationId: biz.organisation!.id, presetKey: r.key, name: r.name, permissions: permissionsToJson(r.permissions), presetVersion: r.version } })
    )
  )
  return { ...biz, roleKeys: roles.map((r) => r.presetKey) }
}

const status = async (res: Response | Promise<Response>) => (await res).status

describe("a Staff member (bookings, diary view, customer view, messages, enquiries view, pricing view)", () => {
  it("can use the day-to-day screens", async () => {
    const b = await business()
    const staff = await makeStaff(PREFIX, b.organisation!.id, { role: "staff" })
    await makeWalkInBooking(b.garage.id)
    as(staff.user.id)

    expect(await status(bookingsGet(url("bookings")))).toBe(200)
    expect(await status(customersGet(url("customers")))).toBe(200)
    expect(await status(diaryGet(url(`diary?from=2026-01-01&to=2026-01-07`)))).not.toBe(403)
    expect(await status(pricingGet(url("pricing")))).toBe(200)
    expect(await status(reviewsGet(url("reviews")))).toBe(200)
    expect(await status(enquiriesGet(url("enquiries")))).toBe(200)
    expect(await status(techniciansGet(url("technicians")))).toBe(200)
    expect(await status(overviewGet(url("overview")))).toBe(200)
    expect(await status(meGet(url("me")))).toBe(200)
  })

  it("can't change prices, see billing or reports, manage the team, or change settings (403 FORBIDDEN)", async () => {
    const b = await business()
    const staff = await makeStaff(PREFIX, b.organisation!.id, { role: "staff" })
    as(staff.user.id)

    const attempts: [string, Promise<Response>][] = [
      ["pricing PUT", pricingPut(url("pricing", send("PUT", { prices: [] })))],
      ["billing GET", billingGet(url("billing"))],
      ["billing POST", billingPost(url("billing", send("POST", {})))],
      ["insights GET", insightsGet(url("insights"))],
      ["technicians POST", techniciansPost(url("technicians", send("POST", { name: "X" })))],
      ["documents GET", documentsGet(url("documents"))],
      ["stripe connect POST", connectPost(url("stripe/connect", send("POST", {})))],
      ["settings PATCH", settingsPatch(url("settings", send("PATCH", {})))],
      ["diary block POST", blocksPost(url("diary/blocks", send("POST", {})))],
    ]
    for (const [what, res] of attempts) {
      const r = await res
      expect(r.status, what).toBe(403)
      expect((await r.json()).code, what).toBe("FORBIDDEN")
    }
  })

  it("can't download the booking or customer lists as a spreadsheet, though it can view them", async () => {
    const b = await business()
    const staff = await makeStaff(PREFIX, b.organisation!.id, { role: "staff" })
    as(staff.user.id)
    expect(await status(bookingsGet(url("bookings?format=csv")))).toBe(403)
    expect(await status(customersGet(url("customers?format=csv")))).toBe(403)
    expect(await status(bookingsGet(url("bookings")))).toBe(200)
    expect(await status(customersGet(url("customers")))).toBe(200)
  })

  it("an Accounts person CAN export (with the permission) but can't create bookings", async () => {
    const b = await business()
    const accounts = await makeStaff(PREFIX, b.organisation!.id, { role: "accounts" })
    as(accounts.user.id)
    expect(await status(bookingsGet(url("bookings?format=csv")))).toBe(200)
    expect(await status(customersGet(url("customers?format=csv")))).toBe(200)
    expect(await status(bookingsPost(url("bookings", send("POST", {}))))).toBe(403)
  })
})

describe("read-only and trainee roles", () => {
  it("a Trainee sees bookings and the diary only", async () => {
    const b = await business()
    const trainee = await makeStaff(PREFIX, b.organisation!.id, { role: "trainee" })
    as(trainee.user.id)
    expect(await status(bookingsGet(url("bookings")))).toBe(200)
    expect(await status(diaryGet(url("diary?from=2026-01-01&to=2026-01-07")))).not.toBe(403)
    for (const res of [customersGet(url("customers")), pricingGet(url("pricing")), reviewsGet(url("reviews")), enquiriesGet(url("enquiries")), insightsGet(url("insights")), billingGet(url("billing"))]) {
      expect(await status(res)).toBe(403)
    }
    expect(await status(bookingsPost(url("bookings", send("POST", {}))))).toBe(403)
  })

  it("an Auditor can read across the portal but every write is refused", async () => {
    const b = await business()
    const auditor = await makeStaff(PREFIX, b.organisation!.id, { role: "auditor" })
    as(auditor.user.id)
    for (const res of [bookingsGet(url("bookings")), customersGet(url("customers")), pricingGet(url("pricing")), insightsGet(url("insights")), billingGet(url("billing"))]) {
      expect(await status(res)).toBe(200)
    }
    for (const res of [
      bookingsPost(url("bookings", send("POST", {}))),
      pricingPut(url("pricing", send("PUT", { prices: [] }))),
      techniciansPost(url("technicians", send("POST", { name: "x" }))),
      billingPost(url("billing", send("POST", {}))),
      bookingsGet(url("bookings?format=csv")),
    ]) {
      expect(await status(res)).toBe(403)
    }
  })
})

describe("locations", () => {
  it("a member of one location acts only on that location, even if they ask for another", async () => {
    const b = await business()
    const york = await makeLocation(PREFIX, b.organisation!.id, { key: "york" })
    const yorkBooking = await makeWalkInBooking(york.id, { customerName: "York Customer" })
    const leedsBooking = await makeWalkInBooking(b.garage.id, { customerName: "Leeds Customer" })
    const mgr = await makeStaff(PREFIX, b.organisation!.id, { role: "manager", locations: [york.id] })
    as(mgr.user.id)

    // asking for Leeds quietly gives them York (the only place they work); Leeds data never appears
    const res = await bookingsGet(url("bookings", undefined, b.garage.id))
    const body = JSON.stringify(await res.json())
    expect(body).toContain(yorkBooking.reference)
    expect(body).not.toContain(leedsBooking.reference)
  })

  it("a member of all locations sees whichever location they pick, and only that one", async () => {
    const b = await business()
    const york = await makeLocation(PREFIX, b.organisation!.id, { key: "york" })
    const yorkBooking = await makeWalkInBooking(york.id)
    const leedsBooking = await makeWalkInBooking(b.garage.id)
    as(b.user.id) // the owner

    const atYork = JSON.stringify(await (await bookingsGet(url("bookings", undefined, york.id))).json())
    expect(atYork).toContain(yorkBooking.reference)
    expect(atYork).not.toContain(leedsBooking.reference)

    const atLeeds = JSON.stringify(await (await bookingsGet(url("bookings", undefined, b.garage.id))).json())
    expect(atLeeds).toContain(leedsBooking.reference)
    expect(atLeeds).not.toContain(yorkBooking.reference)
  })

  it("someone from a different business can never reach this business's location by asking for it", async () => {
    const mine = await makeGarage(PREFIX, { key: "mine" })
    const theirs = await makeGarage(PREFIX, { key: "theirs" })
    const theirBooking = await makeWalkInBooking(theirs.garage.id)
    as(mine.user.id)
    const body = JSON.stringify(await (await bookingsGet(url("bookings", undefined, theirs.garage.id))).json())
    expect(body).not.toContain(theirBooking.reference)
  })

  it("a role held at one location doesn't give business-wide rights (billing stays with the owner)", async () => {
    const b = await business()
    const mgr = await makeStaff(PREFIX, b.organisation!.id, { permissions: ["bookings.manage", "billing.view", "billing.manage"], locations: [b.garage.id] })
    as(mgr.user.id)
    expect(await status(bookingsGet(url("bookings")))).toBe(200)
    expect(await status(billingGet(url("billing")))).toBe(403)
    expect(await status(billingPost(url("billing", send("POST", {}))))).toBe(403)
  })
})

describe("what the browser is told", () => {
  it("/me returns the caller's permissions and locations, never another member's", async () => {
    const b = await business()
    const staff = await makeStaff(PREFIX, b.organisation!.id, { role: "staff" })
    as(staff.user.id)
    const me = await (await meGet(url("me"))).json()
    expect(me.isOwner).toBe(false)
    expect(me.permissions).toContain("bookings.manage")
    expect(me.permissions).not.toContain("pricing.edit")
    expect(me.permissions).not.toContain("billing.manage")
    expect(me.organisation).toEqual({ id: b.organisation!.id, name: b.organisation!.name })
    expect(me.locations.map((l: { id: string }) => l.id)).toEqual([b.garage.id])
  })

  it("the owner is told they own the business and holds everything", async () => {
    const b = await business()
    as(b.user.id)
    const me = await (await meGet(url("me"))).json()
    expect(me.isOwner).toBe(true)
    expect(me.permissions).toContain("billing.manage")
    expect(me.permissions).toContain("roles.manage")
  })
})
