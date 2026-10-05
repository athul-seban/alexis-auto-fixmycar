import { PrismaClient } from "@prisma/client"

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

// SQLite (local dev and CI) lets one connection write at a time, so simultaneous interactive transactions queue behind
// each other. On a small CI runner that queue can outlast Prisma's 5s defaults even though nothing is wrong, so give
// them room there. Postgres (production) keeps the defaults: it has row-level locks and a long wait would only hold
// a serverless connection open.
const onSqlite = (process.env.DATABASE_URL ?? "").startsWith("file:")

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
    ...(onSqlite ? { transactionOptions: { maxWait: 30_000, timeout: 60_000 } } : {}),
  })

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma
