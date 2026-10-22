import { describe, it, expect, afterAll, vi } from "vitest"
import bcrypt from "bcryptjs"
import type { JWT } from "next-auth/jwt"
import type { Session } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const PREFIX = "authcb-"
const cb = authOptions.callbacks!
const jwt = (token: JWT, extra: { user?: unknown; trigger?: "update" } = {}) => cb.jwt!({ token, ...extra } as never) as Promise<JWT>
const session = (token: JWT) =>
  cb.session!({ session: { user: { name: "x", email: "x@example.com" }, expires: "2999-01-01" } as Session, token } as never) as Promise<Session>

async function makeUser(key: string, data: Record<string, unknown> = {}) {
  return prisma.user.create({ data: { email: `${PREFIX}${key}@example.com`, role: "OWNER", ...data } })
}

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
})

describe("session callback", () => {
  it("returns the id and role for a valid token", async () => {
    const s = await session({ id: "u1", role: "GARAGE", sv: 0 })
    expect(s.user).toMatchObject({ id: "u1", role: "GARAGE" })
  })

  it("returns an EMPTY session for a revoked token, so getServerSession() yields null and every guard rejects it", async () => {
    // Regression: this used to return a truthy session with id/role undefined, and routes filtering on
    // `userId: user.id` then matched every user's rows (Prisma drops an `undefined` filter).
    expect(await session({ id: "u1", role: "OWNER", invalid: true })).toEqual({})
  })

  it("treats a token with no id or no role as signed out", async () => {
    expect(await session({ role: "OWNER" })).toEqual({})
    expect(await session({ id: "u1" })).toEqual({})
  })
})

describe("jwt callback", () => {
  it("keeps a valid account valid and refreshes its role and name from the database", async () => {
    const u = await makeUser("valid", { name: "Fresh Name", role: "GARAGE" })
    const t = await jwt({ id: u.id, role: "OWNER", sv: u.sessionVersion })
    expect(t.invalid).toBe(false)
    expect(t.role).toBe("GARAGE")
    expect(t.name).toBe("Fresh Name")
  })

  it("invalidates a suspended account", async () => {
    const u = await makeUser("suspended", { suspendedAt: new Date() })
    expect((await jwt({ id: u.id, role: "OWNER", sv: u.sessionVersion })).invalid).toBe(true)
  })

  it("invalidates a deleted account", async () => {
    expect((await jwt({ id: "does-not-exist", role: "OWNER", sv: 0 })).invalid).toBe(true)
  })

  it("invalidates a token minted before 'sign out everywhere' (sessionVersion moved on)", async () => {
    const u = await makeUser("signedout")
    const old = { id: u.id, role: "OWNER", sv: u.sessionVersion }
    await prisma.user.update({ where: { id: u.id }, data: { sessionVersion: { increment: 1 } } })
    expect((await jwt(old)).invalid).toBe(true)
  })

  it("end to end: a revoked account's token turns into no session at all", async () => {
    const u = await makeUser("e2e")
    const token = { id: u.id, role: "OWNER", sv: u.sessionVersion }
    expect((await session(await jwt(token))).user?.id).toBe(u.id)

    await prisma.user.update({ where: { id: u.id }, data: { suspendedAt: new Date() } })
    const revoked = await jwt({ ...token, checkedAt: 0 }) // checkedAt 0 forces the database re-check
    expect(await session(revoked)).toEqual({})
  })
})

// ---- credentials sign-in (authorize) ------------------------------------------------------------------------------

type Authorize = (credentials: Record<string, string>, req?: unknown) => Promise<{ id: string; email: string } | null>
const authorize = (authOptions.providers.find((p) => p.id === "credentials") as unknown as { options: { authorize: Authorize } }).options.authorize
const PASSWORD = "correct-horse-battery"
const signIn = (email: string, password: string) => authorize({ email, password })
let hash: string
const passwordHash = async () => (hash ??= await bcrypt.hash(PASSWORD, 4))
const loginUser = async (key: string, data: Record<string, unknown> = {}) =>
  prisma.user.create({ data: { email: `${PREFIX}login-${key}@example.com`, role: "OWNER", password: await passwordHash(), ...data } })

describe("sign-in: order of checks and timing", () => {
  it("signs in with the right password and clears failed-attempt counters", async () => {
    const u = await loginUser("ok", { failedLoginAttempts: 3 })
    const result = await signIn(u.email, PASSWORD)
    expect(result).toMatchObject({ id: u.id, email: u.email })
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginAttempts).toBe(0)
  })

  it("answers an unknown email, a wrong password and a Google-only account identically (null)", async () => {
    const google = await prisma.user.create({ data: { email: `${PREFIX}login-google@example.com`, role: "OWNER" } })
    const known = await loginUser("known")
    expect(await signIn(`${PREFIX}nobody@example.com`, PASSWORD)).toBeNull()
    expect(await signIn(known.email, "wrong-password")).toBeNull()
    expect(await signIn(google.email, PASSWORD)).toBeNull()
  })

  it("always runs bcrypt, even for an email that doesn't exist, so response time doesn't reveal accounts (regression)", async () => {
    const spy = vi.spyOn(bcrypt, "compare")
    try {
      await signIn(`${PREFIX}ghost@example.com`, "whatever-it-is")
      expect(spy).toHaveBeenCalledTimes(1)
      const google = await prisma.user.create({ data: { email: `${PREFIX}login-google2@example.com`, role: "OWNER" } })
      await signIn(google.email, "whatever-it-is")
      expect(spy).toHaveBeenCalledTimes(2)
    } finally {
      spy.mockRestore()
    }
  })

  it("only says 'suspended' to someone who knows the password (regression: it leaked which emails exist)", async () => {
    const u = await loginUser("suspended", { suspendedAt: new Date() })
    expect(await signIn(u.email, "wrong-password")).toBeNull()
    await expect(signIn(u.email, PASSWORD)).rejects.toThrow(/suspended/i)
  })

  it("only says 'locked' to someone who knows the password, and doesn't count attempts while locked", async () => {
    const u = await loginUser("locked", { lockedUntil: new Date(Date.now() + 10 * 60_000), failedLoginAttempts: 0 })
    expect(await signIn(u.email, "wrong-password")).toBeNull()
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginAttempts).toBe(0)
    await expect(signIn(u.email, PASSWORD)).rejects.toThrow(/Too many failed attempts/)
  })

  it("locks the account on the 5th wrong password and tells the visitor", async () => {
    const u = await loginUser("lockout", { failedLoginAttempts: 4 })
    await expect(signIn(u.email, "wrong-password")).rejects.toThrow(/Too many failed attempts/)
    const after = await prisma.user.findUniqueOrThrow({ where: { id: u.id } })
    expect(after.lockedUntil!.getTime()).toBeGreaterThan(Date.now() + 14 * 60_000)
    expect(after.failedLoginAttempts).toBe(0)
  })

  it("counts wrong passwords below the limit", async () => {
    const u = await loginUser("count")
    await signIn(u.email, "wrong-1")
    await signIn(u.email, "wrong-2")
    expect((await prisma.user.findUniqueOrThrow({ where: { id: u.id } })).failedLoginAttempts).toBe(2)
  })

  it("ignores blank credentials", async () => {
    expect(await authorize({ email: "", password: "" })).toBeNull()
  })
})
