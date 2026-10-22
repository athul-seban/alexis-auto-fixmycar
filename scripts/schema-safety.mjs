// Fails when the production schema changes in a way that can lose data. The production database is real and is changed with
// `prisma db push` (there are no migration files), so every schema change must be additive: new tables, new columns, new
// indexes. Usage:  node scripts/schema-safety.mjs [baseRef]     (default origin/main)
//
// It asks Prisma for the SQL that would turn the base version of prisma/schema.prod.prisma into the working one, and refuses
// DROP TABLE / DROP COLUMN / TRUNCATE / DELETE and column type changes. A deliberate destructive change needs an explicit
// ALLOW_DESTRUCTIVE_SCHEMA=1 and a plan for the data (backup, copy, then drop in a later release).
import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const base = process.argv[2] ?? "origin/main"
const file = "prisma/schema.prod.prisma"

let previous
try {
  previous = execFileSync("git", ["show", `${base}:${file}`], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
} catch {
  console.log(`schema-safety: no ${file} at ${base}, nothing to compare.`)
  process.exit(0)
}

const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "qmg-schema-")), "base.prisma")
fs.writeFileSync(tmp, previous)

let sql
try {
  sql = execFileSync("npx", ["prisma", "migrate", "diff", "--from-schema-datamodel", tmp, "--to-schema-datamodel", file, "--script"], {
    encoding: "utf8",
    shell: process.platform === "win32",
    env: { ...process.env, DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://user:pass@localhost:5432/placeholder" },
  })
} catch (err) {
  console.error("schema-safety: prisma migrate diff failed:\n" + (err.stderr || err.message))
  process.exit(2)
}

const statements = sql
  .split(/;\s*\n/)
  .map((s) => s.trim())
  .filter((s) => s && !/^(--[^\n]*\n?)+$/.test(s))
const DANGEROUS = [
  [/\bDROP\s+TABLE\b/i, "drops a table"],
  [/\bDROP\s+COLUMN\b/i, "drops a column"],
  [/\bDROP\s+TYPE\b/i, "drops a type"],
  [/\bTRUNCATE\b/i, "truncates a table"],
  [/\bDELETE\s+FROM\b/i, "deletes rows"],
  [/\bALTER\s+COLUMN\s+\S+\s+(?:SET\s+DATA\s+)?TYPE\b/i, "changes a column's type"],
]
const firstLine = (s) => s.split("\n").find((l) => !l.startsWith("--"))?.slice(0, 140) ?? s.slice(0, 140)
const problems = statements.flatMap((s) => DANGEROUS.filter(([re]) => re.test(s)).map(([, why]) => `${why}: ${firstLine(s)}`))

if (statements.length === 0) {
  console.log(`schema-safety: ${file} has no database changes against ${base}.`)
} else {
  console.log(`schema-safety: ${statements.length} statement(s) against ${base}:`)
  for (const s of statements) console.log("  " + firstLine(s))
}

if (problems.length > 0) {
  console.error("\nschema-safety: this change can lose data:\n  " + problems.join("\n  "))
  if (process.env.ALLOW_DESTRUCTIVE_SCHEMA === "1") {
    console.error("\nALLOW_DESTRUCTIVE_SCHEMA=1 is set, so this is allowed. Back up production first.")
  } else {
    console.error("\nMake it additive (add the new column or table, copy the data, drop the old one in a later release).")
    process.exit(1)
  }
}
