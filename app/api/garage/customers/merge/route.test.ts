import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { DELETE, POST } from "./route"
import { GET as list } from "../route"
import { GET as detail } from "../detail/route"
import { cleanupPrefix, makeGarage, makeWalkInBooking } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "crmmerge-"
const ctx = { params: Promise.resolve({}) } as any
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const merge = (from: string, to: string) => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ from, to }) }), ctx)
const split = (from: string) => DELETE(new Request(`http://x?from=${encodeURIComponent(from)}`, { method: "DELETE" }), ctx)
const names = async () => (await (await list(new Request("http://x?pageSize=100"), ctx)).json()).customers.map((c: any) => c.name).sort()

const HOME = "e:ann@example.com"
const WORK = "e:ann.work@example.com"
const BOB = "e:bob@example.com"

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

async function seed() {
  const { user, garage } = await makeGarage(PREFIX)
  asUser(user.id)
  await makeWalkInBooking(garage.id, { customerName: "Ann Lee", customerEmail: "ann@example.com", status: "COMPLETED", totalPrice: 40 })
  await makeWalkInBooking(garage.id, { customerName: "Ann L (work)", customerEmail: "ann.work@example.com", status: "COMPLETED", totalPrice: 60 })
  await makeWalkInBooking(garage.id, { customerName: "Bob Ray", customerEmail: "bob@example.com", status: "COMPLETED", totalPrice: 10 })
  return { user, garage }
}

describe("merging customers", () => {
  it("combines two identities into one customer and shows what was merged", async () => {
    await seed()
    expect(await names()).toHaveLength(3)
    const res = await merge(WORK, HOME)
    expect(res.status).toBe(200)
    expect((await res.json()).key).toBe(HOME)
    expect(await names()).toEqual(["Ann Lee", "Bob Ray"])

    const d = await (await detail(new Request(`http://x?key=${encodeURIComponent(HOME)}`), ctx)).json()
    expect(d.customer).toMatchObject({ completed: 2, spend: 100, mergedFrom: [WORK] })
    expect(d.bookings).toHaveLength(2)
  })

  it("splits a merged identity back out", async () => {
    await seed()
    await merge(WORK, HOME)
    expect((await split(WORK)).status).toBe(200)
    expect(await names()).toHaveLength(3)
    expect((await split(WORK)).status).toBe(404) // nothing left to undo
  })

  it("follows chains: merging into an already-merged customer joins the whole group", async () => {
    await seed()
    await merge(WORK, HOME)
    await merge(BOB, WORK) // WORK now resolves to HOME
    expect(await names()).toEqual(["Ann Lee"])
    const d = await (await detail(new Request(`http://x?key=${encodeURIComponent(HOME)}`), ctx)).json()
    expect(d.customer.completed).toBe(3)
  })

  it("moves a private note across, joining it to the target's", async () => {
    const { garage } = await seed()
    await prisma.customerNote.createMany({ data: [{ garageId: garage.id, customerKey: WORK, body: "Works nights" }, { garageId: garage.id, customerKey: HOME, body: "Likes tea" }] })
    await merge(WORK, HOME)
    expect(await prisma.customerNote.findFirst({ where: { garageId: garage.id, customerKey: WORK } })).toBeNull()
    expect((await prisma.customerNote.findFirstOrThrow({ where: { garageId: garage.id, customerKey: HOME } })).body).toBe("Likes tea\n\nWorks nights")
  })

  it("rejects merging a customer with themselves, unknown customers and bad keys", async () => {
    await seed()
    expect((await merge(HOME, HOME)).status).toBe(400)
    expect((await merge("e:ghost@example.com", HOME)).status).toBe(404)
    expect((await merge("not a key", HOME)).status).toBe(400)
    await merge(WORK, HOME)
    expect((await merge(WORK, HOME)).status).toBe(400) // already the same customer
    expect((await merge(HOME, WORK)).status).toBe(400) // would loop back
  })

  it("only touches the signed-in garage's customers, and is blocked for suspended garages", async () => {
    await seed()
    const { user: other, garage: g2 } = await makeGarage(PREFIX, { key: "other" })
    await makeWalkInBooking(g2.id, { customerName: "Zed", customerEmail: "zed@example.com" })
    asUser(other.id)
    expect((await merge(WORK, HOME)).status).toBe(404) // those customers belong to the first garage
    expect(await names()).toEqual(["Zed"])

    const { user: sus } = await makeGarage(PREFIX, { key: "sus", status: "SUSPENDED" })
    asUser(sus.id)
    expect((await merge(WORK, HOME)).status).toBe(403)
  })
})
