import { afterAll, beforeEach, describe, expect, it, vi } from "vitest"
import { prisma } from "@/lib/prisma"
import { hashIp } from "@/lib/portal/ip-hash"
import { POST } from "./route"

const sendMail = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/mail", () => ({ sendMail: (...a: unknown[]) => sendMail(...a) }))

const EMAIL = "ratelimit-forgot@example.com"
const IPS = ["203.0.113.11", "203.0.113.12"]

const post = (email: string, ip: string) =>
  POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip }, body: JSON.stringify({ email }) }))

async function clean() {
  await prisma.rateLimitHit.deleteMany({ where: { OR: [{ key: { startsWith: `forgot:email:${EMAIL}` } }, ...IPS.map((ip) => ({ key: `forgot:ip:${hashIp(ip)}` }))] } })
  await prisma.verificationToken.deleteMany({ where: { identifier: EMAIL } })
  await prisma.user.deleteMany({ where: { email: EMAIL } })
}

beforeEach(async () => {
  sendMail.mockClear()
  await clean()
  await prisma.user.create({ data: { email: EMAIL, role: "OWNER", password: "x" } })
})
afterAll(clean)

describe("POST /api/auth/forgot-password rate limits", () => {
  it("sends at most 3 emails per address per hour but always answers success (no enumeration)", async () => {
    for (let i = 0; i < 5; i++) {
      const res = await post(EMAIL, IPS[0])
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ success: true })
    }
    expect(sendMail).toHaveBeenCalledTimes(3)
  })

  it("blocks a single visitor after 10 requests with a Retry-After", async () => {
    for (let i = 0; i < 10; i++) expect((await post(`nobody${i}@example.com`, IPS[1])).status).toBe(200)
    const blocked = await post("nobody-extra@example.com", IPS[1])
    expect(blocked.status).toBe(429)
    expect(Number(blocked.headers.get("Retry-After"))).toBeGreaterThan(0)
  })

  it("doesn't limit loopback callers (local dev and tests)", async () => {
    for (let i = 0; i < 12; i++) expect((await post(`lo${i}@example.com`, "::1")).status).toBe(200)
  })

  it("doesn't limit callers whose IP can't be determined", async () => {
    const noIp = () => POST(new Request("http://x", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: "x@example.com" }) }))
    for (let i = 0; i < 12; i++) expect((await noIp()).status).toBe(200)
  })
})
