import { defineConfig, devices } from "@playwright/test"

// Browser tests run against the app with the seeded demo data (`npm run db:seed`):
//   npm run test:e2e
// Locally that is the dev server (reused if already running). In CI it is the production build, which starts fast
// and has no first-request compile pauses. Tests only read and navigate (plus a login each), so they are safe to re-run.
const PORT = Number(process.env.E2E_PORT ?? 3000)

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  // The dev server compiles each page on first request, which can take 30s+ for a new route under parallel load.
  timeout: process.env.CI ? 30_000 : 90_000,
  expect: { timeout: process.env.CI ? 10_000 : 30_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: process.env.CI ? "npm run build && npm run start" : "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: process.env.CI ? 300_000 : 120_000,
  },
})
