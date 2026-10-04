// Demo data for the garage portal, for premier@quotemygarage.dev (Premier Auto Services).
// Run standalone:  npx tsx prisma/seed-garage-portal.ts      (also called from prisma/seed.ts)
//
// Every row it owns has an id starting "pd-", and it deletes + recreates them on each run, so
// the relative dates (today / next fortnight / last 6 months) are always fresh.
import { PrismaClient } from "@prisma/client"
import { generateReference } from "../src/lib/portal/booking-ref"
import { buildSearchText } from "../src/lib/portal/search-text"
import { normaliseVrm } from "../src/lib/portal/vrm"
import { addDays, londonWallToUtc, todayLondon } from "../src/lib/portal/tz"

const PREMIER_SLUG = "premier-auto-services"

const TECHNICIANS = [
  { id: "pd-tech-1", name: "Tess Walker", color: "#F97316", email: "tess@premierauto.com", phone: "07700 900311" },
  { id: "pd-tech-2", name: "Marcus Bell", color: "#1E3A5F", email: "marcus@premierauto.com", phone: "07700 900312" },
  { id: "pd-tech-3", name: "Priya Nair", color: "#10B981", email: "priya@premierauto.com", phone: "07700 900313" },
]

const CUSTOMERS = [
  { name: "Liam Ryan", phone: "07700 900101", email: "liam.ryan@example.com", vrm: "PE67 LPJ", make: "Volkswagen", model: "Arteon", year: 2017 },
  { name: "Bradley Jarvis", phone: "07700 900102", email: "bradley.j@example.com", vrm: "LJ67 XGS", make: "Kia", model: "Ceed", year: 2017 },
  { name: "Jamie Lansdell", phone: "07700 900103", email: "jamie.l@example.com", vrm: "FG73 NFZ", make: "Volkswagen", model: "Polo Life", year: 2023 },
  { name: "Naomi Wiggin", phone: "07700 900104", email: "naomi.w@example.com", vrm: "CF24 JKN", make: "Peugeot", model: "208 GT Puretech", year: 2024 },
  { name: "Lee Broughton", phone: "07700 900105", email: "lee.b@example.com", vrm: "KR13 YLB", make: "Audi", model: "A3", year: 2013 },
  { name: "Asham Thapa Magar", phone: "07700 900106", email: "asham.tm@example.com", vrm: "EF63 OTV", make: "BMW", model: "114", year: 2013 },
  { name: "Hannah Okafor", phone: "07700 900107", email: "hannah.o@example.com", vrm: "YA19 HDK", make: "Ford", model: "Fiesta", year: 2019 },
  { name: "Callum Reid", phone: "07700 900108", email: "callum.r@example.com", vrm: "MT68 PQR", make: "Mini", model: "Cooper", year: 2018 },
  { name: "Fatima Hussain", phone: "07700 900109", email: "fatima.h@example.com", vrm: "BD21 WXZ", make: "Toyota", model: "Yaris", year: 2021 },
  { name: "Oscar Lindqvist", phone: "07700 900110", email: "oscar.l@example.com", vrm: "SK70 ABC", make: "Volvo", model: "XC40", year: 2020 },
  { name: "Grace Mensah", phone: "07700 900111", email: "grace.m@example.com", vrm: "LC16 DEF", make: "Nissan", model: "Qashqai", year: 2016 },
  { name: "Tom Hargreaves", phone: "07700 900112", email: "tom.h@example.com", vrm: "GH65 JKL", make: "Vauxhall", model: "Astra", year: 2015 },
]

type Src = "MARKETPLACE" | "QUOTE" | "JOB_REQUEST" | "WIDGET" | "DIRECT"
interface Spec {
  /** days from today (London); negative = past */
  day: number
  time: string
  cust: number
  service: string
  status: string
  source: Src
  price: number
  fiv?: number
  tech?: number // index into TECHNICIANS
  duration?: number
  /** createdAt override: days before today + London time */
  created?: { day: number; time: string }
  contacted?: boolean
  cancelReason?: string
  notes?: string
  timeConfirmed?: boolean
  owner?: boolean // link to a real owner account (vehicle snapshot from that owner's vehicle)
}

const SPECS: Spec[] = [
  // ── Today ──
  { day: 0, time: "09:00", cust: 1, service: "MOT", status: "CONFIRMED", source: "WIDGET", price: 54.85, tech: 0, duration: 60, created: { day: -3, time: "18:20" } },
  { day: 0, time: "11:30", cust: 6, service: "FULL_SERVICE", status: "PENDING", source: "DIRECT", price: 189, tech: 1, duration: 120, created: { day: 0, time: "00:30" }, notes: "Customer rang at midnight via answerphone — call back to confirm." },
  { day: 0, time: "14:00", cust: 2, service: "BRAKES", status: "CONFIRMED", source: "MARKETPLACE", price: 245, tech: 2, duration: 150, created: { day: 0, time: "08:15" }, contacted: true, owner: true },
  // ── Upcoming (next two weeks) ──
  { day: 1, time: "09:30", cust: 3, service: "MOT", status: "CONFIRMED", source: "WIDGET", price: 54.85, tech: 0, created: { day: -1, time: "20:05" } },
  { day: 1, time: "13:00", cust: 4, service: "TYRES", status: "PENDING", source: "WIDGET", price: 320, tech: 1, duration: 90, created: { day: -1, time: "21:40" } },
  { day: 2, time: "10:00", cust: 7, service: "DIAGNOSTICS", status: "CONFIRMED", source: "QUOTE", price: 65, tech: 2, owner: true, contacted: true },
  { day: 3, time: "08:30", cust: 8, service: "INTERIM_SERVICE", status: "CONFIRMED", source: "DIRECT", price: 129, tech: 0, duration: 90 },
  { day: 4, time: "12:00", cust: 9, service: "CLUTCH", status: "PENDING", source: "JOB_REQUEST", price: 540, duration: 240, timeConfirmed: false, owner: true },
  { day: 6, time: "09:00", cust: 10, service: "MOT", status: "CONFIRMED", source: "MARKETPLACE", price: 54.85, tech: 1 },
  { day: 8, time: "15:00", cust: 11, service: "AIR_CON", status: "CONFIRMED", source: "WIDGET", price: 75, tech: 2 },
  { day: 9, time: "10:30", cust: 0, service: "BRAKES", status: "PENDING", source: "WIDGET", price: 210, tech: 0, duration: 120 },
  { day: 12, time: "11:00", cust: 5, service: "FULL_SERVICE", status: "CONFIRMED", source: "DIRECT", price: 215, tech: 1, duration: 120 },
  // ── Awaiting outcome (slot has passed, no result recorded) ──
  { day: -1, time: "10:00", cust: 2, service: "MOT", status: "CONFIRMED", source: "WIDGET", price: 54.85, tech: 0 },
  { day: -2, time: "14:00", cust: 9, service: "REPAIR", status: "PENDING", source: "DIRECT", price: 160, tech: 1 },
  // ── Completed (last ~6 months, FIV sometimes differs from the quoted price) ──
  { day: -4, time: "09:00", cust: 4, service: "MOT", status: "COMPLETED", source: "MARKETPLACE", price: 54.85, fiv: 54.85, tech: 0, owner: true, contacted: true },
  { day: -6, time: "13:30", cust: 6, service: "FULL_SERVICE", status: "COMPLETED", source: "WIDGET", price: 189, fiv: 241.5, tech: 1, duration: 120, contacted: true, notes: "Needed a new air filter and wiper blades — added to the invoice." },
  { day: -9, time: "10:00", cust: 1, service: "BRAKES", status: "COMPLETED", source: "QUOTE", price: 245, fiv: 245, tech: 2, owner: true, contacted: true },
  { day: -13, time: "11:00", cust: 11, service: "TYRES", status: "COMPLETED", source: "WIDGET", price: 280, fiv: 276, tech: 0, contacted: true },
  { day: -19, time: "09:30", cust: 3, service: "MOT", status: "COMPLETED", source: "DIRECT", price: 54.85, fiv: 54.85, tech: 1 },
  { day: -27, time: "14:00", cust: 8, service: "INTERIM_SERVICE", status: "COMPLETED", source: "MARKETPLACE", price: 129, fiv: 129, tech: 0, contacted: true },
  { day: -15, time: "09:00", cust: 7, service: "TYRES", status: "COMPLETED", source: "MARKETPLACE", price: 320, fiv: 320, tech: 1, owner: true, contacted: true },
  { day: -23, time: "13:30", cust: 9, service: "MOT", status: "COMPLETED", source: "MARKETPLACE", price: 54.85, fiv: 54.85, tech: 0, owner: true },
  { day: -38, time: "10:30", cust: 5, service: "CAMBELT", status: "COMPLETED", source: "JOB_REQUEST", price: 420, fiv: 455, tech: 2, duration: 300, owner: true, contacted: true },
  { day: -52, time: "09:00", cust: 10, service: "MOT", status: "COMPLETED", source: "WIDGET", price: 54.85, fiv: 54.85, tech: 1 },
  { day: -71, time: "13:00", cust: 0, service: "DIAGNOSTICS", status: "COMPLETED", source: "MARKETPLACE", price: 65, fiv: 65, tech: 0, contacted: true },
  { day: -95, time: "11:30", cust: 7, service: "FULL_SERVICE", status: "COMPLETED", source: "WIDGET", price: 189, fiv: 189, tech: 1, duration: 120 },
  { day: -120, time: "10:00", cust: 2, service: "BATTERY", status: "COMPLETED", source: "DIRECT", price: 135, fiv: 135, tech: 2 },
  { day: -150, time: "09:30", cust: 9, service: "MOT", status: "COMPLETED", source: "MARKETPLACE", price: 54.85, fiv: 54.85, tech: 0 },
  { day: -178, time: "14:30", cust: 4, service: "EXHAUST", status: "COMPLETED", source: "WIDGET", price: 310, fiv: 335, tech: 1, duration: 120 },
  // ── Cancelled ──
  { day: 5, time: "10:00", cust: 6, service: "MOT", status: "CANCELLED", source: "WIDGET", price: 54.85, cancelReason: "Customer sold the car", contacted: true },
  { day: -8, time: "15:00", cust: 10, service: "TYRES", status: "CANCELLED", source: "MARKETPLACE", price: 320, cancelReason: "Found a cheaper quote elsewhere", owner: true },
  { day: -30, time: "09:00", cust: 3, service: "BRAKES", status: "CANCELLED", source: "DIRECT", price: 190, cancelReason: "Rescheduling — will rebook" },
  // ── No-shows ──
  { day: -5, time: "11:00", cust: 11, service: "MOT", status: "NO_SHOW", source: "WIDGET", price: 54.85, tech: 1 },
  { day: -22, time: "16:00", cust: 8, service: "INTERIM_SERVICE", status: "NO_SHOW", source: "MARKETPLACE", price: 129, tech: 0 },
]

async function main(prisma: PrismaClient) {
  const premier = await prisma.garage.findUnique({ where: { slug: PREMIER_SLUG } })
  if (!premier) {
    console.log(`⚠️  Skipping garage-portal demo data: no garage with slug "${PREMIER_SLUG}" (run the main seed first)`)
    return
  }

  // Clean slate for everything this module owns.
  await prisma.message.deleteMany({ where: { bookingId: { startsWith: "pd-" } } })
  await prisma.review.deleteMany({ where: { bookingId: { startsWith: "pd-" } } })
  await prisma.notification.deleteMany({ where: { link: { contains: "pd-bk-" } } })
  await prisma.booking.deleteMany({ where: { id: { startsWith: "pd-" } } })
  await prisma.technician.deleteMany({ where: { id: { startsWith: "pd-" } } })

  await prisma.technician.createMany({
    data: TECHNICIANS.map((t, i) => ({ ...t, garageId: premier.id, sortOrder: i })),
  })

  // Price list for the services Premier offers (MOT / FULL_SERVICE / BRAKES / TYRES / REPAIR).
  await prisma.servicePrice.deleteMany({ where: { garageId: premier.id } })
  await prisma.servicePrice.createMany({
    data: [
      { serviceType: "MOT", priceFrom: 40, priceTo: 54.85, durationMins: 60, notes: "Class 4 (cars up to 8 seats)" },
      { serviceType: "FULL_SERVICE", priceFrom: 189, priceTo: 249, durationMins: 180, notes: "Includes oil and filter change" },
      { serviceType: "BRAKES", priceFrom: 120, priceTo: 280, durationMins: 120, notes: "Per axle, parts included" },
      { serviceType: "TYRES", priceFrom: 55, priceTo: null, durationMins: 60, notes: "Per tyre, fitted and balanced" },
      { serviceType: "REPAIR", priceFrom: 65, priceTo: null, durationMins: 120, notes: "Labour per hour — parts extra" },
    ].map((p) => ({ ...p, garageId: premier.id, isActive: true })),
  })

  // A few real owner accounts (+ their vehicles) so some bookings are account-linked.
  const owners = await prisma.user.findMany({
    where: { role: "OWNER", vehicles: { some: {} } },
    include: { vehicles: { take: 1 } },
    take: 4,
    orderBy: { email: "asc" },
  })

  const today = todayLondon()
  const used = new Set<string>()
  let ownerCursor = 0

  for (let i = 0; i < SPECS.length; i++) {
    const s = SPECS[i]
    const c = CUSTOMERS[s.cust]
    const linked = s.owner ? owners[ownerCursor++ % owners.length] : undefined
    const vehicle = linked?.vehicles[0]

    const scheduledAt = londonWallToUtc(addDays(today, s.day), s.time)
    const createdAt = s.created
      ? londonWallToUtc(addDays(today, s.created.day), s.created.time)
      : new Date(scheduledAt.getTime() - 3 * 86400000)

    let reference = generateReference()
    while (used.has(reference)) reference = generateReference()
    used.add(reference)

    const customerName = linked?.name ?? c.name
    const customerEmail = linked?.email ?? c.email
    const customerPhone = linked?.phone ?? c.phone
    const vrm = normaliseVrm(vehicle?.registration ?? c.vrm)
    const make = vehicle?.make ?? c.make
    const model = vehicle?.model ?? c.model

    await prisma.booking.create({
      data: {
        id: `pd-bk-${String(i + 1).padStart(2, "0")}`,
        garageId: premier.id,
        ownerId: linked?.id ?? null,
        vehicleId: vehicle?.id ?? null,
        serviceType: s.service,
        status: s.status,
        scheduledAt,
        durationMins: s.duration ?? 60,
        completedAt: s.status === "COMPLETED" ? new Date(scheduledAt.getTime() + 2 * 3600000) : null,
        totalPrice: s.price,
        finalInvoiceValue: s.fiv ?? null,
        createdAt,
        reference,
        source: s.source,
        customerName,
        customerEmail,
        customerPhone,
        vrm,
        vehicleMake: make,
        vehicleModel: model,
        vehicleYear: vehicle?.year ?? c.year,
        technicianId: s.tech !== undefined ? TECHNICIANS[s.tech].id : null,
        contactedAt: s.contacted ? new Date(createdAt.getTime() + 3600000) : null,
        cancelReason: s.cancelReason ?? null,
        notes: s.notes ?? null,
        timeConfirmed: s.timeConfirmed ?? true,
        searchText: buildSearchText({ customerName, customerEmail, customerPhone, vrm, vehicleMake: make, vehicleModel: model, reference }),
      },
    })
  }

  // Reviews on the account-linked completed bookings (a review needs an owner), one already answered.
  const reviewable = await prisma.booking.findMany({
    where: { id: { startsWith: "pd-bk-" }, status: "COMPLETED", ownerId: { not: null } },
    orderBy: { scheduledAt: "desc" },
  })
  const REVIEWS = [
    { rating: 5, title: "Quick and thorough", comment: "In and out in under an hour and they explained everything clearly. Would book again.", reply: null },
    { rating: 5, title: "Fair price, great work", comment: "Brakes were done same day and the price matched the quote exactly. Really friendly team.", reply: "Thanks so much — glad the brakes are sorted. See you at your next service!" },
    { rating: 4, title: "Good but a little slow", comment: "Tyres fitted well and balanced properly. Had to wait a bit longer than expected at drop-off.", reply: null },
    { rating: 5, title: "Honest advice", comment: "Told me what actually needed doing rather than upselling. Back for every MOT from now on.", reply: null },
    { rating: 3, title: "Work was fine, communication could be better", comment: "Cambelt job was done well but I had to chase for updates during the day.", reply: null },
  ]
  let reviewCount = 0
  for (const [i, b] of reviewable.slice(0, REVIEWS.length).entries()) {
    const r = REVIEWS[i]
    await prisma.review.create({
      data: {
        id: `pd-rev-${i + 1}`,
        ownerId: b.ownerId!,
        garageId: premier.id,
        bookingId: b.id,
        rating: r.rating,
        title: r.title,
        comment: r.comment,
        reply: r.reply,
        repliedAt: r.reply ? new Date(b.scheduledAt.getTime() + 2 * 86400000) : null,
        createdAt: new Date(b.scheduledAt.getTime() + 86400000),
      },
    })
    reviewCount++
  }

  console.log(`✅ Garage portal demo: ${TECHNICIANS.length} technicians, ${SPECS.length} bookings, ${reviewCount} reviews for ${premier.name}`)
}

export async function seedGaragePortalDemo(prisma: PrismaClient) {
  await main(prisma)
}

// Standalone entry point.
if (require.main === module) {
  const prisma = new PrismaClient()
  main(prisma)
    .catch((err) => {
      console.error(err)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
