import { expect, test, type APIRequestContext } from "@playwright/test"
import { hasHorizontalScroll, login } from "./helpers"

// Languages: English at normal URLs, French at /fr, German at /de (translated pages only). Content is editable by an
// admin; these tests publish a change and always reset it afterwards.

const reset = (request: APIRequestContext, key: string, locale: string) =>
  request.put("/api/admin/content", { data: { key, locale, action: "reset" } })

test.describe("language URLs", () => {
  test("French home page: lang attribute, French copy, hreflang and canonical", async ({ page, isMobile }) => {
    await page.goto("/fr")
    await expect(page.locator("html")).toHaveAttribute("lang", "fr")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Trouvez des")
    if (isMobile) await page.getByRole("button", { name: "Afficher ou masquer le menu" }).click()
    await expect(page.getByRole("link", { name: "Se connecter" }).first()).toBeVisible()
    expect(await page.locator("body").innerText()).not.toContain("Find Trusted")

    const alternates = await page.locator('link[rel="alternate"][hreflang]').evaluateAll((els) => els.map((e) => [e.getAttribute("hreflang"), e.getAttribute("href")]))
    const langs = alternates.map(([l]) => l)
    expect(langs).toEqual(expect.arrayContaining(["en-GB", "fr", "de", "x-default"]))
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/fr$/)
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("German pages translate the page body and the shared header and footer", async ({ page }) => {
    await page.goto("/de/for-garages")
    await expect(page.locator("html")).toHaveAttribute("lang", "de")
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Werkstatt")
    await expect(page.getByRole("heading", { name: "So funktioniert es für Werkstätten" })).toBeVisible()
    await expect(page.locator("footer")).toContainText("Leistungen")
    const body = await page.locator("body").innerText()
    expect(body).not.toContain("15,000")
    expect(body).not.toContain("£2,500")
  })

  test("the language switcher moves between versions of the same page", async ({ page }) => {
    await page.goto("/how-it-works")
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB")
    await page.getByRole("navigation", { name: "Language" }).first().getByRole("link", { name: "FR" }).click()
    await expect(page).toHaveURL(/\/fr\/how-it-works$/)
    await expect(page.getByRole("heading", { level: 1 })).toContainText("Comment fonctionne Quote My Garage")
    await page.getByRole("navigation", { name: "Langue" }).first().getByRole("link", { name: "EN" }).click()
    await expect(page).toHaveURL(/\/how-it-works$/)
  })

  test("untranslated pages never get a language URL; their header and footer follow the chosen language", async ({ page, request, isMobile }) => {
    const res = await request.get("/fr/search", { maxRedirects: 0 })
    expect(res.status()).toBe(307)
    expect(res.headers().location).toMatch(/\/search$/)

    await page.goto("/fr") // chooses French (cookie)
    await page.goto("/search")
    await expect(page).toHaveURL(/\/search/)
    await expect(page.locator("html")).toHaveAttribute("lang", "fr")
    if (isMobile) await page.getByRole("button", { name: "Afficher ou masquer le menu" }).click()
    await expect(page.getByRole("link", { name: "Trouver un garage" }).first()).toBeVisible()
    // ...but an English URL for a translated page stays English whatever the cookie says.
    await page.goto("/how-it-works")
    await expect(page.locator("html")).toHaveAttribute("lang", "en-GB")
  })

  test("the locale endpoint only redirects within the site", async ({ request }) => {
    const bad = await request.get("/api/locale?l=fr&next=//evil.example", { maxRedirects: 0 })
    expect(bad.headers().location ?? "").not.toContain("evil.example")
    const ok = await request.get("/api/locale?l=de&next=/how-it-works", { maxRedirects: 0 })
    expect(ok.headers().location).toMatch(/\/de\/how-it-works$/)
  })

  test("the sitemap lists each language version with alternates", async ({ request }) => {
    const xml = await (await request.get("/sitemap.xml")).text()
    expect(xml).toContain("/fr/how-it-works</loc>")
    expect(xml).toContain("/de</loc>")
    expect(xml).toContain('hreflang="fr"')
  })
})

test.describe("editing content as an admin", () => {
  test("a published notice appears on public pages in that language only, and reset removes it", async ({ page, request }) => {
    await login(page, "admin")
    try {
      await page.goto("/admin/content")
      await page.getByRole("button", { name: "Français" }).click()
      await page.getByLabel("Search").fill("site.notice")
      const field = page.getByLabel("site.notice", { exact: true })
      await expect(field).toBeVisible()
      await field.fill("Maintenance prévue samedi soir")
      await page.getByRole("button", { name: "Publish" }).first().click()
      await expect(page.getByText("Edited, live")).toBeVisible()

      const fr = await page.context().newPage()
      await fr.goto("/fr")
      await expect(fr.getByRole("status").filter({ hasText: "Maintenance prévue samedi soir" })).toBeVisible()
      await fr.goto("/")
      await expect(fr.getByText("Maintenance prévue samedi soir")).toHaveCount(0) // English page unaffected
      await fr.close()
    } finally {
      await reset(page.request, "site.notice", "fr")
    }
    await page.goto("/fr")
    await expect(page.getByText("Maintenance prévue samedi soir")).toHaveCount(0)
    void request
  })

  test("a legal page is a 404 until published, then appears in the footer and renders safely", async ({ page }) => {
    await login(page, "admin")
    const publish = (text: string) => page.request.put("/api/admin/content", { data: { key: "legal.privacy.body", locale: "en", action: "publish", text } })
    try {
      expect((await page.request.get("/privacy")).status()).toBe(404)
      expect((await publish("## What we collect\n\nYour name and <script>alert(1)</script> email.\n\n- Item one\n- [A link](javascript:alert(1))")).ok()).toBe(true)

      await page.goto("/privacy")
      await expect(page.getByRole("heading", { level: 1, name: "Privacy Policy" })).toBeVisible()
      await expect(page.getByRole("heading", { level: 2, name: "What we collect" })).toBeVisible()
      // Nothing the author types becomes markup or an executable link.
      expect(await page.locator("main script").count()).toBe(0)
      expect(await page.locator('main a[href^="javascript:"]').count()).toBe(0)
      await expect(page.locator("main")).toContainText("<script>alert(1)</script>")
      await expect(page.locator("footer").getByRole("link", { name: "Privacy Policy" })).toBeVisible()

      // French has no text of its own yet: it shows the English page with a note, and stays out of the index.
      await page.goto("/fr/privacy")
      await expect(page.getByText("n'est pas encore disponible dans votre langue")).toBeVisible()
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/)
    } finally {
      await reset(page.request, "legal.privacy.body", "en")
    }
    expect((await page.request.get("/privacy")).status()).toBe(404)
  })

  test("non-admins cannot read or change content", async ({ request }) => {
    expect((await request.get("/api/admin/content")).status()).toBe(401)
    expect((await request.put("/api/admin/content", { data: { key: "hero.title1", locale: "en", action: "publish", text: "x" } })).status()).toBe(401)
  })
})
