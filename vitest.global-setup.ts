import { execSync } from "child_process"

// Route/service tests hit a real database. By default they use an isolated, freshly-pushed SQLite file
// (prisma/test.db, gitignored via prisma/*.db) so they never touch dev.db (seed/demo data) and always run
// against the current schema. Runs once, before any test worker starts, so workers inherit DATABASE_URL.
//
// CI also runs the suite against Postgres to catch SQLite/Postgres drift: set TEST_DATABASE_URL and
// PRISMA_SCHEMA=prisma/schema.prod.prisma (and generate the client from that schema first).
export default function setup() {
  // SQLite allows one writer at a time. Dozens of test files share this file, so a writer must be willing to wait for
  // the lock (socket_timeout is Prisma's SQLite busy timeout, in seconds) rather than fail after the 5s default.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "file:./test.db?socket_timeout=60"
  const schema = process.env.PRISMA_SCHEMA ? ` --schema=${process.env.PRISMA_SCHEMA}` : ""
  execSync(`npx prisma db push --skip-generate --force-reset --accept-data-loss${schema}`, {
    stdio: "pipe",
    env: process.env,
  })
}
