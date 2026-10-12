import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import path from "node:path"

// prisma/schema.prisma (SQLite, local + CI) and prisma/schema.prod.prisma (Postgres, production) are kept in sync by
// hand. They must differ only in the datasource provider, or production would be pushed a different data model than the
// one the tests ran against.
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "prisma", file), "utf8")
    .replace(/\r\n/g, "\n")
    .replace(/^\s*provider\s*=\s*"(sqlite|postgresql)"\s*$/m, '  provider = "<db>"')

describe("prisma schemas", () => {
  it("are identical apart from the datasource provider", () => {
    expect(read("schema.prod.prisma")).toBe(read("schema.prisma"))
  })
})
