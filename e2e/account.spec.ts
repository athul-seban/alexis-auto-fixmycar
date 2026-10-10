import { expect, test } from "@playwright/test"
import { ACCOUNTS, hasHorizontalScroll, login } from "./helpers"

test.describe("user menu and account page", () => {
  for (const role of ["admin", "garage", "owner"] as const) {
    test(`${role} opens their account from the user menu`, async ({ page }) => {
      await login(page, role)
      await page.getByRole("button", { name: "Account menu" }).click()
      await expect(page.getByText(ACCOUNTS[role].email)).toBeVisible()
      await page.getByRole("menuitem", { name: /my account/i }).click()
      await expect(page.getByRole("heading", { name: "Profile", exact: true })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Password", exact: true })).toBeVisible()
      await expect(page.getByRole("heading", { name: "Notifications", exact: true })).toBeVisible()
      await expect(page.getByRole("button", { name: /sign out everywhere/i })).toBeVisible()
      expect(await hasHorizontalScroll(page)).toBe(false)
    })
  }

  test("the password form needs matching new passwords", async ({ page }) => {
    await login(page, "owner")
    await page.goto("/dashboard/settings")
    await page.getByLabel("Current password").fill("owner123")
    await page.getByLabel("New password (8+ characters)").fill("newpassword1")
    await page.getByLabel("Confirm new password").fill("different1")
    await expect(page.getByText("Passwords don't match.")).toBeVisible()
    await expect(page.getByRole("button", { name: "Change password" })).toBeDisabled()
  })
})

test.describe("overview pages", () => {
  test("customer overview shows reminders and recent quotes", async ({ page }) => {
    await login(page, "owner")
    await expect(page.getByRole("heading", { name: "Vehicle reminders" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Recent quotes" })).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("garage overview shows today's bookings and the profile checklist", async ({ page }) => {
    await login(page, "garage")
    await expect(page.getByRole("heading", { name: "Today's bookings" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Profile checklist" })).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })

  test("admin overview shows the attention queue and charts", async ({ page }) => {
    await login(page, "admin")
    await expect(page.getByRole("heading", { name: /Completed revenue, last 30 days/ })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Top cities" })).toBeVisible()
    await expect(page.getByRole("region", { name: "Needs attention" })).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
  })
})
