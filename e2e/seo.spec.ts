import { expect, test } from "@playwright/test"
import { hasHorizontalScroll } from "./helpers"

test.describe("home page honesty and structured data", () => {
  test("shows no invented marketing numbers and emits Organization + WebSite JSON-LD", async ({ page }) => {
    await page.goto("/")
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible()
    const text = await page.locator("body").innerText()
    for (const fake of ["15,000", "50,000", "500K", "£110", "£8,420", "0800 123 4567"]) expect(text).not.toContain(fake)

    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}")["@type"]))
    expect(types).toEqual(expect.arrayContaining(["Organization", "WebSite"]))
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("every footer link goes somewhere that exists", async ({ page, request }) => {
    await page.goto("/")
    const hrefs = await page.locator("footer a[href^='/']").evaluateAll((els) => [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href")!))])
    expect(hrefs.length).toBeGreaterThan(5)
    for (const href of hrefs) {
      const res = await request.get(href)
      expect(res.status(), `${href} should not 404`).toBeLessThan(400)
    }
  })
})

test.describe("location landing pages", () => {
  test("index lists cities, a city page lists its garages, and a service page narrows them", async ({ page }) => {
    await page.goto("/garages")
    await expect(page.getByRole("heading", { name: "Find garages by location" })).toBeVisible()
    await page.getByRole("link", { name: /^London/ }).first().click()

    await expect(page.getByRole("heading", { level: 1, name: "Car garages in London" })).toBeVisible()
    await expect(page.getByRole("navigation", { name: "Breadcrumb" })).toBeVisible()
    const types = await page.locator('script[type="application/ld+json"]').evaluateAll((els) => els.map((e) => JSON.parse(e.textContent ?? "{}")["@type"]))
    expect(types).toEqual(expect.arrayContaining(["BreadcrumbList", "ItemList"]))
    await expect(page.locator('link[rel="canonical"][href$="/garages/london"]')).toHaveCount(1)

    await page.getByRole("link", { name: /MOT Test in London/ }).click()
    await expect(page.getByRole("heading", { level: 1, name: "MOT Test in London" })).toBeVisible()
    await expect(page.getByText(/annual roadworthiness/)).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("unknown places and services are real 404s, not thin indexable pages", async ({ request }) => {
    expect((await request.get("/garages/atlantis")).status()).toBe(404)
    expect((await request.get("/garages/london/not-a-service")).status()).toBe(404)
  })

  test("the sitemap lists the location pages", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text()
    expect(xml).toContain("/garages</loc>")
    expect(xml).toContain("/garages/london</loc>")
    expect(xml).toMatch(/\/garages\/london\/mot<\/loc>/)
  })
})
