import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PATCH } from "./route"
import { POST as changePassword } from "../change-password/route"
import { DEFAULT_PORTAL_SETTINGS } from "@/lib/portal/portal-settings"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "settingstest-"
const asUser = (id: string) => mockSession.mockResolvedValue({ user: { id, role: "GARAGE" } } as any)
const json = (method: string, body: unknown) => new Request("http://x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("garage settings: text messages", () => {
  const KEYS = ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM"] as const
  it("won't switch texting on without an SMS provider, and allows it once configured", async () => {
    for (const k of KEYS) delete process.env[k]
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await (await GET(new Request("http://x"))).json()).smsAvailable).toBe(false)
    const blocked = await PATCH(json("PATCH", { notifications: { smsCustomer: true } }))
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).code).toBe("SMS_UNAVAILABLE")

    Object.assign(process.env, { TWILIO_ACCOUNT_SID: "AC1", TWILIO_AUTH_TOKEN: "t", TWILIO_FROM: "+441234567890" })
    try {
      const ok = await PATCH(json("PATCH", { notifications: { smsCustomer: true } }))
      expect((await ok.json()).settings.notifications.smsCustomer).toBe(true)
      // Switching it OFF is always allowed, even if the provider later disappears.
      for (const k of KEYS) delete process.env[k]
      expect((await PATCH(json("PATCH", { notifications: { smsCustomer: false } }))).status).toBe(200)
    } finally {
      for (const k of KEYS) delete process.env[k]
    }
  })
})

describe("garage settings: online payments", () => {
  it("reports whether the platform can take payments, and refuses to switch deposits on when it can't", async () => {
    delete process.env.STRIPE_SECRET_KEY
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await (await GET(new Request("http://x"))).json()).paymentsAvailable).toBe(false)

    const blocked = await PATCH(json("PATCH", { payments: { enabled: true } }))
    expect(blocked.status).toBe(409)
    expect((await blocked.json()).code).toBe("PAYMENTS_UNAVAILABLE")
  })

  it("saves deposit options once Stripe is configured, and validates them", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_dummy"
    try {
      const { user, garage } = await makeGarage(PREFIX)
      asUser(user.id)
      const ok = await PATCH(json("PATCH", { payments: { enabled: true, depositPercent: 30, refundPolicy: "FULL" } }))
      expect((await ok.json()).settings.payments).toEqual({ enabled: true, depositPercent: 30, refundPolicy: "FULL" })
      expect(JSON.parse((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).portalSettings!).payments.depositPercent).toBe(30)
      expect((await PATCH(json("PATCH", { payments: { depositPercent: 2 } }))).status).toBe(400)
      expect((await PATCH(json("PATCH", { payments: { refundPolicy: "SOMETIMES" } }))).status).toBe(400)
    } finally {
      delete process.env.STRIPE_SECRET_KEY
    }
  })
})

describe("garage settings", () => {
  it("returns defaults plus account info", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)
    const body = await (await GET(new Request("http://x"))).json()
    expect(body.settings).toEqual(DEFAULT_PORTAL_SETTINGS)
    expect(body.account).toMatchObject({ email: user.email, hasPassword: false })
    expect(body.garage).toMatchObject({ status: "APPROVED", slug: garage.slug })
  })

  it("merges partial widget and notification updates and persists them", async () => {
    const { user, garage } = await makeGarage(PREFIX)
    asUser(user.id)

    const res = await PATCH(json("PATCH", { widget: { enabled: false, accent: "F97316", slotMins: 60 }, notifications: { emailReview: false } }))
    const { settings } = await res.json()
    expect(settings.widget).toMatchObject({ enabled: false, accent: "F97316", slotMins: 60, leadHours: 2 })
    expect(settings.notifications).toEqual({ emailNewBooking: true, emailCancellation: true, emailReview: false, smsCustomer: false })

    // A later partial update keeps earlier changes.
    await PATCH(json("PATCH", { widget: { leadHours: 6 } }))
    const stored = JSON.parse((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).portalSettings!)
    expect(stored.widget).toMatchObject({ enabled: false, accent: "F97316", leadHours: 6 })
  })

  it("sets and clears the bay override", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    expect((await (await PATCH(json("PATCH", { bays: 3 }))).json()).settings.bays).toBe(3)
    expect((await (await PATCH(json("PATCH", { bays: null }))).json()).settings.bays).toBeUndefined()
  })

  it("validates input", async () => {
    const { user } = await makeGarage(PREFIX)
    asUser(user.id)
    const bad = async (body: object) => (await PATCH(json("PATCH", body))).status
    expect(await bad({})).toBe(400)
    expect(await bad({ widget: { accent: "red" } })).toBe(400)
    expect(await bad({ widget: { slotMins: 25 } })).toBe(400)
    expect(await bad({ widget: { maxDaysAhead: 0 } })).toBe(400)
    expect(await bad({ bays: 0 })).toBe(400)
  })

  it("is read-only for suspended garages", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED" })
    asUser(user.id)
    expect((await GET(new Request("http://x"))).status).toBe(200)
    expect((await PATCH(json("PATCH", { widget: { enabled: false } }))).status).toBe(403)
  })
})

describe("POST /api/garage/change-password", () => {
  const setup = async (password: string | null = "oldpassword1") => {
    const { user } = await makeGarage(PREFIX)
    if (password) await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash(password, 4), failedLoginAttempts: 3 } })
    asUser(user.id)
    return user
  }

  it("changes the password when the current one is right, and resets lockout counters", async () => {
    const user = await setup()
    const res = await changePassword(json("POST", { current: "oldpassword1", next: "brandnewpass2" }))
    expect(res.status).toBe(200)

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(await bcrypt.compare("brandnewpass2", after.password!)).toBe(true)
    expect(await bcrypt.compare("oldpassword1", after.password!)).toBe(false)
    expect(after.failedLoginAttempts).toBe(0)
  })

  it("counts wrong current passwords toward the sign-in lockout (5 attempts → 15 minutes)", async () => {
    const user = await setup()
    // setup() starts the user at 3 failed attempts; two more should lock the account.
    await prisma.user.update({ where: { id: user.id }, data: { failedLoginAttempts: 0 } })
    for (let i = 0; i < 4; i++) {
      expect((await changePassword(json("POST", { current: "wrong", next: "brandnewpass2" }))).status).toBe(400)
    }
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginAttempts).toBe(4)

    expect((await changePassword(json("POST", { current: "wrong", next: "brandnewpass2" }))).status).toBe(400) // 5th failure locks
    const locked = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(locked.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60000)

    // Even the correct password is refused while locked, and the password is unchanged.
    const res = await changePassword(json("POST", { current: "oldpassword1", next: "brandnewpass2" }))
    expect(res.status).toBe(429)
    expect(await bcrypt.compare("oldpassword1", (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password!)).toBe(true)
  })

  it("lets a suspended garage change its password (an account action, not a business write)", async () => {
    const { user } = await makeGarage(PREFIX, { status: "SUSPENDED", key: "susp" })
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash("oldpassword1", 4) } })
    asUser(user.id)
    expect((await changePassword(json("POST", { current: "oldpassword1", next: "brandnewpass2" }))).status).toBe(200)
  })

  it("rejects a wrong current password, a short or unchanged new one, and Google-only accounts", async () => {
    await setup()
    const wrong = await changePassword(json("POST", { current: "nope", next: "brandnewpass2" }))
    expect(wrong.status).toBe(400)
    expect((await wrong.json()).error).toMatch(/incorrect/)

    expect((await changePassword(json("POST", { current: "oldpassword1", next: "short" }))).status).toBe(400)
    expect((await changePassword(json("POST", { current: "oldpassword1", next: "oldpassword1" }))).status).toBe(400)

    await cleanupPrefix(PREFIX)
    await setup(null)
    const google = await changePassword(json("POST", { current: "x", next: "brandnewpass2" }))
    expect(google.status).toBe(400)
    expect((await google.json()).error).toMatch(/Google/)
  })
})
