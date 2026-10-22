import { describe, expect, it } from "vitest"
import { apexUrl, classifyHost, hostnameOf, isTenantLabel, normaliseRootDomain, siteOrigin, tenantRoute } from "./host"

describe("isTenantLabel", () => {
  it("accepts what a business could own and nothing else", () => {
    expect(isTenantLabel("acme-motors")).toBe(true)
    for (const bad of ["", "ab", "admin", "www", "a.b", "ACME", "acme_motors", "-acme", "xn--acme", "acme/../x", "acme motors", "аpple"]) expect(isTenantLabel(bad), bad).toBe(false)
  })
})

const ROOT = "quotemygarage.com"
const classify = (h: string | null) => classifyHost(h, ROOT)

describe("hostnameOf", () => {
  it("lower-cases and drops the port", () => {
    expect(hostnameOf("Acme.QuoteMyGarage.com:3000")).toBe("acme.quotemygarage.com")
    expect(hostnameOf("localhost")).toBe("localhost")
  })

  it("refuses anything that isn't a plain host", () => {
    for (const bad of ["", null, undefined, "a b.com", "evil.com/path", "user@evil.com", "[::1]", "a..com", "evil.com\\x", "ex ample.com", "http://evil.com", "a.com:99999999"]) {
      expect(hostnameOf(bad as string | null), String(bad)).toBeNull()
    }
  })
})

describe("classifyHost", () => {
  it("treats the root, www and unrelated hosts as the apex", () => {
    for (const h of ["quotemygarage.com", "www.quotemygarage.com", "QUOTEMYGARAGE.COM:443", "my-app-git-branch.vercel.app", "127.0.0.1:3000", "localhost:3000", null]) {
      expect(classify(h), String(h)).toEqual({ kind: "apex" })
    }
  })

  it("recognises a business site by its single label", () => {
    expect(classify("acme.quotemygarage.com")).toEqual({ kind: "tenant", label: "acme" })
    expect(classify("Acme-Motors.QuoteMyGarage.com:443")).toEqual({ kind: "tenant", label: "acme-motors" })
  })

  it("never treats a reserved or malformed label as a site", () => {
    for (const h of ["admin.quotemygarage.com", "api.quotemygarage.com", "mail.quotemygarage.com", "widget.quotemygarage.com", "ab.quotemygarage.com", "xn--acme.quotemygarage.com", "-acme.quotemygarage.com", "a_b.quotemygarage.com"]) {
      expect(classify(h), h).toEqual({ kind: "apex" })
    }
  })

  it("is one label deep: nested names and look-alike suffixes are not sites", () => {
    for (const h of ["a.b.quotemygarage.com", "acme.quotemygarage.com.evil.com", "acmequotemygarage.com", "acme.evil-quotemygarage.com", "acme.quotemygarage.co"]) {
      expect(classify(h), h).toEqual({ kind: "apex" })
    }
  })

  it("is switched off without a root domain", () => {
    expect(classifyHost("acme.quotemygarage.com", undefined)).toEqual({ kind: "apex" })
    expect(classifyHost("acme.quotemygarage.com", "")).toEqual({ kind: "apex" })
    expect(classifyHost("acme.quotemygarage.com", "not a domain")).toEqual({ kind: "apex" })
  })

  it("works for local development on *.localhost", () => {
    expect(classifyHost("acme.localhost:3000", "localhost")).toEqual({ kind: "tenant", label: "acme" })
    expect(classifyHost("localhost:3000", "localhost")).toEqual({ kind: "apex" })
  })
})

describe("normaliseRootDomain", () => {
  it("accepts a plain domain and rejects junk", () => {
    expect(normaliseRootDomain("QuoteMyGarage.com")).toBe("quotemygarage.com")
    expect(normaliseRootDomain("localhost:3000")).toBe("localhost")
    for (const bad of [null, undefined, "", ".com", "https://x.com", "x.com/path"]) expect(normaliseRootDomain(bad as string | null), String(bad)).toBeNull()
  })
})

describe("tenantRoute", () => {
  it("serves the site's own pages by rewriting to the internal route", () => {
    expect(tenantRoute("acme", "/")).toEqual({ action: "rewrite", path: "/sites/acme" })
    expect(tenantRoute("acme", "/opengraph-image")).toEqual({ action: "rewrite", path: "/sites/acme/opengraph-image" })
    expect(tenantRoute("acme", "/sitemap.xml")).toEqual({ action: "rewrite", path: "/sites/acme/sitemap.xml" })
    expect(tenantRoute("acme", "/robots.txt")).toEqual({ action: "rewrite", path: "/sites/acme/robots.txt" })
    expect(tenantRoute("acme", "/robots.txt/")).toEqual({ action: "rewrite", path: "/sites/acme/robots.txt" })
  })

  it("lets static assets through untouched", () => {
    for (const p of ["/_next/static/chunks/a.js", "/_next/image", "/icons/192"]) expect(tenantRoute("acme", p), p).toEqual({ action: "pass" })
  })

  it("answers the favicon with nothing rather than the marketplace's icon (the site names its own)", () => {
    expect(tenantRoute("acme", "/favicon.ico")).toEqual({ action: "empty" })
  })

  it("sends everything that isn't a website page (login, dashboards, admin, other pages) to the main site", () => {
    for (const p of ["/login", "/garage-dashboard", "/admin/users", "/dashboard", "/search", "/garage/some-garage", "/post-job", "/widget/x", "/join/abc", "/random"]) {
      expect(tenantRoute("acme", p), p).toEqual({ action: "apex" })
    }
  })

  it("never serves the internal /sites routes or any API on a tenant host", () => {
    for (const p of ["/sites", "/sites/other", "/sites/other/sitemap.xml", "/api/garages", "/api/auth/session", "/api"]) {
      expect(tenantRoute("acme", p), p).toEqual({ action: "notFound" })
    }
  })
})

describe("apexUrl", () => {
  const app = "https://quotemygarage.com"

  it("is built from the configured app URL and the request's own path and query", () => {
    expect(apexUrl(app, "/login", "?callbackUrl=%2Fgarage-dashboard")).toBe("https://quotemygarage.com/login?callbackUrl=%2Fgarage-dashboard")
    expect(apexUrl(app, "/", "")).toBe("https://quotemygarage.com/")
  })

  it("can't be turned into an open redirect by a crafted path", () => {
    for (const path of ["//evil.com", "/\\evil.com", "evil.com", "https://evil.com"]) {
      expect(apexUrl(app, path, ""), path).toBe("https://quotemygarage.com/")
    }
    expect(new URL(apexUrl(app, "//evil.com/x", "")!).host).toBe("quotemygarage.com")
  })

  it("gives nothing when the app URL is missing or not http(s)", () => {
    expect(apexUrl(undefined, "/", "")).toBeNull()
    expect(apexUrl("javascript:alert(1)", "/", "")).toBeNull()
    expect(apexUrl("nonsense", "/", "")).toBeNull()
  })
})

describe("siteOrigin", () => {
  it("is https on a real domain", () => {
    expect(siteOrigin("acme", ROOT, "https://quotemygarage.com")).toBe("https://acme.quotemygarage.com")
  })

  it("keeps the dev server's port on localhost", () => {
    expect(siteOrigin("acme", "localhost", "http://localhost:3000")).toBe("http://acme.localhost:3000")
  })

  it("is null when websites are off", () => {
    expect(siteOrigin("acme", undefined, "https://quotemygarage.com")).toBeNull()
  })
})
