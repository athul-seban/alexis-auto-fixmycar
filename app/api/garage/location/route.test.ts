import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { cleanupPrefix, makeGarage, makeLocation, makeStaff } from "@/test/fixtures"
import { POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "locswitch-"
const as = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE", email: `${id}@example.com` } } as never)
const post = (body: unknown) => POST(new Request("http://x/api/garage/location", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const cookieOf = (res: Response) => res.headers.get("set-cookie") ?? ""

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("POST /api/garage/location", () => {
  it("remembers a location the person can open, as a cookie the server will re-check on every request", async () => {
    const biz = await makeGarage(PREFIX, { key: "a" })
    const second = await makeLocation(PREFIX, biz.organisation!.id, { key: "b" })
    as(biz.user.id)
    const res = await post({ locationId: second.id })
    expect(res.status).toBe(200)
    expect((await res.json()).location).toMatchObject({ id: second.id, name: second.name })
    expect(cookieOf(res)).toContain(`qmg_loc=${second.id}`)
    expect(cookieOf(res).toLowerCase()).toContain("samesite=lax")
  })

  it("can open an archived location to look at its history", async () => {
    const biz = await makeGarage(PREFIX, { key: "a" })
    const closed = await makeLocation(PREFIX, biz.organisation!.id, { key: "closed", status: "ARCHIVED" })
    as(biz.user.id)
    expect((await post({ locationId: closed.id })).status).toBe(200)
  })

  it("refuses a location the person doesn't hold, another business's location, and junk, without setting anything", async () => {
    const biz = await makeGarage(PREFIX, { key: "a" })
    const second = await makeLocation(PREFIX, biz.organisation!.id, { key: "b" })
    const rival = await makeGarage(PREFIX, { key: "rival" })
    const onlyFirst = await makeStaff(PREFIX, biz.organisation!.id, { role: "staff", locations: [biz.garage.id] })
    as(onlyFirst.user.id)
    for (const locationId of [second.id, rival.garage.id, "no-such-location-id"]) {
      const res = await post({ locationId })
      expect(res.status, locationId).toBe(404)
      expect(cookieOf(res)).toBe("")
    }
    expect((await post({ locationId: "x" })).status).toBe(400)
    expect((await post({})).status).toBe(400)
  })

  it("requires a signed-in garage login", async () => {
    mockSession.mockResolvedValue(null as never)
    expect((await post({ locationId: "whatever-id" })).status).toBe(401)
  })
})
