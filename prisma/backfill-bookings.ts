// Usage: npm run db:backfill [-- --dry-run]
// Upgrades bookings created before the garage portal (source, snapshots, reference, searchText).
// Idempotent — rows that already have a reference are skipped.
import { backfillBookings } from "../src/lib/portal/backfill"
import { prisma } from "../src/lib/prisma"

async function main() {
  const dryRun = process.argv.includes("--dry-run")
  const result = await backfillBookings({ dryRun })
  console.log(
    dryRun
      ? `[dry-run] ${result.scanned} booking(s) would be updated`
      : `Backfilled ${result.updated} of ${result.scanned} booking(s)`
  )
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
