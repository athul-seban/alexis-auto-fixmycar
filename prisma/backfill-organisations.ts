// Usage: npm run db:backfill-orgs [-- --dry-run | --verify] [--sync-billing]
// Makes every garage the first location of its own business (Organisation + roles + Owner membership). Idempotent.
// See src/lib/org/backfill.ts for what each mode does and the rollout order in VERCEL-DEPLOYMENT.md.
//
// Against PRODUCTION (Postgres) generate the client for the Postgres schema first, because src/lib/prisma uses whichever
// client was generated last:   npx prisma generate --schema=prisma/schema.prod.prisma
import { backfillOrganisations, verifyOrganisations } from "../src/lib/org/backfill"
import { prisma } from "../src/lib/prisma"

async function main() {
  const args = new Set(process.argv.slice(2))

  if (args.has("--verify")) {
    const r = await verifyOrganisations()
    console.log(`${r.counts.garages} garage(s), ${r.counts.organisations} business(es), ${r.counts.memberships} membership(s)`)
    if (r.ok) console.log("OK: every invariant holds")
    else {
      console.error(`${r.problems.length} problem(s):`)
      for (const p of r.problems) console.error(` - ${p}`)
      process.exitCode = 1
    }
    return
  }

  const dryRun = args.has("--dry-run")
  const r = await backfillOrganisations({ dryRun, syncBilling: args.has("--sync-billing") })
  console.log(
    dryRun
      ? `[dry-run] ${r.scanned} garage(s) would get a business; ${r.messagesFlagged} message(s) would be flagged`
      : `Created ${r.created} business(es) for ${r.scanned} garage(s); flagged ${r.messagesFlagged} message(s); linked ${r.creditRowsLinked} credit row(s); synced billing for ${r.billingSynced} business(es)`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
