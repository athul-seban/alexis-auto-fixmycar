import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { backfillBookings, computeBackfillData, type BackfillRow } from "@/lib/portal/backfill"
import { isValidReference } from "@/lib/portal/booking-ref"
import { cleanupPrefix, makeGarage, makeOwner } from "@/test/fixtures"

const PREFIX = "backfilltest-"

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

const row = (o: Partial<BackfillRow> = {}): BackfillRow => ({
  quoteId: null,
  jobResponseId: null,
  source: "MARKETPLACE",
  customerName: null,
  customerEmail: null,
  customerPhone: null,
  vrm: null,
  vehicleMake: null,
  vehicleModel: null,
  vehicleYear: null,
  owner: { name: "Ann Owner", email: "ann@example.com", phone: "+44 7700 900123" },
  vehicle: { registration: "ab12 cde", make: "Ford", model: "Focus", year: 2019 },
  ...o,
})

describe("computeBackfillData", () => {
  it("derives source from the booking's links", () => {
    expect(computeBackfillData(row(), "QMG-AAAAAA").source).toBe("MARKETPLACE")
    expect(computeBackfillData(row({ quoteId: "q" }), "QMG-AAAAAA").source).toBe("QUOTE")
    expect(computeBackfillData(row({ jobResponseId: "j" }), "QMG-AAAAAA").source).toBe("JOB_REQUEST")
  })

  it("does not overwrite an already-set source", () => {
    expect(computeBackfillData(row({ source: "WIDGET", quoteId: "q" }), "QMG-AAAAAA").source).toBe("WIDGET")
  })

  it("copies owner/vehicle snapshots, normalises the VRM and builds search text", () => {
    const d = computeBackfillData(row(), "QMG-AAAAAA")
    expect(d).toMatchObject({
      reference: "QMG-AAAAAA",
      customerName: "Ann Owner",
      customerEmail: "ann@example.com",
      vrm: "AB12CDE",
      vehicleMake: "Ford",
      vehicleYear: 2019,
    })
    expect(d.searchText).toBe("ann owner ann@example.com 07700900123 ab12cde ford focus qmg-aaaaaa")
  })

  it("keeps existing snapshot values over derived ones", () => {
    const d = computeBackfillData(row({ customerName: "Typed Name", vrm: "XX99XXX" }), "QMG-AAAAAA")
    expect(d.customerName).toBe("Typed Name")
    expect(d.vrm).toBe("XX99XXX")
  })

  it("copes with a booking that has neither owner nor vehicle", () => {
    const d = computeBackfillData(row({ owner: null, vehicle: null, customerName: "Walk In" }), "QMG-AAAAAA")
    expect(d.customerName).toBe("Walk In")
    expect(d.vrm).toBeNull()
  })
})

describe("backfillBookings", () => {
  const legacyBooking = async (garageId: string, ownerId: string, vehicleId: string, extra: object = {}) =>
    prisma.booking.create({
      data: { garageId, ownerId, vehicleId, serviceType: "MOT", scheduledAt: new Date(), totalPrice: 50, ...extra },
    })

  it("upgrades legacy rows, then is a no-op on re-run", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const a = await legacyBooking(garage.id, user.id, vehicle.id)
    const b = await legacyBooking(garage.id, user.id, vehicle.id)
    expect(a.reference).toBeNull()

    const first = await backfillBookings({ garageId: garage.id })
    expect(first).toEqual({ scanned: 2, updated: 2 })

    const rows = await prisma.booking.findMany({ where: { id: { in: [a.id, b.id] } } })
    for (const r of rows) {
      expect(isValidReference(r.reference!)).toBe(true)
      expect(r.vrm).toBe("AB12CDE")
      expect(r.customerEmail).toBe(user.email)
      expect(r.searchText).toContain("ab12cde")
    }
    expect(new Set(rows.map((r) => r.reference)).size).toBe(2)

    expect(await backfillBookings({ garageId: garage.id })).toEqual({ scanned: 0, updated: 0 })
  })

  it("derives QUOTE source for quote-linked bookings and leaves totalBookings alone", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const quote = await prisma.quote.create({
      data: { ownerId: user.id, vehicleId: vehicle.id, garageId: garage.id, serviceType: "MOT", description: "Needs an MOT test", status: "ACCEPTED", price: 50 },
    })
    const b = await legacyBooking(garage.id, user.id, vehicle.id, { quoteId: quote.id })
    await prisma.garage.update({ where: { id: garage.id }, data: { totalBookings: 42 } })

    await backfillBookings({ garageId: garage.id })

    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).source).toBe("QUOTE")
    expect((await prisma.garage.findUniqueOrThrow({ where: { id: garage.id } })).totalBookings).toBe(42)
  })

  it("dry-run reports the work without writing", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    const b = await legacyBooking(garage.id, user.id, vehicle.id)

    expect(await backfillBookings({ garageId: garage.id, dryRun: true })).toEqual({ scanned: 1, updated: 1 })
    expect((await prisma.booking.findUniqueOrThrow({ where: { id: b.id } })).reference).toBeNull()
  })

  it("pages through more rows than the batch size", async () => {
    const { garage } = await makeGarage(PREFIX)
    const { user, vehicle } = await makeOwner(PREFIX)
    for (let i = 0; i < 5; i++) await legacyBooking(garage.id, user.id, vehicle.id)
    expect(await backfillBookings({ garageId: garage.id, batchSize: 2 })).toEqual({ scanned: 5, updated: 5 })
    expect(await prisma.booking.count({ where: { garageId: garage.id, reference: null } })).toBe(0)
  })
})
