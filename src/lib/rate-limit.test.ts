import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"

const KEY = "test:ratelimit:"
const clean = () => prisma.rateLimitHit.deleteMany({ where: { key: { startsWith: KEY } } })

beforeEach(clean)
afterAll(clean)

describe("rateLimit", () => {
  const t0 = new Date("2026-10-10T10:00:00Z")
  const at = (s: number) => new Date(t0.getTime() + s * 1000)

  it("allows up to the limit then blocks, reporting when a slot frees up", async () => {
    for (let i = 0; i < 3; i++) expect((await rateLimit(`${KEY}a`, 3, 60_000, at(i))).ok).toBe(true)
    const blocked = await rateLimit(`${KEY}a`, 3, 60_000, at(10))
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfter).toBe(50) // oldest hit at t=0 leaves the 60s window at t=60
    expect(await prisma.rateLimitHit.count({ where: { key: `${KEY}a` } })).toBe(3) // a blocked call isn't recorded
  })

  it("lets attempts through again once old ones age out of the window", async () => {
    for (let i = 0; i < 2; i++) await rateLimit(`${KEY}b`, 2, 60_000, at(i))
    expect((await rateLimit(`${KEY}b`, 2, 60_000, at(30))).ok).toBe(false)
    expect((await rateLimit(`${KEY}b`, 2, 60_000, at(62))).ok).toBe(true)
  })

  it("keeps different keys independent", async () => {
    await rateLimit(`${KEY}c`, 1, 60_000, at(0))
    expect((await rateLimit(`${KEY}c`, 1, 60_000, at(1))).ok).toBe(false)
    expect((await rateLimit(`${KEY}d`, 1, 60_000, at(1))).ok).toBe(true)
  })
})
