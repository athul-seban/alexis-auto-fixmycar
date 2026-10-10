// Extra demo data so every overview has something to show: overdue / due-soon vehicles, quotes awaiting a
// decision, completed jobs without a review, unreplied and disputed reviews, unread messages, pending
// verification documents and open guest enquiries.
// Called from prisma/seed.ts (before the booking backfill, so the bookings get their portal fields).
// Idempotent: every row has an id starting "dx-" and is upserted.
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const DAY = 24 * 60 * 60 * 1000
const days = (n: number, hour = 10) => {
  const d = new Date(Date.now() + n * DAY)
  d.setUTCHours(hour, 0, 0, 0)
  return d
}

const OWNERS = [
  { id: "dx-owner-1", email: "ben.carter@example.com", name: "Ben Carter", phone: "07700 900401" },
  { id: "dx-owner-2", email: "aisha.khan@example.com", name: "Aisha Khan", phone: "07700 900402" },
  { id: "dx-owner-3", email: "marcus.doyle@example.com", name: "Marcus Doyle", phone: "07700 900403" },
  { id: "dx-owner-4", email: "chloe.baxter@example.com", name: "Chloe Baxter", phone: "07700 900404" },
]

// motDue / serviceDue are days from now (negative = overdue).
const VEHICLES = [
  { id: "dx-veh-1", owner: 0, registration: "BN19 XRT", make: "Ford", model: "Focus", year: 2019, fuel: "PETROL", mileage: 41200, motDue: -6, serviceDue: 12 },
  { id: "dx-veh-2", owner: 0, registration: "WP21 HJK", make: "Tesla", model: "Model 3", year: 2021, fuel: "ELECTRIC", mileage: 22800, motDue: 210, serviceDue: 90 },
  { id: "dx-veh-3", owner: 1, registration: "KY68 DLM", make: "Honda", model: "Civic", year: 2018, fuel: "PETROL", mileage: 58900, motDue: 9, serviceDue: null },
  { id: "dx-veh-4", owner: 2, registration: "LG70 PQW", make: "Audi", model: "A4", year: 2020, fuel: "DIESEL", mileage: 63400, motDue: 140, serviceDue: -3 },
  { id: "dx-veh-5", owner: 3, registration: "FD17 NSC", make: "Vauxhall", model: "Corsa", year: 2017, fuel: "PETROL", mileage: 74100, motDue: 24, serviceDue: 24 },
]

export async function seedDemoExtra(prisma: PrismaClient) {
  const premier = await prisma.garage.findUnique({ where: { slug: "premier-auto-services" } })
  const elite = await prisma.garage.findUnique({ where: { slug: "elite-car-care" } })
  const rapid = await prisma.garage.findUnique({ where: { slug: "rapid-repair-centre" } })
  const pending = await prisma.garage.findUnique({ where: { slug: "oxford-road-motors" } })
  if (!premier || !elite || !rapid) {
    console.log("⚠️  Skipped extra demo data: base garages missing")
    return
  }

  const password = await bcrypt.hash("owner123", 10)
  const ownerIds: string[] = []
  for (const o of OWNERS) {
    const user = await prisma.user.upsert({
      where: { email: o.email },
      update: {},
      create: { id: o.id, email: o.email, name: o.name, phone: o.phone, password, role: "OWNER" },
    })
    ownerIds.push(user.id)
  }

  for (const v of VEHICLES) {
    await prisma.vehicle.upsert({
      where: { id: v.id },
      // Refresh the dates on every run so "overdue" / "due soon" stay true relative to today.
      update: { motDueDate: days(v.motDue), serviceDueDate: v.serviceDue === null ? null : days(v.serviceDue) },
      create: {
        id: v.id,
        ownerId: ownerIds[v.owner],
        registration: v.registration,
        make: v.make,
        model: v.model,
        year: v.year,
        fuel: v.fuel,
        mileage: v.mileage,
        motDueDate: days(v.motDue),
        serviceDueDate: v.serviceDue === null ? undefined : days(v.serviceDue),
      },
    })
  }

  // Bookings: a few upcoming, and completed jobs (two reviewed, two still to review).
  const bookings = [
    { id: "dx-booking-1", owner: 0, vehicle: "dx-veh-1", garage: premier.id, service: "MOT", status: "CONFIRMED", at: days(2, 9), price: 54.85 },
    { id: "dx-booking-2", owner: 1, vehicle: "dx-veh-3", garage: elite.id, service: "FULL_SERVICE", status: "PENDING", at: days(5, 13), price: 189 },
    { id: "dx-booking-3", owner: 2, vehicle: "dx-veh-4", garage: premier.id, service: "BRAKES", status: "COMPLETED", at: days(-8), done: days(-7), price: 245 },
    { id: "dx-booking-4", owner: 3, vehicle: "dx-veh-5", garage: rapid.id, service: "TYRES", status: "COMPLETED", at: days(-12), done: days(-11), price: 280 },
    { id: "dx-booking-5", owner: 1, vehicle: "dx-veh-3", garage: premier.id, service: "DIAGNOSTICS", status: "COMPLETED", at: days(-20), done: days(-19), price: 65 },
    { id: "dx-booking-6", owner: 0, vehicle: "dx-veh-2", garage: elite.id, service: "MOT", status: "COMPLETED", at: days(-30), done: days(-29), price: 54.85 },
  ]
  for (const b of bookings) {
    await prisma.booking.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        ownerId: ownerIds[b.owner],
        vehicleId: b.vehicle,
        garageId: b.garage,
        serviceType: b.service,
        status: b.status,
        scheduledAt: b.at,
        completedAt: b.done,
        totalPrice: b.price,
      },
    })
  }

  // Reviews: dx-booking-3 and -4 are unreplied (garage prompts); dx-booking-5 is disputed (admin queue);
  // dx-booking-6 is replied. dx-booking-3/4 owners also still have nothing else to review.
  const reviews = [
    { id: "dx-review-1", booking: "dx-booking-3", owner: 2, garage: premier.id, rating: 5, title: "Sorted my brake noise", comment: "Booked online, fixed the same day and the price matched the quote exactly." },
    { id: "dx-review-2", booking: "dx-booking-4", owner: 3, garage: rapid.id, rating: 3, title: "Fine, but slow", comment: "Tyres were fitted well but it took much longer than the estimate." },
    {
      id: "dx-review-3", booking: "dx-booking-5", owner: 1, garage: premier.id, rating: 1, title: "Not happy", comment: "Nobody called me back about the diagnostics result.",
      disputedAt: days(-2), disputeReason: "We have call logs showing three attempts to reach this customer.", disputeStatus: "OPEN",
    },
    { id: "dx-review-4", booking: "dx-booking-6", owner: 0, garage: elite.id, rating: 5, title: "Painless MOT", comment: "Clear communication and ready early.", reply: "Thanks Ben, see you next year!", repliedAt: days(-27) },
  ]
  for (const r of reviews) {
    const { owner, booking, garage, ...rest } = r
    await prisma.review.upsert({
      where: { bookingId: booking },
      update: {},
      create: { ...rest, garageId: garage, bookingId: booking, ownerId: ownerIds[owner] },
    })
  }

  // Quotes waiting for the customer's decision, plus one still waiting for the garage.
  const quotes = [
    { id: "dx-quote-1", owner: 0, vehicle: "dx-veh-1", garage: premier.id, service: "BRAKES", status: "SENT", price: 265, description: "Front pads and discs, squealing under braking." },
    { id: "dx-quote-2", owner: 0, vehicle: "dx-veh-1", garage: rapid.id, service: "BRAKES", status: "SENT", price: 235, description: "Front pads and discs, squealing under braking." },
    { id: "dx-quote-3", owner: 3, vehicle: "dx-veh-5", garage: elite.id, service: "CLUTCH", status: "PENDING", price: null, description: "Clutch biting point very high, slipping in 4th." },
  ]
  for (const q of quotes) {
    await prisma.quote.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        ownerId: ownerIds[q.owner],
        vehicleId: q.vehicle,
        garageId: q.garage,
        serviceType: q.service,
        status: q.status,
        price: q.price,
        description: q.description,
        validUntil: q.price ? days(7) : undefined,
      },
    })
  }

  // Unread messages for Premier (sent by customers, readAt null).
  const messages = [
    { id: "dx-message-1", booking: "dx-booking-1", owner: 0, body: "Hi, can I drop the car off at 8:30 instead? I need to be at work for 10." },
    { id: "dx-message-2", booking: "dx-booking-3", owner: 2, body: "Thanks for sorting the brakes — could you email me the invoice please?" },
  ]
  for (const m of messages) {
    await prisma.message.upsert({
      where: { id: m.id },
      update: {},
      create: { id: m.id, bookingId: m.booking, senderId: ownerIds[m.owner], garageId: premier.id, body: m.body },
    })
  }

  // Verification documents awaiting an admin decision.
  if (pending) {
    const docs = [
      { id: "dx-doc-1", kind: "INSURANCE", name: "Public liability insurance 2026.pdf" },
      { id: "dx-doc-2", kind: "TRADE_CERTIFICATE", name: "IMI trade certificate.pdf" },
    ]
    for (const d of docs) {
      await prisma.garageDocument.upsert({
        where: { id: d.id },
        update: {},
        create: { id: d.id, garageId: pending.id, kind: d.kind, name: d.name, url: `https://example.com/demo/${d.id}.pdf`, status: "PENDING" },
      })
    }
  }

  // Open guest enquiries (appear in the admin attention queue and garage enquiries).
  const enquiries = [
    { id: "dx-jobreq-1", token: "dx-token-open-0000000000000000000001", name: "Nadia Rahman", email: "nadia.rahman@example.com", vrm: "HK66 BNV", make: "Mazda", model: "CX-5", year: 2016, service: "AIR_CON", desc: "Air con blows warm air since the weekend.", city: "London", postcode: "SW1A 2BB" },
    { id: "dx-jobreq-2", token: "dx-token-open-0000000000000000000002", name: "Owen Price", email: "owen.price@example.com", vrm: "CV18 TRE", make: "Hyundai", model: "i30", year: 2018, service: "DIAGNOSTICS", desc: "Engine warning light came on and the car is running rough.", city: "London", postcode: "SW1A 2BB" },
  ]
  for (const e of enquiries) {
    await prisma.jobRequest.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        token: e.token,
        status: "OPEN",
        guestName: e.name,
        guestEmail: e.email,
        guestPhone: "07700 900499",
        registration: e.vrm,
        make: e.make,
        model: e.model,
        year: e.year,
        serviceType: e.service,
        description: e.desc,
        city: e.city,
        postcode: e.postcode,
      },
    })
  }

  console.log(`✅ Seeded extra demo data: ${OWNERS.length} owners, ${VEHICLES.length} vehicles, ${bookings.length} bookings, ${reviews.length} reviews, ${quotes.length} quotes, ${messages.length} messages, ${enquiries.length} enquiries (owner logins: owner123)`)
}
