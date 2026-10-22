import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"
import { POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "quotevalid-"
const post = (body: unknown) => POST(new Request("http://localhost/api/quotes", { method: "POST", headers: { "Content-Type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) }))

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("POST /api/quotes: input validation", () => {
  it("answers a malformed or non-object body with 400, not a 500 (regression: req.json() was outside the try)", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as never)
    expect((await post("{not json")).status).toBe(400)
    expect((await post("")).status).toBe(400)
    expect((await post("null")).status).toBe(400)
    expect((await post("42")).status).toBe(400)
  })

  it("caps the customer's description", async () => {
    const { user, vehicle } = await makeOwner(PREFIX)
    const { garage } = await makeGarage(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as never)
    const base = { action: "request", vehicleId: vehicle.id, garageId: garage.id, services: ["MOT"] }
    expect((await post({ ...base, description: "x".repeat(2001) })).status).toBe(400)
  })

  it("caps a garage's quoted amounts and notes", async () => {
    const { user } = await makeGarage(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as never)
    const base = { action: "respond", quoteId: "q1", price: 100 }
    expect((await post({ ...base, price: 100_001 })).status).toBe(400)
    expect((await post({ ...base, price: 1e12 })).status).toBe(400)
    expect((await post({ ...base, laborCost: 100_001 })).status).toBe(400)
    expect((await post({ ...base, partsCost: 1e9 })).status).toBe(400)
    expect((await post({ ...base, notes: "n".repeat(2001) })).status).toBe(400)
    expect((await post({ ...base, items: [{ serviceType: "MOT", price: 100_001 }] })).status).toBe(400)
  })
})
