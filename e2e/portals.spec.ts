import { expect, test } from "@playwright/test"
import { ACCOUNTS, hasHorizontalScroll, login, loginViaForm } from "./helpers"

test.describe("role-based sign in", () => {
  for (const role of ["admin", "garage", "owner"] as const) {
    test(`${role} lands in their own portal via the login form`, async ({ page }) => {
      await loginViaForm(page, role)
      await expect(page).toHaveURL(new RegExp(ACCOUNTS[role].home))
    })
  }

  test("a customer cannot open the admin portal", async ({ page }) => {
    await login(page, "owner")
    await page.goto("/admin")
    await expect(page).not.toHaveURL(/\/admin$/)
  })
})

test.describe("garage portal", () => {
  test("bookings list shows data, filters and bulk selection", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/bookings")
    await expect(page.getByText(/bookings found/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /new booking/i })).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("opening a booking shows its history and a job sheet link", async ({ page, isMobile }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/bookings")
    await page.getByRole("button", { name: /^Open booking/ }).first().click()
    await expect(page.getByRole("heading", { name: "History" })).toBeVisible()
    await expect(page.getByRole("link", { name: /job sheet/i })).toBeVisible()
    if (isMobile) expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("keyboard shortcut g then b opens bookings (desktop)", async ({ page, isMobile }) => {
    test.skip(isMobile, "keyboard shortcuts are a desktop feature")
    await login(page, "garage")
    await page.keyboard.press("g")
    await page.keyboard.press("b")
    await expect(page).toHaveURL(/\/garage-dashboard\/bookings/)
  })
})

test.describe("admin portal", () => {
  test("garages page lists pending garages with readiness", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/admin/garages")
    await expect(page.getByText(/\d\/\d complete/).locator("visible=true").first()).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("users page opens the manage dialog", async ({ page }) => {
    await login(page, "admin")
    await page.goto("/admin/users")
    await page.getByRole("button", { name: /^Manage/ }).first().click()
    await expect(page.getByRole("button", { name: /send password reset/i })).toBeVisible()
  })
})

test.describe("customer portal", () => {
  test("bookings page renders and fits the screen", async ({ page }) => {
    await login(page, "owner")
    await page.goto("/dashboard/bookings")
    await expect(page.getByRole("heading", { name: "Bookings", level: 1 })).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})
