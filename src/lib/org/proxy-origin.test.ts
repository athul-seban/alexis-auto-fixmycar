import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"
import proxy, { config } from "../../../proxy"

// proxy.ts is not under vitest's include, so this drives it directly: the cross-site write guard must hold on every
// /api route, with the few documented exceptions.

const call = (path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  proxy(new NextRequest(`https://app.example.com${path}`, { method: init.method ?? "POST", headers: { host: "app.example.com", ...init.headers } }), {} as never)

describe("proxy: cross-site writes to /api", () => {
  it("runs on /api (the matcher includes it), alongside the pages", () => {
    expect(config.matcher).toContain("/api/:path*")
  })

  it("blocks a write from another site or a sibling subdomain, on any route", async () => {
    for (const path of ["/api/garage/staff", "/api/admin/garages", "/api/bookings", "/api/messages", "/api/job-requests/x/respond"]) {
      for (const origin of ["https://evil.com", "https://some-garage.example.com"]) {
        const res = (await call(path, { headers: { origin } })) as Response
        expect(res.status, `${path} from ${origin}`).toBe(403)
        expect(await res.json()).toEqual({ error: "Cross-site request blocked" })
      }
    }
  })

  it("lets our own pages through", async () => {
    const res = (await call("/api/garage/staff", { headers: { origin: "https://app.example.com", "sec-fetch-site": "same-origin" } })) as Response
    expect(res.status).toBe(200) // NextResponse.next(): the handler runs
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("lets webhooks and cron through (no browser headers), and never blocks a read", async () => {
    expect(((await call("/api/stripe/webhook")) as Response).headers.get("x-middleware-next")).toBe("1")
    expect(((await call("/api/cron/reminders")) as Response).headers.get("x-middleware-next")).toBe("1")
    expect(((await call("/api/garages", { method: "GET", headers: { origin: "https://evil.com" } })) as Response).headers.get("x-middleware-next")).toBe("1")
  })

  it("leaves /api/auth to NextAuth's own CSRF token", async () => {
    const res = (await call("/api/auth/callback/credentials", { headers: { origin: "https://evil.com" } })) as Response
    expect(res.headers.get("x-middleware-next")).toBe("1")
  })

  it("does not apply the page logic (language headers, redirects) to API calls", async () => {
    const res = (await call("/api/locale", { method: "GET" })) as Response
    expect(res.headers.get("x-middleware-request-x-qmg-locale")).toBeNull()
  })
})
