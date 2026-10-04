import { defineConfig, devices } from "@playwright/test"

// Browser tests run against the dev server and the seeded demo data (`npm run db:seed`):
//   npm run test:e2e
// They only read and navigate (plus one cancel-free login each), so they are safe to re-run.
const PORT = Number(process.env.E2E_PORT ?? 3000)

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
  webServer: {
    command: "npm run dev",
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
