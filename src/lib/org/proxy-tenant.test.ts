import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"
import proxy, { SITE_HEADER, config } from "../../../proxy"

// Drives proxy.ts as a request on a tenant host or on the marketplace itself, with websites switched on.

const ROOT = "quotemygarage.com"
const APP = "https://quotemygarage.com"

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", ROOT)
  vi.stubEnv("NEXT_PUBLIC_APP_URL", APP)
})
afterEach(() => vi.unstubAllEnvs())

const call = (host: string, path: string, init: { method?: string; headers?: Record<string, string> } = {}) =>
  proxy(new NextRequest(`https://${host}${path}`, { method: init.method ?? "GET", headers: { host, ...init.headers } }), {} as never) as Response

/** What a rewrite to the internal route looks like to a test. */
const rewriteTarget = (res: Response) => res.headers.get("x-middleware-rewrite")
const forwarded = (res: Response, name: string) => res.headers.get(`x-middleware-request-${name}`)

describe("a business site's own address", () => {
  const host = "acme.quotemygarage.com"

  it("serves the site's page, share image, sitemap and robots by rewriting to the internal route", () => {
    for (const [path, internal] of [["/", "/sites/acme"], ["/opengraph-image", "/sites/acme/opengraph-image"], ["/sitemap.xml", "/sites/acme/sitemap.xml"], ["/robots.txt", "/sites/acme/robots.txt"]]) {
      const res = call(host, path)
      expect(new URL(rewriteTarget(res)!).pathname, path).toBe(internal)
      expect(forwarded(res, SITE_HEADER), path).toBe("acme")
    }
  })

  it("keeps the visitor's query string out of the way of the rewrite", () => {
    const res = call(host, "/?utm_source=flyer")
    expect(new URL(rewriteTarget(res)!).pathname).toBe("/sites/acme")
  })

  it("sends everything that isn't a website page to the main site with a 308, keeping the path and query", () => {
    for (const path of ["/login", "/garage-dashboard", "/admin/users", "/search", "/garage/some-garage"]) {
      const res = call(host, `${path}?x=1`)
      expect(res.status, path).toBe(308)
      expect(res.headers.get("location"), path).toBe(`${APP}${path}?x=1`)
    }
  })

  it("can't be turned into an open redirect by a crafted path or host", () => {
    for (const path of ["//evil.com", "/\\evil.com"]) {
      const res = call(host, path)
      expect(new URL(res.headers.get("location") ?? APP).host, path).toBe("quotemygarage.com")
    }
    // A host that merely contains the root domain is not a site.
    expect(call("acme.quotemygarage.com.evil.com", "/login").headers.get("location")).toBeNull()
  })

  it("never serves the internal /sites routes or any API on a site's address", () => {
    for (const path of ["/sites/other", "/sites/other/sitemap.xml", "/api/garages", "/api/auth/session"]) {
      const res = call(host, path)
      expect(res.status, path).toBe(404)
      expect(res.headers.get("x-robots-tag")).toBe("noindex")
    }
  })

  it("lets static assets through", () => {
    for (const path of ["/_next/static/x.js", "/icons/192"]) {
      const res = call(host, path)
      expect(res.status, path).toBe(200)
      expect(res.headers.get("x-middleware-rewrite")).toBeNull()
      expect(res.headers.get("location")).toBeNull()
    }
  })

  it("answers the favicon with an empty 204, so there is no 404 in the console", () => {
    const res = call(host, "/favicon.ico")
    expect(res.status).toBe(204)
    expect(res.headers.get("location")).toBeNull()
  })

  it("replaces any site header the visitor sent with the right one, so a forged label can't pick another site", () => {
    const res = call(host, "/", { headers: { [SITE_HEADER]: "victim" } })
    expect(forwarded(res, SITE_HEADER)).toBe("acme")
    expect(new URL(rewriteTarget(res)!).pathname).toBe("/sites/acme")
    // Passed-through assets don't carry a label at all.
    expect(forwarded(call(host, "/_next/static/x.js", { headers: { [SITE_HEADER]: "victim" } }), SITE_HEADER)).toBeNull()
  })

  it("skips language routing and sets no cookies", () => {
    const res = call(host, "/")
    expect(forwarded(res, "x-qmg-locale")).toBeNull()
    expect(res.headers.get("set-cookie")).toBeNull()
  })
})

describe("the marketplace itself", () => {
  it("is unchanged: pages, portals and APIs behave as before", () => {
    expect(call("quotemygarage.com", "/").status).toBe(200)
    expect(call("www.quotemygarage.com", "/search").status).toBe(200)
    expect(call("quotemygarage.com", "/robots.txt").status).toBe(200)
    expect(call("quotemygarage.com", "/sitemap.xml").status).toBe(200)
    expect(rewriteTarget(call("quotemygarage.com", "/"))).toBeNull()
  })

  it("can't open the internal site routes directly", () => {
    for (const path of ["/sites", "/sites/acme", "/sites/acme/sitemap.xml"]) expect(call("quotemygarage.com", path).status, path).toBe(404)
  })

  it("refuses a request that carries the internal site header: it can only be forged", () => {
    expect(call("quotemygarage.com", "/", { headers: { [SITE_HEADER]: "acme" } }).status).toBe(400)
    expect(call("quotemygarage.com", "/api/garages", { headers: { [SITE_HEADER]: "acme" } }).status).toBe(400)
    expect(call("quotemygarage.com", "/garage-dashboard", { headers: { [SITE_HEADER]: "acme" } }).status).toBe(400)
  })

  it("treats reserved names and unrelated hosts as the marketplace, not as sites", () => {
    for (const host of ["admin.quotemygarage.com", "api.quotemygarage.com", "my-preview.vercel.app", "127.0.0.1:3000"]) {
      const res = call(host, "/")
      expect(res.status, host).toBe(200)
      expect(rewriteTarget(res), host).toBeNull()
    }
  })

  it("is off entirely when no root domain is configured", () => {
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "")
    const res = call("acme.quotemygarage.com", "/")
    expect(rewriteTarget(res)).toBeNull()
    expect(res.status).toBe(200)
  })
})

describe("the proxy matcher", () => {
  it("covers the pages, the API, and the dotted files a site answers itself (they'd otherwise bypass the proxy)", () => {
    expect(config.matcher).toEqual(expect.arrayContaining(["/api/:path*", "/sitemap.xml", "/robots.txt", "/favicon.ico"]))
  })

  it("leaves the marketplace's own favicon alone", () => {
    const res = call("quotemygarage.com", "/favicon.ico")
    expect(res.status).toBe(200)
    expect(rewriteTarget(res)).toBeNull()
  })
})
