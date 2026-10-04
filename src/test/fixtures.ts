import { prisma } from "@/lib/prisma"
import { generateReference } from "@/lib/portal/booking-ref"
import type { Garage, User } from "@prisma/client"

// Shared fixtures for route/service tests. Every row is tagged with a per-file PREFIX
// (user email / garage name / job token) so cleanup is exact and files don't collide.

let seq = 0
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`

/**
 * A city + postcode unique to a test file. Job matching is by city OR postcode prefix, so files
 * running in parallel against one DB must not share an area or they'd see each other's jobs.
 */
export function areaFor(prefix: string): { city: string; postcode: string } {
  let h = 0
  for (const ch of prefix) h = (h * 31 + ch.charCodeAt(0)) % 46656 // 36^3
  const pc3 = h.toString(36).toUpperCase().padStart(3, "0").replace(/^0/, "Z").slice(0, 3)
  return { city: `${prefix}city`, postcode: `${pc3} 1AA` }
}

export interface GarageFixture {
  user: User
  garage: Garage
}

export async function makeGarage(
  prefix: string,
  opts: {
    key?: string
    status?: string
    userSuspended?: boolean
    openingHours?: object | null
    portalSettings?: string | null
    services?: string[]
    city?: string
  } = {}
): Promise<GarageFixture> {
  const key = opts.key ?? "garage"
  const id = uniq()
  const user = await prisma.user.create({
    data: {
      email: `${prefix}${key}-${id}@example.com`,
      role: "GARAGE",
      name: `${key} user`,
      suspendedAt: opts.userSuspended ? new Date() : null,
    },
  })
  const garage = await prisma.garage.create({
    data: {
      userId: user.id,
      name: `${prefix}${key}-${id}`,
      slug: `${prefix}${key}-${id}`,
      phone: "0123456789",
      email: `${prefix}${key}-${id}@garage.example.com`,
      address: "1 Test St",
      city: opts.city ?? areaFor(prefix).city,
      postcode: areaFor(prefix).postcode,
      status: opts.status ?? "APPROVED",
      services: JSON.stringify(opts.services ?? ["MOT", "FULL_SERVICE"]),
      openingHours: opts.openingHours === undefined ? null : opts.openingHours === null ? null : JSON.stringify(opts.openingHours),
      portalSettings: opts.portalSettings ?? null,
    },
  })
  return { user, garage }
}

export async function makeOwner(prefix: string, key = "owner") {
  const id = uniq()
  const user = await prisma.user.create({
    data: { email: `${prefix}${key}-${id}@example.com`, role: "OWNER", name: `${key} user`, phone: "07700900123" },
  })
  const vehicle = await prisma.vehicle.create({
    data: { ownerId: user.id, registration: "AB12CDE", make: "Ford", model: "Focus", year: 2019 },
  })
  return { user, vehicle }
}

/** A walk-in booking: no owner/vehicle, customer + vehicle snapshots only. */
export async function makeWalkInBooking(
  garageId: string,
  overrides: Partial<Parameters<typeof prisma.booking.create>[0]["data"]> = {}
) {
  return prisma.booking.create({
    data: {
      garageId,
      serviceType: "MOT",
      status: "CONFIRMED",
      scheduledAt: new Date(Date.now() + 2 * 24 * 3600 * 1000),
      totalPrice: 55,
      source: "DIRECT",
      reference: generateReference(),
      customerName: "Walk In",
      customerPhone: "07700900456",
      vrm: "WK19ABC",
      vehicleMake: "Kia",
      vehicleModel: "Ceed",
      vehicleYear: 2018,
      searchText: "walk in 07700900456 wk19abc kia ceed",
      ...overrides,
    } as any,
  })
}

/** Removes everything tagged with `prefix`, children before parents. */
export async function cleanupPrefix(prefix: string) {
  const garages = await prisma.garage.findMany({ where: { name: { startsWith: prefix } }, select: { id: true } })
  const gIds = garages.map((g) => g.id)
  const users = await prisma.user.findMany({ where: { email: { startsWith: prefix } }, select: { id: true } })
  const uIds = users.map((u) => u.id)

  await prisma.message.deleteMany({ where: { OR: [{ garageId: { in: gIds } }, { senderId: { in: uIds } }] } })
  await prisma.review.deleteMany({ where: { OR: [{ garageId: { in: gIds } }, { ownerId: { in: uIds } }] } })
  await prisma.booking.deleteMany({ where: { OR: [{ garageId: { in: gIds } }, { ownerId: { in: uIds } }] } })
  await prisma.quote.deleteMany({ where: { OR: [{ garageId: { in: gIds } }, { ownerId: { in: uIds } }] } })
  await prisma.jobResponse.deleteMany({ where: { garageId: { in: gIds } } })
  await prisma.jobRequest.deleteMany({ where: { token: { startsWith: prefix } } })
  await prisma.vehicle.deleteMany({ where: { ownerId: { in: uIds } } })
  await prisma.garage.deleteMany({ where: { id: { in: gIds } } })
  await prisma.user.deleteMany({ where: { id: { in: uIds } } })
}
