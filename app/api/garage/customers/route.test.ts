import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET as list } from "./route"
import { GET as detail } from "./detail/route"
import { PUT as putNote } from "./note/route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "crmtest-"
const ctx = { params: Promise.resolve({}) } as any
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const get = (h: typeof list, qs = "") => h(new Request(`http://x?${qs}`), ctx)
const put = (body: unknown) => putNote(new Request("http://x", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }), ctx)

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function seed() {
  const { user, garage } = await makeGarage(PREFIX)
  asUser(user.id)
  const day = (n: number) => new Date(Date.now() + n * 86_400_000)
  await makeWalkInBooking(garage.id, { customerName: "Ann Lee", customerEmail: "ann@example.com", status: "COMPLETED", scheduledAt: day(-30), totalPrice: 80, vrm: "AB12CDE" })
  await makeWalkInBooking(garage.id, { customerName: "Ann Lee", customerEmail: "ann@example.com", status: "COMPLETED", scheduledAt: day(-3), totalPrice: 100, finalInvoiceValue: 120, vrm: "AB12CDE" })
  await makeWalkInBooking(garage.id, { customerName: "Bob Ray", customerEmail: "bob@example.com", status: "CONFIRMED", scheduledAt: day(4), totalPrice: 60, vrm: "XY21ABC" })
  return { user, garage }
}

describe("GET /api/garage/customers", () => {
  it("groups bookings into customers with totals, and reports a garage-wide summary", async () => {
    await seed()
    const body = await (await get(list)).json()
    expect(body.total).toBe(2)
    const ann = body.customers.find((c: any) => c.name === "Ann Lee")
    expect(ann).toMatchObject({ completed: 2, spend: 200, email: "ann@example.com" })
    expect(body.summary).toMatchObject({ customers: 2, repeat: 1, spend: 200 })
  })

  it("searches, sorts and pages", async () => {
    await seed()
    expect((await (await get(list, "q=bob")).json()).customers.map((c: any) => c.name)).toEqual(["Bob Ray"])
    expect((await (await get(list, "sort=name&dir=desc")).json()).customers[0].name).toBe("Bob Ray")
    const paged = await (await get(list, "pageSize=10&page=2")).json()
    expect(paged.customers).toHaveLength(0)
    expect((await get(list, "pageSize=7")).status).toBe(400)
    expect((await get(list, "sort=password")).status).toBe(400)
  })

  it("exports CSV that is safe to open in a spreadsheet", async () => {
    const { garage } = await seed()
    await makeWalkInBooking(garage.id, { customerName: "=HYPERLINK(\"http://evil\")", customerEmail: "evil@example.com", status: "COMPLETED" })
    const res = await get(list, "format=csv")
    expect(res.headers.get("content-type")).toContain("text/csv")
    const text = Buffer.from(await res.arrayBuffer()).toString("utf8")
    expect(text).toContain("Ann Lee")
    expect(text).toContain("'=HYPERLINK") // formula neutralised
  })

  it("never shows another garage's customers", async () => {
    await seed()
    const { user: other, garage: g2 } = await makeGarage(PREFIX, { key: "other" })
    await makeWalkInBooking(g2.id, { customerName: "Secret Sam", customerEmail: "sam@example.com" })
    asUser(other.id)
    const names = (await (await get(list)).json()).customers.map((c: any) => c.name)
    expect(names).toEqual(["Secret Sam"])
  })
})

describe("customer detail and notes", () => {
  it("returns a customer's history and saves, updates and clears a private note", async () => {
    await seed()
    const key = "e:ann@example.com"
    const d = await (await get(detail, `key=${encodeURIComponent(key)}`)).json()
    expect(d.customer.name).toBe("Ann Lee")
    expect(d.bookings).toHaveLength(2)
    expect(d.note).toBeNull()

    expect((await (await put({ key, body: "Prefers a courtesy car" })).json()).note.body).toBe("Prefers a courtesy car")
    await put({ key, body: "Prefers a courtesy car; allergic to cats" })
    expect((await (await get(detail, `key=${encodeURIComponent(key)}`)).json()).note.body).toContain("allergic")
    expect((await (await put({ key, body: "   " })).json()).note).toBeNull()
    expect(await prisma.customerNote.count({ where: { customerKey: key } })).toBe(0)
  })

  it("rejects malformed keys and unknown customers, and keeps notes per garage", async () => {
    const { garage } = await seed()
    expect((await get(detail, "key=nonsense")).status).toBe(400)
    expect((await get(detail, `key=${encodeURIComponent("e:nobody@example.com")}`)).status).toBe(404)
    expect((await put({ key: "bad key", body: "x" })).status).toBe(400)

    await put({ key: "e:ann@example.com", body: "mine" })
    const { user: other } = await makeGarage(PREFIX, { key: "other2" })
    asUser(other.id)
    expect(await prisma.customerNote.count({ where: { garageId: garage.id } })).toBe(1)
    expect((await get(detail, `key=${encodeURIComponent("e:ann@example.com")}`)).status).toBe(404) // not their customer
  })

  it("blocks writes from a suspended garage", async () => {
    const { user } = await makeGarage(PREFIX, { key: "sus", status: "SUSPENDED" })
    asUser(user.id)
    expect((await put({ key: "e:a@b.co", body: "x" })).status).toBe(403)
  })
})
