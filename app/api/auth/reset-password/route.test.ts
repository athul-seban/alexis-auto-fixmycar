import { describe, it, expect, beforeEach, afterAll } from "vitest"
import bcrypt from "bcryptjs"
import { prisma } from "@/lib/prisma"
import { POST } from "./route"

const PREFIX = "resettest-"
const post = (body: unknown) => POST(new Request("http://localhost/api/auth/reset-password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }))
const NEW_PASSWORD = "a-brand-new-passphrase"

async function cleanup() {
  await prisma.verificationToken.deleteMany({ where: { identifier: { startsWith: PREFIX } } })
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
}

async function userWithToken(key: string, opts: { password?: string | null; expired?: boolean } = {}) {
  const email = `${PREFIX}${key}@example.com`
  const user = await prisma.user.create({ data: { email, role: "OWNER", password: opts.password === undefined ? "old-hash" : opts.password, failedLoginAttempts: 3, lockedUntil: new Date(Date.now() + 60_000) } })
  const token = `${PREFIX}token-${key}`
  await prisma.verificationToken.create({ data: { identifier: email, token, expires: new Date(Date.now() + (opts.expired ? -60_000 : 3_600_000)) } })
  return { user, token }
}

beforeEach(cleanup)
afterAll(cleanup)

describe("POST /api/auth/reset-password", () => {
  it("sets the password, clears lockout, uses up the token and signs out every existing session (regression)", async () => {
    const { user, token } = await userWithToken("ok")
    const res = await post({ token, password: NEW_PASSWORD })
    expect(res.status).toBe(200)

    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(await bcrypt.compare(NEW_PASSWORD, after.password!)).toBe(true)
    expect(after).toMatchObject({ failedLoginAttempts: 0, lockedUntil: null })
    expect(after.sessionVersion).toBe(user.sessionVersion + 1) // old JWTs are now rejected by the jwt callback
    expect(await prisma.verificationToken.count({ where: { token } })).toBe(0)
    expect((await post({ token, password: NEW_PASSWORD })).status).toBe(400) // single use
  })

  it("lets an invited user with no password set their first one", async () => {
    const { user, token } = await userWithToken("invited", { password: null })
    expect((await post({ token, password: NEW_PASSWORD })).status).toBe(200)
    expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).password).not.toBeNull()
  })

  it("rejects an expired or unknown token and changes nothing", async () => {
    const { user, token } = await userWithToken("expired", { expired: true })
    expect((await post({ token, password: NEW_PASSWORD })).status).toBe(400)
    expect((await post({ token: "nope", password: NEW_PASSWORD })).status).toBe(400)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: user.id } })
    expect(after.password).toBe("old-hash")
    expect(after.sessionVersion).toBe(user.sessionVersion)
  })

  it("enforces the password policy", async () => {
    const { token } = await userWithToken("weak")
    expect((await post({ token, password: "short" })).status).toBe(400)
    expect((await post({ token, password: "password123" })).status).toBe(400)
    expect(await prisma.verificationToken.count({ where: { token } })).toBe(1)
  })
})
