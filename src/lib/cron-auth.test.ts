import { describe, it, expect, afterEach, beforeEach } from "vitest"
import { isCronRequest } from "@/lib/cron-auth"

const req = (authorization?: string) => new Request("http://localhost/api/cron/x", { headers: authorization === undefined ? {} : { authorization } })
const original = process.env.CRON_SECRET

beforeEach(() => {
  process.env.CRON_SECRET = "s3cret-value"
})
afterEach(() => {
  if (original === undefined) delete process.env.CRON_SECRET
  else process.env.CRON_SECRET = original
})

describe("isCronRequest", () => {
  it("accepts the exact bearer secret", () => {
    expect(isCronRequest(req("Bearer s3cret-value"))).toBe(true)
  })

  it("rejects a missing, wrong, prefix, longer or differently-cased secret", () => {
    for (const h of [undefined, "", "Bearer ", "Bearer wrong", "Bearer s3cret-valu", "Bearer s3cret-value!", "bearer s3cret-value", "s3cret-value", "Bearer  s3cret-value"]) {
      expect(isCronRequest(req(h)), String(h)).toBe(false)
    }
  })

  it("is closed when CRON_SECRET isn't set, even to a request that sends 'Bearer undefined' or nothing", () => {
    delete process.env.CRON_SECRET
    expect(isCronRequest(req("Bearer undefined"))).toBe(false)
    expect(isCronRequest(req("Bearer "))).toBe(false)
    expect(isCronRequest(req())).toBe(false)
    process.env.CRON_SECRET = ""
    expect(isCronRequest(req("Bearer "))).toBe(false)
  })
})
