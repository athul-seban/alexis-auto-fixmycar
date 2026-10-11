import AxeBuilder from "@axe-core/playwright"
import { expect, test, type Page } from "@playwright/test"
import { login } from "./helpers"

// Automated WCAG 2.1 A/AA checks on the pages people use most. axe finds roughly a third of accessibility
// problems (contrast, names, roles, landmarks); it doesn't replace keyboard and screen-reader testing.
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]

async function expectNoViolations(page: Page, label: string) {
  const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze()
  const summary = violations.flatMap((v) =>
    v.nodes.slice(0, 3).map((n) => {
      const d = (n.any[0]?.data ?? {}) as { fgColor?: string; bgColor?: string; contrastRatio?: number }
      const colours = v.id === "color-contrast" ? ` [${d.fgColor} on ${d.bgColor} = ${d.contrastRatio}]` : ""
      return `${v.id} (${v.impact}): ${n.target.join(" ")}${colours} — ${n.html.slice(0, 90)}`
    })
  )
  expect(summary, `${label} has accessibility violations`).toEqual([])
}

test.describe("accessibility", () => {
  for (const path of ["/", "/search", "/login", "/how-it-works", "/garages", "/garages/london", "/garages/london/mot", "/fr", "/de", "/fr/how-it-works", "/de/for-garages"]) {
    test(`public ${path}`, async ({ page }) => {
      await page.goto(path)
      await expect(page.locator("main, [role=main]").first()).toBeVisible()
      await expectNoViolations(page, path)
    })
  }

  test("garage bookings list", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/bookings")
    await expect(page.getByText(/bookings found/i)).toBeVisible()
    await expectNoViolations(page, "garage bookings")
  })

  test("garage diary (month view)", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/diary?view=month")
    await expect(page.getByRole("grid", { name: "Month diary" })).toBeVisible()
    await expectNoViolations(page, "garage diary month")
  })

  test("garage customers", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/customers")
    await expect(page.getByText(/\d+ customers?/).first()).toBeVisible()
    await expectNoViolations(page, "garage customers")
  })

  test("admin garages list", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/admin/garages")
    await expect(page.getByText(/\d\/\d complete/).locator("visible=true").first()).toBeVisible()
    await expectNoViolations(page, "admin garages")
  })

  test("customer bookings", async ({ page }) => {
    await login(page, "owner")
    await page.goto("/dashboard/bookings")
    await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible()
    await expectNoViolations(page, "customer bookings")
  })

  test("booking widget", async ({ page }) => {
    await page.goto("/widget/premier-auto-services")
    await expect(page.locator("body")).toBeVisible()
    await expectNoViolations(page, "widget")
  })

  for (const role of ["owner", "garage", "admin"] as const) {
    const home = { owner: "/dashboard", garage: "/garage-dashboard", admin: "/admin" }[role]
    const account = { owner: "/dashboard/settings", garage: "/garage-dashboard/account", admin: "/admin/account" }[role]

    test(`${role} overview`, async ({ page }) => {
      await login(page, role)
      await page.goto(home)
      await expect(page.locator("#portal-main h1").first()).toBeVisible()
      await expect(page.locator("#portal-main [aria-busy=true], #portal-main .animate-pulse")).toHaveCount(0, { timeout: 15_000 })
      await expectNoViolations(page, `${role} overview`)
    })

    test(`${role} account page`, async ({ page }) => {
      await login(page, role)
      await page.goto(account)
      await expect(page.getByRole("heading", { name: "Password" })).toBeVisible()
      await expectNoViolations(page, `${role} account`)
    })

    test(`${role} user menu open`, async ({ page }) => {
      await login(page, role)
      await page.getByRole("button", { name: "Account menu" }).click()
      await expect(page.getByRole("menuitem", { name: /my account/i })).toBeVisible()
      await expectNoViolations(page, `${role} user menu`)
    })
  }

  test("admin site content editor", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/admin/content")
    await expect(page.getByRole("heading", { name: "Site content", level: 1 })).toBeVisible()
    await expect(page.getByText("hero.title1").first()).toBeVisible()
    await expectNoViolations(page, "admin content")
  })
})
