import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { defaultContent } from "@/lib/site/content"
import type { PublicSite, PublicSiteResult } from "@/lib/site/public"
import { DEFAULT_THEME } from "@/lib/site/theme"

// The public side of a business website: its metadata, sitemap and robots, with the loader mocked so only what these
// routes decide is under test (what a visitor or a crawler is told for a live, missing, moved or malformed address).

const loadSite = vi.fn<(label: string) => Promise<PublicSiteResult>>()
vi.mock("@/lib/site/public-cached", async () => {
  const actual = await vi.importActual<typeof import("@/lib/site/public-cached")>("@/lib/site/public-cached")
  return { ...actual, getPublicSite: (label: string) => loadSite(label) }
})

import { generateMetadata } from "./[label]/page"
import { GET as sitemap } from "./[label]/sitemap.xml/route"
import { GET as robots } from "./[label]/robots.txt/route"

const site = (over: Partial<PublicSite> = {}): PublicSite => ({
  siteId: "s1", organisationId: "o1", label: "acme", businessName: "Acme Motors", logo: null, theme: DEFAULT_THEME, content: defaultContent("Acme Motors"),
  locations: [], reviews: [], services: [], updatedAt: "2026-10-22T10:00:00.000Z", ...over,
})

const params = (label: string) => ({ params: Promise.resolve({ label }) })
const req = new Request("https://acme.quotemygarage.com/")

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "quotemygarage.com")
  vi.stubEnv("NEXT_PUBLIC_APP_URL", "https://quotemygarage.com")
  loadSite.mockReset()
})
afterEach(() => vi.unstubAllEnvs())

describe("site metadata", () => {
  it("is indexable and canonical to the site's own address when live", async () => {
    loadSite.mockResolvedValue({ state: "ok", site: site() })
    const m = await generateMetadata(params("acme"))
    expect(m.robots).toEqual({ index: true, follow: true })
    expect(m.alternates?.canonical).toBe("https://acme.quotemygarage.com")
    expect(m.title).toEqual({ absolute: "Acme Motors" })
  })

  it("uses the business's own title and description, and its logo instead of the platform's icon", async () => {
    const content = defaultContent("Acme Motors")
    content.seo = { title: "Acme Motors: MOT in York", description: "Honest MOTs." }
    loadSite.mockResolvedValue({ state: "ok", site: site({ content, logo: "https://x.public.blob.vercel-storage.com/orgs/o1/logo.png" }) })
    const m = await generateMetadata(params("acme"))
    expect(m.title).toEqual({ absolute: "Acme Motors: MOT in York" })
    expect(m.description).toBe("Honest MOTs.")
    expect(m.icons).toMatchObject({ icon: "https://x.public.blob.vercel-storage.com/orgs/o1/logo.png" })
  })

  it("is noindex for a missing, moved or unavailable site", async () => {
    for (const result of [{ state: "missing" }, { state: "redirect", label: "new" }] as PublicSiteResult[]) {
      loadSite.mockResolvedValue(result)
      expect((await generateMetadata(params("acme"))).robots, result.state).toEqual({ index: false, follow: false })
    }
  })

  it("never looks a malformed label up", async () => {
    for (const label of ["../etc", "a", "ADMIN", "xn--x", "a b"]) {
      const m = await generateMetadata(params(label))
      expect(m.robots, label).toEqual({ index: false, follow: false })
    }
    expect(loadSite).not.toHaveBeenCalled()
  })
})

describe("site sitemap", () => {
  it("lists the one page on the site's own address with the date it last changed", async () => {
    loadSite.mockResolvedValue({ state: "ok", site: site() })
    const res = await sitemap(req, params("acme"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/xml")
    const xml = await res.text()
    expect(xml).toContain("<loc>https://acme.quotemygarage.com/</loc>")
    expect(xml).toContain("<lastmod>2026-10-22T10:00:00.000Z</lastmod>")
    expect(xml.match(/<url>/g)).toHaveLength(1)
  })

  it("is a plain 404 for a missing or moved site, a malformed label, or when websites are off", async () => {
    for (const result of [{ state: "missing" }, { state: "redirect", label: "new" }] as PublicSiteResult[]) {
      loadSite.mockResolvedValue(result)
      expect((await sitemap(req, params("acme"))).status, result.state).toBe(404)
    }
    expect((await sitemap(req, params("../x"))).status).toBe(404)
    loadSite.mockResolvedValue({ state: "ok", site: site() })
    vi.stubEnv("NEXT_PUBLIC_ROOT_DOMAIN", "")
    expect((await sitemap(req, params("acme"))).status).toBe(404)
  })
})

describe("site robots.txt", () => {
  it("welcomes crawlers and points at the site's own sitemap", async () => {
    loadSite.mockResolvedValue({ state: "ok", site: site() })
    const res = await robots(req, params("acme"))
    expect(res.status).toBe(200)
    const text = await res.text()
    expect(text).toContain("Allow: /")
    expect(text).toContain("Sitemap: https://acme.quotemygarage.com/sitemap.xml")
    expect(text).not.toContain("Disallow")
  })

  it("is a plain 404 when there is no live site at that address", async () => {
    loadSite.mockResolvedValue({ state: "missing" })
    expect((await robots(req, params("acme"))).status).toBe(404)
    expect((await robots(req, params("Admin"))).status).toBe(404)
  })
})
