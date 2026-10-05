import { execSync } from "child_process"
import { PrismaClient } from "@prisma/client"

// Route/service tests hit a real database. By default they use an isolated, freshly-pushed SQLite file
// (prisma/test.db, gitignored via prisma/*.db) so they never touch dev.db (seed/demo data) and always run
// against the current schema. Runs once, before any test worker starts, so workers inherit DATABASE_URL.
//
// CI also runs the suite against Postgres to catch SQLite/Postgres drift: set TEST_DATABASE_URL and
// PRISMA_SCHEMA=prisma/schema.prod.prisma (and generate the client from that schema first).
export default async function setup() {
  // socket_timeout is Prisma's SQLite busy timeout (seconds): how long a writer waits for the lock before giving up.
  const url = process.env.TEST_DATABASE_URL ?? "file:./test.db?socket_timeout=60"
  process.env.DATABASE_URL = url
  const schema = process.env.PRISMA_SCHEMA ? ` --schema=${process.env.PRISMA_SCHEMA}` : ""
  execSync(`npx prisma db push --skip-generate --force-reset --accept-data-loss${schema}`, {
    stdio: "pipe",
    env: process.env,
  })

  if (url.startsWith("file:")) {
    // Write-ahead logging lets readers and the one writer work at the same time. In SQLite's default journal mode a
    // writer blocks every reader, and two transactions that read then write can fail instantly instead of waiting;
    // with dozens of test files sharing this file on a small CI runner that showed up as "Operations timed out".
    // The setting is stored in the database file, so it applies to every worker.
    const prisma = new PrismaClient({ datasources: { db: { url } } })
    try {
      await prisma.$queryRawUnsafe("PRAGMA journal_mode=WAL")
    } finally {
      await prisma.$disconnect()
    }
  }
}
