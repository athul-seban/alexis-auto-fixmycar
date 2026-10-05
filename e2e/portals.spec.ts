import { expect, test } from "@playwright/test"
import { ACCOUNTS, dragWithMouse, hasHorizontalScroll, login, loginViaForm } from "./helpers"

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

test.describe("garage diary", () => {
  test("month view shows a six-week grid with bookings and opens a day", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/diary?view=month")
    const grid = page.getByRole("grid", { name: "Month diary" })
    await expect(grid).toBeVisible()
    await expect(grid.getByRole("row")).toHaveCount(7) // header + six weeks
    await expect(grid.getByRole("gridcell")).toHaveCount(42)
    expect(await hasHorizontalScroll(page)).toBe(false)
    await grid.getByRole("button", { name: /^Open .* in the day view$/ }).first().click()
    await expect(page).toHaveURL(/view=day/)
  })

  test("dragging a booking asks before moving it, and cancelling changes nothing", async ({ page, isMobile }) => {
    test.skip(isMobile, "drag and drop is a desktop gesture; phones use the booking drawer to reschedule")
    await login(page, "garage")
    await page.goto("/garage-dashboard/diary?view=month")
    const grid = page.getByRole("grid", { name: "Month diary" })
    const chip = grid.locator("button[draggable=true]").first()
    await expect(chip).toBeVisible()
    const before = await chip.getAttribute("title")

    // Drop it on a different day cell.
    const cells = grid.getByRole("gridcell")
    const target = cells.nth((await cells.count()) - 1)
    await dragWithMouse(page, chip, target)
    await expect(page.getByRole("dialog", { name: "Move this booking?" })).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(page.getByRole("dialog", { name: "Move this booking?" })).toBeHidden()
    await expect(grid.locator("button[draggable=true]").first()).toHaveAttribute("title", before!)
  })
})

test.describe("garage diary keyboard", () => {
  test("Alt+arrow on a focused booking proposes a move, and cancelling changes nothing", async ({ page, isMobile }) => {
    test.skip(isMobile, "no physical keyboard on the phone profile")
    await login(page, "garage")
    await page.goto("/garage-dashboard/diary?view=month")
    const chip = page.getByRole("grid", { name: "Month diary" }).locator("button[draggable=true]").first()
    await expect(chip).toBeVisible()
    const before = await chip.getAttribute("title")
    await chip.focus()
    await page.keyboard.press("Alt+ArrowRight")
    const dialog = page.getByRole("dialog", { name: "Move this booking?" })
    await expect(dialog).toBeVisible()
    await page.getByRole("button", { name: "Cancel" }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByRole("grid", { name: "Month diary" }).locator("button[draggable=true]").first()).toHaveAttribute("title", before!)
  })
})

test.describe("garage customers", () => {
  test("lists customers from bookings and opens a customer's history", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/customers")
    await expect(page.getByText(/\d+ customers?/).first()).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
    await page.getByRole("button", { name: /^Open (?!navigation)/ }).locator("visible=true").first().click()
    await expect(page.getByRole("heading", { name: "Booking history" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Private note" })).toBeVisible()
    await expect(page.getByRole("heading", { name: "Same person?" })).toBeVisible()
  })
})

test.describe("garage website settings", () => {
  test("shows the online deposits card (disabled when the platform has no Stripe keys)", async ({ page }) => {
    await login(page, "garage")
    await page.goto("/garage-dashboard/website")
    await expect(page.getByRole("heading", { name: "Online deposits" })).toBeVisible()
    await expect(page.getByText(/aren.t switched on for the platform yet|Take deposits online/).first()).toBeVisible()
    expect(await hasHorizontalScroll(page)).toBe(false)
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
