import { describe, it, expect } from "vitest"
import { clientIp, hashIp } from "@/lib/portal/ip-hash"

const h = (o: Record<string, string>) => new Headers(o)

describe("clientIp", () => {
  it("uses the first X-Forwarded-For hop", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7, 10.0.0.1, 10.0.0.2" }))).toBe("203.0.113.7")
  })

  it("prefers Vercel's unspoofable header over X-Forwarded-For", () => {
    expect(clientIp(h({ "x-vercel-forwarded-for": "198.51.100.9", "x-forwarded-for": "6.6.6.6" }))).toBe("198.51.100.9")
  })

  it("with trusted proxy hops, ignores spoofed entries a client prepended", () => {
    // client sent "1.1.1.1"; our one trusted proxy appended the real address 203.0.113.7.
    const headers = h({ "x-forwarded-for": "1.1.1.1, 203.0.113.7" })
    expect(clientIp(headers, 1)).toBe("203.0.113.7")
    expect(clientIp(headers, 2)).toBe("1.1.1.1")
    expect(clientIp(headers, 9)).toBe("1.1.1.1") // never indexes out of range
    expect(clientIp(headers, 0)).toBe("1.1.1.1") // default behaviour: first entry
  })

  it("falls back to X-Real-IP, then 'unknown'", () => {
    expect(clientIp(h({ "x-real-ip": "198.51.100.4" }))).toBe("198.51.100.4")
    expect(clientIp(h({}))).toBe("unknown")
    expect(clientIp(h({ "x-forwarded-for": "  " }))).toBe("unknown")
  })
})

describe("hashIp", () => {
  it("is deterministic, fixed-length and hides the address", () => {
    const a = hashIp("203.0.113.7")
    expect(a).toBe(hashIp("203.0.113.7"))
    expect(a).toHaveLength(32)
    expect(a).not.toContain("203")
    expect(hashIp("203.0.113.8")).not.toBe(a)
  })
})
