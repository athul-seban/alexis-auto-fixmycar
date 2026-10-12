import { describe, it, expect, afterAll, beforeEach } from "vitest"
import { prisma } from "@/lib/prisma"
import { canEmailMarketing, parseUnsubscribeToken, suppress, unsubscribeHeaders, unsubscribeToken } from "@/lib/unsubscribe"

const PREFIX = "unsubtest-"
const email = `${PREFIX}a@example.com`
const clean = () => prisma.emailSuppression.deleteMany({ where: { email: { startsWith: PREFIX } } })
beforeEach(clean)
afterAll(clean)

describe("unsubscribe tokens", () => {
  it("round-trips, and rejects tampering", () => {
    const t = unsubscribeToken("A@Example.com", "g1")
    expect(parseUnsubscribeToken(t)).toEqual({ email: "a@example.com", scope: "g1" })

    const [payload, sig] = t.split(".")
    const forged = Buffer.from(JSON.stringify({ e: "victim@example.com", s: "g1" })).toString("base64url")
    expect(parseUnsubscribeToken(`${forged}.${sig}`)).toBeNull()
    expect(parseUnsubscribeToken(`${payload}.x${sig}`)).toBeNull()
    expect(parseUnsubscribeToken("garbage")).toBeNull()
  })

  it("exposes one-click headers", () => {
    const h = unsubscribeHeaders(email)
    expect(h["List-Unsubscribe"]).toMatch(/^<.+\/unsubscribe\?t=.+>$/)
    expect(h["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click")
  })
})

describe("canEmailMarketing", () => {
  it("honours garage-scoped and global suppression, and is idempotent", async () => {
    expect(await canEmailMarketing(email, "g1")).toBe(true)
    await suppress(email, "g1")
    await suppress(email, "g1")
    expect(await canEmailMarketing(email, "g1")).toBe(false)
    expect(await canEmailMarketing(email, "g2")).toBe(true)
    await suppress(email.toUpperCase(), "ALL")
    expect(await canEmailMarketing(email, "g2")).toBe(false)
    expect(await canEmailMarketing(email)).toBe(false)
  })
})
