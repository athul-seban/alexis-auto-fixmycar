import { describe, it, expect, vi, beforeEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { POST as resetPassword } from "../../../auth/reset-password/route"
import { PATCH, POST } from "./route"

vi.mock("next-auth", () => ({ getServerSession: vi.fn() }))
vi.mock("@/lib/auth", () => ({ authOptions: {} }))
vi.mock("@/lib/mail", () => ({ sendMail: vi.fn().mockResolvedValue({ success: true }) }))

const mockSession = vi.mocked(getServerSession)
const mockMail = vi.mocked(sendMail)
const PREFIX = "invitetest-"
const email = (n: string) => `${PREFIX}${n}@example.com`
const DAY = 24 * 60 * 60 * 1000

const asSuper = () => mockSession.mockResolvedValue({ user: { id: "boss", role: "SUPER_ADMIN" } } as never)
const send = (method: "POST" | "PATCH", body: unknown) =>
  new Request("http://localhost/api/admin/garages/invite", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
const valid = (n: string, over: Record<string, unknown> = {}) => ({ garageName: `${PREFIX}Garage ${n}`, ownerName: "Sam Owner", email: email(n), city: "Derby", ...over })

async function cleanup() {
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } }) // the garage goes with its owner
  await prisma.auditLog.deleteMany({ where: { action: { in: ["GARAGE_INVITED", "GARAGE_INVITE_RESENT"] }, detail: { contains: PREFIX } } })
}

beforeEach(async () => {
  mockMail.mockClear()
  await cleanup()
  asSuper()
})
afterAll(cleanup)

describe("POST /api/admin/garages/invite — who may use it", () => {
  it("rejects ordinary admins, owners, garages and signed-out visitors", async () => {
    for (const session of [{ user: { id: "a", role: "ADMIN" } }, { user: { id: "o", role: "OWNER" } }, { user: { id: "g", role: "GARAGE" } }, null]) {
      mockSession.mockResolvedValue(session as never)
      expect((await POST(send("POST", valid("denied")))).status).toBe(401)
      expect((await PATCH(send("PATCH", { garageId: "x" }))).status).toBe(401)
    }
    expect(await prisma.user.count({ where: { email: { startsWith: PREFIX } } })).toBe(0)
    expect(mockMail).not.toHaveBeenCalled()
  })
})

describe("POST /api/admin/garages/invite — inviting", () => {
  it("creates a pending garage and a password-less owner, and emails a 7-day link", async () => {
    const res = await POST(send("POST", valid("a", { email: `  ${email("a").toUpperCase()}  ` })))
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.emailSent).toBe(true)

    const user = await prisma.user.findUnique({ where: { email: email("a") }, include: { garage: true } })
    expect(user).toMatchObject({ role: "GARAGE", password: null, name: "Sam Owner" })
    expect(user?.garage).toMatchObject({ name: `${PREFIX}Garage a`, status: "PENDING", city: "Derby", email: email("a"), isVerified: false })

    const token = await prisma.verificationToken.findFirst({ where: { identifier: email("a") } })
    expect(token).not.toBeNull()
    const days = (token!.expires.getTime() - Date.now()) / DAY
    expect(days).toBeGreaterThan(6.9)
    expect(days).toBeLessThan(7.1)

    expect(mockMail).toHaveBeenCalledTimes(1)
    const mail = mockMail.mock.calls[0][0]
    expect(mail.to).toBe(email("a"))
    expect(mail.html).toContain(`/reset-password?token=${token!.token}`)
    expect(mail.html).toContain(`${PREFIX}Garage a`)
  })

  it("lets the owner set their own password from the emailed link and then log in with it", async () => {
    await POST(send("POST", valid("b")))
    const token = (await prisma.verificationToken.findFirst({ where: { identifier: email("b") } }))!.token

    const res = await resetPassword(new Request("http://localhost/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: "A-long-garage-passphrase" }) }))
    expect(res.status).toBe(200)

    const user = await prisma.user.findUnique({ where: { email: email("b") } })
    expect(await bcrypt.compare("A-long-garage-passphrase", user!.password!)).toBe(true)
  })

  it("gives garages with the same name different slugs", async () => {
    const a = await (await POST(send("POST", valid("c1", { garageName: `${PREFIX}Same Name` })))).json()
    const b = await (await POST(send("POST", valid("c2", { garageName: `${PREFIX}Same Name` })))).json()
    expect(a.garage.slug).not.toBe(b.garage.slug)
  })

  it("refuses an email that already has an account, whatever its case", async () => {
    await prisma.user.create({ data: { email: email("d"), role: "OWNER" } })
    const res = await POST(send("POST", valid("d", { email: email("d").toUpperCase() })))
    expect(res.status).toBe(409)
    expect(await prisma.garage.count({ where: { name: { startsWith: PREFIX } } })).toBe(0)
    expect(mockMail).not.toHaveBeenCalled()
  })

  it("rejects missing or invalid details", async () => {
    for (const bad of [{ email: "not-an-email" }, { garageName: "" }, { ownerName: " " }, { city: "" }]) {
      expect((await POST(send("POST", valid("e", bad)))).status).toBe(400)
    }
    expect((await POST(new Request("http://localhost/api/admin/garages/invite", { method: "POST", body: "{nope" }))).status).toBe(400)
    expect(await prisma.user.count({ where: { email: { startsWith: PREFIX } } })).toBe(0)
  })

  it("keeps the garage but says so when the email couldn't be sent", async () => {
    mockMail.mockResolvedValueOnce({ success: true, skipped: true })
    const res = await POST(send("POST", valid("f")))
    expect(res.status).toBe(201)
    expect((await res.json()).emailSent).toBe(false)
    expect(await prisma.user.count({ where: { email: email("f") } })).toBe(1)
  })

  it("records who was invited in the audit log", async () => {
    await POST(send("POST", valid("g")))
    const entry = await prisma.auditLog.findFirst({ where: { action: "GARAGE_INVITED", detail: { contains: email("g") } } })
    expect(entry).toMatchObject({ targetType: "GARAGE", actorId: "boss" })
  })
})

describe("PATCH /api/admin/garages/invite — resending", () => {
  it("sends a fresh link and invalidates the old one", async () => {
    await POST(send("POST", valid("h")))
    const garage = await prisma.garage.findFirstOrThrow({ where: { email: email("h") } })
    const first = (await prisma.verificationToken.findFirst({ where: { identifier: email("h") } }))!.token
    mockMail.mockClear()

    const res = await PATCH(send("PATCH", { garageId: garage.id }))
    expect(res.status).toBe(200)
    const tokens = await prisma.verificationToken.findMany({ where: { identifier: email("h") } })
    expect(tokens).toHaveLength(1)
    expect(tokens[0].token).not.toBe(first)
    expect(mockMail).toHaveBeenCalledTimes(1)
  })

  it("won't resend once the owner has set a password, and 404s an unknown garage", async () => {
    await POST(send("POST", valid("i")))
    const garage = await prisma.garage.findFirstOrThrow({ where: { email: email("i") } })
    await prisma.user.update({ where: { email: email("i") }, data: { password: "hashed-not-real" } })
    mockMail.mockClear()

    expect((await PATCH(send("PATCH", { garageId: garage.id }))).status).toBe(409)
    expect((await PATCH(send("PATCH", { garageId: "does-not-exist" }))).status).toBe(404)
    expect((await PATCH(send("PATCH", {}))).status).toBe(400)
    expect(mockMail).not.toHaveBeenCalled()
  })
})
