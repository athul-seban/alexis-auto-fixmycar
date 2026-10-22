import { describe, expect, it } from "vitest"
import { isCrossSiteRequest, isCrossSiteWrite, type OriginCheckInput } from "./origin"

const base: OriginCheckInput = { method: "POST", origin: null, secFetchSite: null, hosts: ["app.example.com", null], appOrigin: "https://app.example.com" }
const blocked = (over: Partial<OriginCheckInput>) => isCrossSiteWrite({ ...base, ...over })

describe("isCrossSiteWrite", () => {
  it("allows our own pages", () => {
    expect(blocked({ origin: "https://app.example.com", secFetchSite: "same-origin" })).toBe(false)
    expect(blocked({ origin: "https://APP.example.com" })).toBe(false) // host names are case-insensitive
  })

  it("blocks another site and, importantly, a sibling subdomain of the same site", () => {
    expect(blocked({ origin: "https://evil.com", secFetchSite: "cross-site" })).toBe(true)
    expect(blocked({ origin: "https://garage-one.example.com", secFetchSite: "same-site" })).toBe(true)
    expect(blocked({ origin: "https://example.com" })).toBe(true)
    expect(blocked({ origin: "https://app.example.com.evil.com" })).toBe(true)
  })

  it("blocks an unusable Origin rather than trusting it", () => {
    expect(blocked({ origin: "null" })).toBe(true)
    expect(blocked({ origin: "not a url" })).toBe(true)
    expect(blocked({ origin: "" })).toBe(true)
  })

  it("uses Sec-Fetch-Site when there is no Origin", () => {
    expect(blocked({ secFetchSite: "same-origin" })).toBe(false)
    expect(blocked({ secFetchSite: "none" })).toBe(false) // typed in the address bar / bookmarks
    expect(blocked({ secFetchSite: "same-site" })).toBe(true)
    expect(blocked({ secFetchSite: "cross-site" })).toBe(true)
  })

  it("lets non-browser callers through (webhooks, cron, curl): they can't ride a cookie", () => {
    expect(blocked({})).toBe(false)
  })

  it("never blocks reads", () => {
    for (const method of ["GET", "HEAD", "OPTIONS", "get"]) expect(blocked({ method, origin: "https://evil.com", secFetchSite: "cross-site" }), method).toBe(false)
  })

  it("blocks every kind of write", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "patch"]) expect(blocked({ method, origin: "https://evil.com" }), method).toBe(true)
  })

  it("accepts the host the request was forwarded for, or the configured app origin, when they differ from the Host header", () => {
    expect(blocked({ origin: "https://www.example.com", hosts: ["internal:3000", "www.example.com"], appOrigin: null })).toBe(false)
    expect(blocked({ origin: "https://www.example.com", hosts: ["internal:3000", null], appOrigin: "https://www.example.com" })).toBe(false)
    expect(blocked({ origin: "https://www.example.com", hosts: ["internal:3000", null], appOrigin: "https://other.example.com" })).toBe(true)
  })

  it("keeps the port in the comparison", () => {
    expect(blocked({ origin: "http://localhost:3000", hosts: ["localhost:3000"], appOrigin: null })).toBe(false)
    expect(blocked({ origin: "http://localhost:4000", hosts: ["localhost:3000"], appOrigin: null })).toBe(true)
  })
})

describe("isCrossSiteRequest", () => {
  const post = (headers: Record<string, string>) => new Request("https://app.example.com/api/x", { method: "POST", headers })

  it("reads the headers off a Request", () => {
    expect(isCrossSiteRequest(post({ origin: "https://evil.com", host: "app.example.com" }), "https://app.example.com")).toBe(true)
    expect(isCrossSiteRequest(post({ origin: "https://app.example.com", host: "app.example.com" }), "https://app.example.com")).toBe(false)
    expect(isCrossSiteRequest(post({ "sec-fetch-site": "same-site" }), null)).toBe(true)
    expect(isCrossSiteRequest(post({}), null)).toBe(false)
  })
})
