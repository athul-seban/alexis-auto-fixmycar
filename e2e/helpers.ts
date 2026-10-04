import { expect, type Locator, type Page } from "@playwright/test"

export const ACCOUNTS = {
  admin: { email: "admin@quotemygarage.dev", password: "admin123", home: "/admin" },
  garage: { email: "premier@quotemygarage.dev", password: "garage123", home: "/garage-dashboard" },
  owner: { email: "amelia.jones@example.com", password: "owner123", home: "/dashboard" },
} as const

/**
 * Sign in through NextAuth's credentials endpoint (what the form posts to) and open the role's home.
 * Doing it over the API keeps tests fast and independent of how quickly the dev server hydrates the form;
 * `loginViaForm` covers the form itself.
 */
export async function login(page: Page, role: keyof typeof ACCOUNTS) {
  const a = ACCOUNTS[role]
  const { csrfToken } = await (await page.request.get("/api/auth/csrf")).json()
  const res = await page.request.post("/api/auth/callback/credentials", {
    form: { csrfToken, email: a.email, password: a.password, json: "true" },
  })
  expect(res.ok()).toBe(true)
  await page.goto(a.home)
  await expect(page.locator("#portal-main")).toBeVisible()
}

/** Sign in by typing into the real login form, retrying until the page is hydrated enough to handle the submit. */
export async function loginViaForm(page: Page, role: keyof typeof ACCOUNTS) {
  const a = ACCOUNTS[role]
  await expect(async () => {
    await page.goto("/login")
    await page.getByLabel(/email/i).first().fill(a.email)
    await page.getByLabel(/password/i).first().fill(a.password)
    await page.getByRole("button", { name: /sign in|log in/i }).first().click()
    await page.waitForURL(`**${a.home}**`, { timeout: 8_000 })
  }).toPass({ timeout: 45_000 })
  await expect(page.locator("#portal-main")).toBeVisible()
}

/** True when the page scrolls sideways (a mobile-layout bug). */
export async function hasHorizontalScroll(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1)
}

/**
 * Drag one element onto another the way a hand does: press, move a little to start the browser's drag, then travel
 * to the target in steps. Playwright's one-shot dragTo() jumps straight there and Chromium never starts an HTML5 drag.
 */
export async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded()
  await target.scrollIntoViewIfNeeded()
  const from = (await source.boundingBox())!
  const to = (await target.boundingBox())!
  await page.mouse.move(from.x + 10, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + 30, from.y + from.height / 2 + 14, { steps: 5 })
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 15 })
  await page.mouse.up()
}
