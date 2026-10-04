import type { Prisma, PrismaClient } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { generateReference } from "@/lib/portal/booking-ref"
import { buildSearchText } from "@/lib/portal/search-text"
import { normaliseVrm } from "@/lib/portal/vrm"

// One-off, idempotent upgrade of bookings created before the garage portal: derives `source`,
// customer/vehicle snapshots, normalised VRM, a reference and `searchText`. Rows that already
// have a `reference` are skipped, so it is safe to re-run. `Garage.totalBookings` is left alone.

export interface BackfillRow {
  quoteId: string | null
  jobResponseId: string | null
  source: string
  customerName: string | null
  customerEmail: string | null
  customerPhone: string | null
  vrm: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  owner: { name: string | null; email: string; phone: string | null } | null
  vehicle: { registration: string; make: string; model: string; year: number } | null
}

export function computeBackfillData(b: BackfillRow, reference: string): Prisma.BookingUpdateInput {
  let source = b.source
  if (source === "MARKETPLACE") {
    if (b.quoteId) source = "QUOTE"
    else if (b.jobResponseId) source = "JOB_REQUEST"
  }

  const customerName = b.customerName ?? b.owner?.name ?? null
  const customerEmail = b.customerEmail ?? b.owner?.email ?? null
  const customerPhone = b.customerPhone ?? b.owner?.phone ?? null
  const vrm = b.vrm ?? (normaliseVrm(b.vehicle?.registration) || null)
  const vehicleMake = b.vehicleMake ?? b.vehicle?.make ?? null
  const vehicleModel = b.vehicleModel ?? b.vehicle?.model ?? null
  const vehicleYear = b.vehicleYear ?? b.vehicle?.year ?? null

  return {
    source,
    reference,
    customerName,
    customerEmail,
    customerPhone,
    vrm,
    vehicleMake,
    vehicleModel,
    vehicleYear,
    searchText: buildSearchText({ customerName, customerEmail, customerPhone, vrm, vehicleMake, vehicleModel, reference }),
  }
}

export interface BackfillResult {
  scanned: number
  updated: number
}

export async function backfillBookings(
  opts: { dryRun?: boolean; batchSize?: number; garageId?: string; db?: PrismaClient } = {}
): Promise<BackfillResult> {
  const db = opts.db ?? prisma
  const batchSize = opts.batchSize ?? 200
  const result: BackfillResult = { scanned: 0, updated: 0 }
  let cursor: string | undefined

  for (;;) {
    // Keyset paging (id > last seen), not Prisma's `cursor`: updated rows stop matching
    // `reference: null`, and `cursor + skip: 1` would then skip a row that still needs work.
    const rows = await db.booking.findMany({
      where: {
        reference: null,
        ...(cursor ? { id: { gt: cursor } } : {}),
        ...(opts.garageId ? { garageId: opts.garageId } : {}),
      },
      orderBy: { id: "asc" },
      take: batchSize,
      include: {
        owner: { select: { name: true, email: true, phone: true } },
        vehicle: { select: { registration: true, make: true, model: true, year: true } },
      },
    })
    if (rows.length === 0) break

    for (const row of rows) {
      result.scanned += 1
      if (opts.dryRun) {
        result.updated += 1 // would update
        continue
      }
      let reference = generateReference()
      while (await db.booking.findUnique({ where: { reference }, select: { id: true } })) reference = generateReference()
      await db.booking.update({ where: { id: row.id }, data: computeBackfillData(row, reference) })
      result.updated += 1
    }
    cursor = rows[rows.length - 1].id
  }
  return result
}
