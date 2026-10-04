import { execSync } from "child_process"

// Route/service tests hit a real database. Point them at an isolated, freshly-pushed SQLite file
// (prisma/test.db, gitignored via prisma/*.db) so they never touch dev.db (which holds seed/demo
// data) and always run against the current schema. Runs once, before any test worker starts, so
// workers inherit the DATABASE_URL.
export default function setup() {
  process.env.DATABASE_URL = "file:./test.db"
  execSync("npx prisma db push --skip-generate --force-reset --accept-data-loss", {
    stdio: "pipe",
    env: process.env,
  })
}
