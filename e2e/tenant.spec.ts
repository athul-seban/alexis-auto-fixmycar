import AxeBuilder from "@axe-core/playwright"
import { expect, test, type APIRequestContext } from "@playwright/test"
import { hasHorizontalScroll } from "./helpers"

// A business's website on its own subdomain: the seeded demo site is premier-demo.localhost. Chromium resolves *.localhost
// itself; plain HTTP checks send the Host header to 127.0.0.1 so they don't depend on the machine's DNS.
// Needs the server to be started with NEXT_PUBLIC_ROOT_DOMAIN=localhost (playwright.config.ts does that).

const PORT = Number(process.env.E2E_PORT ?? 3000)
// Links and canonical URLs are built from NEXT_PUBLIC_APP_URL, so when running on another port set it to match.
const APEX = (process.env.NEXT_PUBLIC_APP_URL ?? `http://localhost:${PORT}`).replace(/\/+$/, "")
const SITE = `http://premier-demo.localhost:${new URL(APEX).port || PORT}`
const raw = (request: APIRequestContext, host: string, path: string, headers: Record<string, string> = {}) =>
  request.get(`http://127.0.0.1:${PORT}${path}`, { headers: { Host: `${host}:${PORT}`, ...headers }, maxRedirects: 0, failOnStatusCode: false })

test.beforeEach(async ({ request }) => {
  const probe = await raw(request, "premier-demo.localhost", "/login")
  test.skip(probe.status() !== 308, "The server isn't running with NEXT_PUBLIC_ROOT_DOMAIN=localhost, so websites are off")
})

test.describe("a published business website", () => {
  test("shows the business, its content and its location, with the right metadata", async ({ page }) => {
    const res = await page.goto(`${SITE}/`)
    expect(res?.status()).toBe(200)
    await expect(page.getByRole("heading", { level: 1, name: "MOTs and repairs, done properly" })).toBeVisible()
    await expect(page.locator("strong", { hasText: "explain" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Find us" })).toBeVisible()
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", SITE)
    await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /index/)
    await expect(page.locator("meta[name=robots]")).not.toHaveAttribute("content", /noindex/)
    expect(await hasHorizontalScroll(page)).toBe(false)

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.flatMap((e) => (JSON.parse(e.textContent ?? "{}")["@graph"] ?? []).map((n: { "@type": string }) => n["@type"])))
    expect(types).toEqual(expect.arrayContaining(["Organization", "AutoRepair"]))
  })

  test("has no accessibility violations", async ({ page }) => {
    await page.goto(`${SITE}/`)
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze()
    expect(violations.map((v) => `${v.id}: ${v.nodes[0]?.html.slice(0, 80)}`)).toEqual([])
  })

  test("serves its own sitemap and robots.txt on its own address", async ({ request }) => {
    const sitemap = await raw(request, "premier-demo.localhost", "/sitemap.xml")
    expect(sitemap.status()).toBe(200)
    expect(await sitemap.text()).toContain(`<loc>${SITE}/</loc>`)
    const robots = await raw(request, "premier-demo.localhost", "/robots.txt")
    expect(robots.status()).toBe(200)
    expect(await robots.text()).toContain(`Sitemap: ${SITE}/sitemap.xml`)
  })

  test("sends login, dashboards and the marketplace pages to the main site, keeping the path", async ({ request }) => {
    for (const path of ["/login", "/garage-dashboard", "/search?service=MOT"]) {
      const res = await raw(request, "premier-demo.localhost", path)
      expect(res.status(), path).toBe(308)
      expect(res.headers()["location"], path).toBe(`${APEX}${path}`)
    }
  })

  test("exposes no API and no internal routes", async ({ request }) => {
    for (const path of ["/api/garages", "/api/auth/session", "/sites/premier-demo", "/sites/premier-demo/sitemap.xml"]) {
      expect((await raw(request, "premier-demo.localhost", path)).status(), path).toBe(404)
    }
  })
})

test.describe("addresses that aren't a live website", () => {
  test("an unknown address is a real 404 with a plain page, not the marketplace", async ({ page }) => {
    const res = await page.goto(`http://no-such-business.localhost:${PORT}/`)
    expect(res?.status()).toBe(404)
    await expect(page.getByRole("heading", { name: /this website isn.t available/i })).toBeVisible()
    await expect(page.getByRole("link", { name: /find a garage/i })).toHaveAttribute("href", APEX)
  })

  test("a reserved name is the marketplace itself, not a site", async ({ request }) => {
    expect((await raw(request, "admin.localhost", "/")).status()).toBe(200)
  })

  test("the marketplace refuses the internal site route and a forged site header", async ({ request }) => {
    expect((await raw(request, "localhost", "/sites/premier-demo")).status()).toBe(404)
    expect((await raw(request, "localhost", "/", { "x-qmg-site": "premier-demo" })).status()).toBe(400)
  })
})
