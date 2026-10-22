import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { APEX_REDIRECT_HEADER } from "@/lib/org/host"
import { DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT } from "./route"

// The handler proxy.ts rewrites to when a request on a business's address belongs to the main site. It answers the 308 itself
// and only ever to the configured main site.

beforeEach(() => vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://quotemygarage.com"))
afterEach(() => vi.unstubAllEnvs())

const req = (target: string | null, method = "GET") => new Request("https://acme.quotemygarage.com/sites/-/main-site", { method, headers: target ? { [APEX_REDIRECT_HEADER]: target } : {} })

describe("the main-site redirect handler", () => {
  it("answers a 308 to the destination the proxy set, whatever the method (so a form post isn't turned into a GET)", async () => {
    for (const [handler, method] of [[GET, "GET"], [HEAD, "HEAD"], [POST, "POST"], [PUT, "PUT"], [PATCH, "PATCH"], [DELETE, "DELETE"], [OPTIONS, "OPTIONS"]] as const) {
      const res = await handler(req("https://quotemygarage.com/login?next=%2Fgarage-dashboard", method))
      expect(res.status, method).toBe(308)
      expect(res.headers.get("location"), method).toBe("https://quotemygarage.com/login?next=%2Fgarage-dashboard")
      expect(res.headers.get("cache-control"), method).toBe("no-store")
    }
  })

  it("is a plain 404 when there is no destination, or one that isn't the main site: it never redirects anywhere else", async () => {
    for (const target of [null, "https://evil.example/phish", "https://quotemygarage.com.evil.example/", "//evil.example", "javascript:alert(1)", "/login"]) {
      const res = await GET(req(target))
      expect(res.status, String(target)).toBe(404)
      expect(res.headers.get("location"), String(target)).toBeNull()
      expect(res.headers.get("x-robots-tag")).toBe("noindex")
    }
  })

  it("is a 404 when the main site's address isn't configured", async () => {
    vi.stubEnv("NEXT_PUBLIC_APP_URL", "")
    expect((await GET(req("https://quotemygarage.com/"))).status).toBe(404)
  })
})
