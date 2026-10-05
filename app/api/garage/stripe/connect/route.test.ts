import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, POST } from "./route"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const stripe = vi.hoisted(() => ({ accounts: { create: vi.fn(), retrieve: vi.fn() }, accountLinks: { create: vi.fn() } }))
vi.mock("@/lib/stripe", () => ({ getStripe: () => stripe, stripeConfigured: () => process.env.STRIPE_SECRET_KEY !== undefined }))
vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "stripeconnect-"
const ctx = { params: Promise.resolve({}) } as any
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const reloadGarage = (id: string) => prisma.garage.findUniqueOrThrow({ where: { id } })

beforeEach(async () => {
  vi.clearAllMocks()
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
  let n = 0
  stripe.accounts.create.mockImplementation(async () => ({ id: `acct_${PREFIX}${Date.now()}_${++n}` }))
  stripe.accountLinks.create.mockResolvedValue({ url: "https://connect.stripe.test/onboard" })
  await cleanupPrefix(PREFIX)
})
afterAll(async () => {
  delete process.env.STRIPE_SECRET_KEY
  await cleanupPrefix(PREFIX)
})

describe("POST /api/garage/stripe/connect", () => {
  it("creates one Express account for the garage and returns the onboarding link", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    const res = await POST(new Request("http://x", { method: "POST" }), ctx)
    expect(res.status).toBe(200)
    expect((await res.json()).url).toBe("https://connect.stripe.test/onboard")
    expect(stripe.accounts.create).toHaveBeenCalledWith(expect.objectContaining({ type: "express", country: "GB", email: garage.email, metadata: { garageId: garage.id } }))
    const saved = await reloadGarage(garage.id)
    expect(saved.stripeAccountId).toMatch(/^acct_/)
    expect(saved.stripeChargesEnabled).toBe(false) // not usable until Stripe says so
  })

  it("reuses the same account when onboarding is resumed", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    await POST(new Request("http://x", { method: "POST" }), ctx)
    const first = (await reloadGarage(garage.id)).stripeAccountId
    await POST(new Request("http://x", { method: "POST" }), ctx)
    expect(stripe.accounts.create).toHaveBeenCalledTimes(1)
    expect((await reloadGarage(garage.id)).stripeAccountId).toBe(first)
    expect(stripe.accountLinks.create).toHaveBeenLastCalledWith(expect.objectContaining({ account: first, type: "account_onboarding" }))
  })

  it("refuses when the platform has no Stripe keys, and for suspended garages", async () => {
    const { user } = await makeGarage(PREFIX, { key: "a" })
    asUser(user.id)
    delete process.env.STRIPE_SECRET_KEY
    expect((await POST(new Request("http://x", { method: "POST" }), ctx)).status).toBe(409)
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    const { user: sus } = await makeGarage(PREFIX, { key: "sus", status: "SUSPENDED" })
    asUser(sus.id)
    expect((await POST(new Request("http://x", { method: "POST" }), ctx)).status).toBe(403)
  })
})

describe("GET /api/garage/stripe/connect", () => {
  it("reports 'not connected' without calling Stripe", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect(await (await GET(new Request("http://x"), ctx)).json()).toEqual({ available: true, connected: false, enabled: false })
    expect(stripe.accounts.retrieve).not.toHaveBeenCalled()
  })

  it("re-reads the account from Stripe and enables deposits once onboarding is complete", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeAccountId: "acct_resume" } })
    asUser(user.id)

    stripe.accounts.retrieve.mockResolvedValueOnce({ id: "acct_resume", charges_enabled: false, payouts_enabled: false, details_submitted: true })
    expect(await (await GET(new Request("http://x"), ctx)).json()).toMatchObject({ connected: true, enabled: false })

    stripe.accounts.retrieve.mockResolvedValueOnce({ id: "acct_resume", charges_enabled: true, payouts_enabled: true, details_submitted: true })
    expect(await (await GET(new Request("http://x"), ctx)).json()).toMatchObject({ connected: true, enabled: true })
    expect((await reloadGarage(garage.id)).stripeChargesEnabled).toBe(true)
  })

  it("falls back to the last known state if Stripe can't be reached", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    await prisma.garage.update({ where: { id: garage.id }, data: { stripeAccountId: "acct_down", stripeChargesEnabled: true } })
    asUser(user.id)
    stripe.accounts.retrieve.mockRejectedValueOnce(new Error("network"))
    vi.spyOn(console, "error").mockImplementation(() => {})
    expect(await (await GET(new Request("http://x"), ctx)).json()).toEqual({ available: true, connected: true, enabled: true })
  })

  it("says payments are unavailable when Stripe isn't configured", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    delete process.env.STRIPE_SECRET_KEY
    expect((await (await GET(new Request("http://x"), ctx)).json()).available).toBe(false)
  })
})
