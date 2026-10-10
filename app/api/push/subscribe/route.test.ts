import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { DELETE, GET, POST } from "./route"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
// VAPID keys are validated by the push library; the route only needs to know push is switched on.
vi.mock("@/lib/push", () => ({ pushConfigured: () => true }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "pushtest-"
const ENDPOINT = `https://push.example.com/${PREFIX}abc`
const sub = (endpoint = ENDPOINT) => ({ endpoint, keys: { p256dh: "BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM", auth: "tBHItJI5svbpez7KI4CCXg" } })
const call = (fn: typeof POST | typeof DELETE, body: unknown) =>
  fn(new Request("http://x", { method: fn === POST ? "POST" : "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))

beforeEach(async () => {
  mockSession.mockReset()
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})
afterAll(async () => {
  await prisma.pushSubscription.deleteMany({ where: { endpoint: { contains: PREFIX } } })
  await cleanupPrefix(PREFIX)
})

describe("/api/push/subscribe", () => {
  it("tells the browser whether push is available", async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-key-for-test"
    expect(await (await GET()).json()).toEqual({ available: true, publicKey: "public-key-for-test" })
  })

  it("requires sign-in", async () => {
    mockSession.mockResolvedValue(null)
    expect((await call(POST, sub())).status).toBe(401)
  })

  it("saves a customer's device against their account", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect((await call(POST, sub())).status).toBe(201)
    expect(await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: ENDPOINT } })).toMatchObject({ userId: user.id, garageId: null })
  })

  it("saves a garage's device against the garage, so its pushes follow the business not the login", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "GARAGE" } } as any)
    expect((await call(POST, sub())).status).toBe(201)
    expect(await prisma.pushSubscription.findUniqueOrThrow({ where: { endpoint: ENDPOINT } })).toMatchObject({ garageId: garage.id, userId: null })
  })

  it("moves a shared browser's subscription to whoever signs in next, without duplicating it", async () => {
    const { user: a } = await makeOwner(PREFIX, "a")
    const { user: b } = await makeOwner(PREFIX, "b")
    mockSession.mockResolvedValue({ user: { id: a.id, role: "OWNER" } } as any)
    await call(POST, sub())
    mockSession.mockResolvedValue({ user: { id: b.id, role: "OWNER" } } as any)
    await call(POST, sub())
    const rows = await prisma.pushSubscription.findMany({ where: { endpoint: ENDPOINT } })
    expect(rows).toHaveLength(1)
    expect(rows[0].userId).toBe(b.id)
  })

  it("rejects non-https endpoints and malformed bodies", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect((await call(POST, sub("http://push.example.com/insecure"))).status).toBe(400)
    expect((await call(POST, { endpoint: ENDPOINT })).status).toBe(400)
  })

  it("lets you remove only your own subscription", async () => {
    const { user: owner } = await makeOwner(PREFIX, "owner")
    const { user: other } = await makeOwner(PREFIX, "other")
    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    await call(POST, sub())

    mockSession.mockResolvedValue({ user: { id: other.id, role: "OWNER" } } as any)
    await call(DELETE, { endpoint: ENDPOINT })
    expect(await prisma.pushSubscription.count({ where: { endpoint: ENDPOINT } })).toBe(1)

    mockSession.mockResolvedValue({ user: { id: owner.id, role: "OWNER" } } as any)
    await call(DELETE, { endpoint: ENDPOINT })
    expect(await prisma.pushSubscription.count({ where: { endpoint: ENDPOINT } })).toBe(0)
  })
})
