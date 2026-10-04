import { expect, test } from "@playwright/test"
import { hasHorizontalScroll } from "./helpers"

test.describe("public site", () => {
  test("home and search fit the screen", async ({ page }) => {
    for (const path of ["/", "/search"]) {
      await page.goto(path)
      await expect(page.locator("main")).toBeVisible()
      expect(await hasHorizontalScroll(page), `${path} scrolls sideways`).toBe(false)
    }
  })

  test("footer credits the developer with a link", async ({ page }) => {
    await page.goto("/")
    const link = page.getByRole("link", { name: "Wireframe Solution" }).first()
    await expect(link).toHaveAttribute("href", "https://wireframesolution.com")
  })

  test("robots.txt hides private areas and the sitemap exists", async ({ request }) => {
    const robots = await (await request.get("/robots.txt")).text()
    expect(robots).toContain("Disallow: /admin")
    expect(robots).toContain("Disallow: /booking/")
    expect(robots).toContain("Sitemap:")
    expect((await request.get("/sitemap.xml")).status()).toBe(200)
  })

  test("a garage page has a title, canonical link and structured data", async ({ page }) => {
    await page.goto("/garage/premier-auto-services")
    await expect(page).toHaveTitle(/Premier Auto Services/i)
    await expect(page.locator("link[rel=canonical]")).toHaveAttribute("href", /\/garage\/premier-auto-services$/)
    const ld = await page.locator("script[type='application/ld+json']").first().textContent()
    expect(JSON.parse(ld!)["@type"]).toBe("AutoRepair")
  })

  test("an unknown garage is not indexable", async ({ page }) => {
    await page.goto("/garage/does-not-exist")
    await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/)
  })

  test("a bad booking link says so and is noindex", async ({ page }) => {
    await page.goto("/booking/" + "a".repeat(32))
    await expect(page.getByText(/couldn.t find that booking/i)).toBeVisible()
    await expect(page.locator("meta[name=robots]")).toHaveAttribute("content", /noindex/)
  })

  test("the booking widget loads without the site chrome", async ({ page }) => {
    await page.goto("/widget/premier-auto-services")
    await expect(page.getByRole("banner")).toHaveCount(0)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})
