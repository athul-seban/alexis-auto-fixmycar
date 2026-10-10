import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { GET, PATCH } from "./route"
import { POST as changePassword } from "./change-password/route"
import { DELETE as signOutEverywhere } from "./sessions/route"
import { cleanupPrefix, makeOwner } from "@/test/fixtures"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))

const mockSession = vi.mocked(getServerSession)
const PREFIX = "account-"
const json = (method: string, body: unknown) => new Request("http://x", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })

beforeEach(async () => {
  mockSession.mockReset()
  await cleanupPrefix(PREFIX)
})
afterAll(() => cleanupPrefix(PREFIX))

describe("/api/account", () => {
  it("requires a session", async () => {
    mockSession.mockResolvedValue(null)
    expect((await GET()).status).toBe(401)
    expect((await PATCH(json("PATCH", { name: "x" }))).status).toBe(401)
  })

  it("reads and updates the caller's own profile only", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    const res = await PATCH(json("PATCH", { name: "  New Name ", phone: "07123 456789" }))
    expect(res.status).toBe(200)
    const me = await (await GET()).json()
    expect(me).toMatchObject({ name: "New Name", email: user.email, hasPassword: false })
    expect(me.phone).toMatch(/^07123/)
    expect((await PATCH(json("PATCH", { name: "" }))).status).toBe(400)
  })
})

describe("/api/account text-message consent", () => {
  it("saves and returns the opt-in, independently of the other profile fields", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect((await (await GET()).json()).smsOptIn).toBe(false)
    expect((await PATCH(json("PATCH", { smsOptIn: true }))).status).toBe(200)
    const me = await (await GET()).json()
    expect(me).toMatchObject({ smsOptIn: true, email: user.email })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).name).toBe(user.name) // untouched
    expect((await PATCH(json("PATCH", {}))).status).toBe(400)
  })
})

describe("/api/account/change-password", () => {
  it("changes the password when the current one is right, and counts wrong attempts", async () => {
    const { user } = await makeOwner(PREFIX)
    await prisma.user.update({ where: { id: user.id }, data: { password: await bcrypt.hash("oldpassword", 4) } })
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)

    expect((await changePassword(json("POST", { current: "wrong", next: "brandnewpass" }))).status).toBe(400)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).failedLoginAttempts).toBe(1)
    expect((await changePassword(json("POST", { current: "oldpassword", next: "short" }))).status).toBe(400)
    expect((await changePassword(json("POST", { current: "oldpassword", next: "brandnewpass" }))).status).toBe(200)

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(await bcrypt.compare("brandnewpass", after.password!)).toBe(true)
    expect(after.failedLoginAttempts).toBe(0)
  })

  it("tells Google-only accounts there is no password", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect((await changePassword(json("POST", { current: "x", next: "brandnewpass" }))).status).toBe(400)
  })
})

describe("/api/account preferences, photo and sessions", () => {
  it("returns role and preferences, saves them, and only accepts https photo URLs", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect(await (await GET()).json()).toMatchObject({ role: "OWNER", emailNotifications: true, marketingOptIn: false, image: null })

    expect((await PATCH(json("PATCH", { emailNotifications: false, marketingOptIn: true }))).status).toBe(200)
    expect(await (await GET()).json()).toMatchObject({ emailNotifications: false, marketingOptIn: true })

    expect((await PATCH(json("PATCH", { image: "javascript:alert(1)" }))).status).toBe(400)
    expect((await PATCH(json("PATCH", { image: "http://insecure.example/a.png" }))).status).toBe(400)
    expect((await PATCH(json("PATCH", { image: "https://blob.example/a.png" }))).status).toBe(200)
    expect((await PATCH(json("PATCH", { image: null }))).status).toBe(200)
    expect((await GET().then((r) => r.json())).image).toBeNull()
  })

  it("never exposes the password hash", async () => {
    const { user } = await makeOwner(PREFIX)
    await prisma.user.update({ where: { id: user.id }, data: { password: "hash" } })
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    const me = await (await GET()).json()
    expect(me.hasPassword).toBe(true)
    expect(me).not.toHaveProperty("password")
  })

  it("sign out everywhere bumps the session version", async () => {
    const { user } = await makeOwner(PREFIX)
    mockSession.mockResolvedValue(null)
    expect((await signOutEverywhere()).status).toBe(401)
    mockSession.mockResolvedValue({ user: { id: user.id, role: "OWNER" } } as any)
    expect((await signOutEverywhere()).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).sessionVersion).toBe(1)
  })
})
