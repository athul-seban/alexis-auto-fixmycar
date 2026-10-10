import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"
import crypto from "crypto"
import { backfillBookings } from "../src/lib/portal/backfill"
import { seedGaragePortalDemo } from "./seed-garage-portal"
import { seedDemoExtra } from "./seed-demo-extra"

const prisma = new PrismaClient()

const openingHours = {
  monday: { open: true, from: "08:00", to: "18:00" },
  tuesday: { open: true, from: "08:00", to: "18:00" },
  wednesday: { open: true, from: "08:00", to: "18:00" },
  thursday: { open: true, from: "08:00", to: "18:00" },
  friday: { open: true, from: "08:00", to: "17:30" },
  saturday: { open: true, from: "09:00", to: "14:00" },
  sunday: { open: false, from: "", to: "" },
}

const garages = [
  {
    email: "premier@quotemygarage.dev",
    name: "Premier Auto Services",
    slug: "premier-auto-services",
    description: "Family-run garage with 20+ years experience. Specialists in all makes and models.",
    phone: "020 7123 4567",
    garageEmail: "info@premierauto.com",
    address: "123 High Street",
    city: "London",
    postcode: "SW1A 1AA",
    latitude: 51.5,
    longitude: -0.12,
    status: "APPROVED",
    isVerified: true,
    verificationBadges: ["ID_VERIFIED", "INSURANCE_VERIFIED"],
    isMobile: false,
    services: ["MOT", "FULL_SERVICE", "BRAKES", "TYRES", "REPAIR"],
    averageRating: 4.9,
    totalReviews: 342,
    totalBookings: 1205,
  },
  {
    email: "quickfix@quotemygarage.dev",
    name: "QuickFix Mobile Mechanics",
    slug: "quickfix-mobile",
    description: "Mobile mechanics who come to you. Available 7 days a week across Manchester.",
    phone: "0161 234 5678",
    garageEmail: "hello@quickfix.com",
    address: "Mobile Service",
    city: "Manchester",
    postcode: "M1 1AA",
    latitude: 53.48,
    longitude: -2.24,
    status: "APPROVED",
    isVerified: true,
    verificationBadges: ["ID_VERIFIED"],
    isMobile: true,
    services: ["DIAGNOSTICS", "BATTERY", "TYRES", "BRAKES"],
    averageRating: 4.8,
    totalReviews: 218,
    totalBookings: 876,
  },
  {
    email: "elite@quotemygarage.dev",
    name: "Elite Car Care Centre",
    slug: "elite-car-care",
    description: "Award-winning garage specialising in premium and performance vehicles.",
    phone: "0121 456 7890",
    garageEmail: "info@elitecar.com",
    address: "45 Industrial Way",
    city: "Birmingham",
    postcode: "B1 1AA",
    latitude: 52.48,
    longitude: -1.89,
    status: "APPROVED",
    isVerified: true,
    verificationBadges: ["ID_VERIFIED", "INSURANCE_VERIFIED", "QUALIFICATIONS_VERIFIED"],
    isMobile: false,
    services: ["MOT", "CAMBELT", "CLUTCH", "FULL_SERVICE", "REPAIR"],
    averageRating: 4.7,
    totalReviews: 185,
    totalBookings: 654,
  },
  {
    email: "citygate@quotemygarage.dev",
    name: "Citygate Garage",
    slug: "citygate-garage",
    description: "Trusted local garage serving Leeds for over 15 years. Free collection available.",
    phone: "0113 789 0123",
    garageEmail: "info@citygate.com",
    address: "78 Park Road",
    city: "Leeds",
    postcode: "LS1 1AA",
    latitude: 53.8,
    longitude: -1.55,
    status: "APPROVED",
    isVerified: false,
    verificationBadges: [],
    isMobile: false,
    services: ["FULL_SERVICE", "EXHAUST", "AIR_CON", "MOT"],
    averageRating: 4.6,
    totalReviews: 156,
    totalBookings: 423,
  },
  {
    email: "rapid@quotemygarage.dev",
    name: "Rapid Repair Centre",
    slug: "rapid-repair-centre",
    description: "Fast turnaround repairs with competitive pricing. Same day service available.",
    phone: "0117 234 5678",
    garageEmail: "info@rapid.com",
    address: "22 Union Street",
    city: "Bristol",
    postcode: "BS1 1AA",
    latitude: 51.45,
    longitude: -2.59,
    status: "APPROVED",
    isVerified: true,
    verificationBadges: ["INSURANCE_VERIFIED"],
    isMobile: false,
    services: ["BRAKES", "TYRES", "BATTERY", "WINDSCREEN", "EXHAUST"],
    averageRating: 4.5,
    totalReviews: 134,
    totalBookings: 398,
  },
  {
    email: "oxford@quotemygarage.dev",
    name: "Oxford Road Motors",
    slug: "oxford-road-motors",
    description: "Independent garage offering honest diagnostics and repairs for all vehicle types.",
    phone: "01865 345 678",
    garageEmail: "info@oxfordroadmotors.com",
    address: "9 Oxford Road",
    city: "Oxford",
    postcode: "OX1 1AA",
    latitude: 51.75,
    longitude: -1.26,
    status: "PENDING",
    isVerified: false,
    verificationBadges: [],
    isMobile: false,
    services: ["DIAGNOSTICS", "REPAIR", "MOT"],
    averageRating: 0,
    totalReviews: 0,
    totalBookings: 0,
  },
  {
    email: "cardiff@quotemygarage.dev",
    name: "Cardiff Bay Auto Repairs",
    slug: "cardiff-bay-auto-repairs",
    description: "New to the platform — full service and MOT specialists in Cardiff Bay.",
    phone: "029 2034 5678",
    garageEmail: "hello@cardiffbayauto.com",
    address: "14 Bute Street",
    city: "Cardiff",
    postcode: "CF10 1AA",
    latitude: 51.47,
    longitude: -3.16,
    status: "PENDING",
    isVerified: false,
    verificationBadges: [],
    isMobile: false,
    services: ["MOT", "FULL_SERVICE", "TYRES"],
    averageRating: 0,
    totalReviews: 0,
    totalBookings: 0,
  },
  {
    email: "suspended-example@quotemygarage.dev",
    name: "Faded Motors (Suspended)",
    slug: "faded-motors",
    description: "Suspended for repeated customer complaints — seeded for admin testing.",
    phone: "0141 234 5678",
    garageEmail: "info@fadedmotors.com",
    address: "1 Back Alley",
    city: "Glasgow",
    postcode: "G1 1AA",
    latitude: 55.86,
    longitude: -4.25,
    status: "SUSPENDED",
    isVerified: false,
    verificationBadges: [],
    isMobile: false,
    services: ["REPAIR", "EXHAUST"],
    averageRating: 2.1,
    totalReviews: 12,
    totalBookings: 34,
  },
]

const owners = [
  {
    email: "sarah.mitchell@example.com",
    name: "Sarah Mitchell",
    phone: "07700 900111",
    vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus", year: 2019, fuel: "PETROL", color: "Blue", mileage: 42000 },
  },
  {
    email: "james.patel@example.com",
    name: "James Patel",
    phone: "07700 900112",
    vehicle: { registration: "XY56 JKL", make: "BMW", model: "3 Series", year: 2021, fuel: "DIESEL", color: "Black", mileage: 18000 },
  },
  {
    email: "emma.turner@example.com",
    name: "Emma Turner",
    phone: "07700 900113",
    vehicle: { registration: "MN34 OPQ", make: "Toyota", model: "Yaris", year: 2018, fuel: "HYBRID", color: "White", mileage: 51000 },
  },
  {
    email: "david.chen@example.com",
    name: "David Chen",
    phone: "07700 900114",
    vehicle: {
      registration: "CD34 EFG",
      make: "Nissan",
      model: "Qashqai",
      year: 2020,
      fuel: "PETROL",
      color: "Grey",
      mileage: 29500,
      motDueDaysFromNow: 12,
    },
  },
  {
    email: "sophie.williams@example.com",
    name: "Sophie Williams",
    phone: "07700 900115",
    vehicle: {
      registration: "GH45 IJK",
      make: "Honda",
      model: "Civic",
      year: 2017,
      fuel: "PETROL",
      color: "Red",
      mileage: 68000,
      serviceDueDaysFromNow: 20,
    },
  },
  {
    email: "oliver.brown@example.com",
    name: "Oliver Brown",
    phone: "07700 900116",
    vehicle: { registration: "KL67 MNO", make: "Volkswagen", model: "Golf", year: 2022, fuel: "PETROL", color: "Silver", mileage: 8200 },
  },
  {
    email: "amelia.jones@example.com",
    name: "Amelia Jones",
    phone: "07700 900117",
    vehicle: {
      registration: "PQ89 RST",
      make: "Vauxhall",
      model: "Corsa",
      year: 2016,
      fuel: "DIESEL",
      color: "Blue",
      mileage: 82000,
      motDueDaysFromNow: 5,
    },
  },
]

async function main() {
  const adminPassword = await bcrypt.hash("admin123", 10)
  const admin = await prisma.user.upsert({
    where: { email: "admin@quotemygarage.dev" },
    update: {},
    create: {
      email: "admin@quotemygarage.dev",
      name: "Admin",
      password: adminPassword,
      role: "ADMIN",
    },
  })
  console.log("✅ Admin user ready:", admin.email, "(password: admin123)")

  // Second admin, for testing multi-admin role management
  const admin2Password = await bcrypt.hash("admin123", 10)
  await prisma.user.upsert({
    where: { email: "admin2@quotemygarage.dev" },
    update: {},
    create: {
      email: "admin2@quotemygarage.dev",
      name: "Priya Admin",
      password: admin2Password,
      role: "ADMIN",
    },
  })
  console.log("✅ Second admin ready: admin2@quotemygarage.dev (password: admin123)")

  const garagePassword = await bcrypt.hash("garage123", 10)
  const garageIdBySlug: Record<string, string> = {}

  for (const g of garages) {
    const user = await prisma.user.upsert({
      where: { email: g.email },
      update: {},
      create: {
        email: g.email,
        name: g.name,
        password: garagePassword,
        phone: g.phone,
        role: "GARAGE",
      },
    })

    const garage = await prisma.garage.upsert({
      where: { slug: g.slug },
      update: {},
      create: {
        userId: user.id,
        name: g.name,
        slug: g.slug,
        description: g.description,
        phone: g.phone,
        email: g.garageEmail,
        address: g.address,
        city: g.city,
        postcode: g.postcode,
        latitude: g.latitude,
        longitude: g.longitude,
        status: g.status,
        isVerified: g.isVerified,
        verificationBadges: JSON.stringify(g.verificationBadges),
        isMobile: g.isMobile,
        services: JSON.stringify(g.services),
        openingHours: JSON.stringify(openingHours),
        images: JSON.stringify([]),
        averageRating: g.averageRating,
        totalReviews: g.totalReviews,
        totalBookings: g.totalBookings,
      },
    })
    garageIdBySlug[g.slug] = garage.id
  }

  console.log(`✅ Seeded ${garages.length} garages (password for all garage logins: garage123)`)

  const ownerPassword = await bcrypt.hash("owner123", 10)
  const ownerIdByEmail: Record<string, string> = {}

  for (const o of owners) {
    const user = await prisma.user.upsert({
      where: { email: o.email },
      update: {},
      create: {
        email: o.email,
        name: o.name,
        password: ownerPassword,
        phone: o.phone,
        role: "OWNER",
      },
    })
    ownerIdByEmail[o.email] = user.id

    const v = o.vehicle as typeof o.vehicle & { motDueDaysFromNow?: number; serviceDueDaysFromNow?: number }
    await prisma.vehicle.upsert({
      where: { id: `seed-${v.registration}` },
      update: {},
      create: {
        id: `seed-${v.registration}`,
        ownerId: user.id,
        registration: v.registration,
        make: v.make,
        model: v.model,
        year: v.year,
        fuel: v.fuel,
        color: v.color,
        mileage: v.mileage,
        motDueDate: v.motDueDaysFromNow != null ? new Date(Date.now() + v.motDueDaysFromNow * 24 * 60 * 60 * 1000) : undefined,
        serviceDueDate:
          v.serviceDueDaysFromNow != null ? new Date(Date.now() + v.serviceDueDaysFromNow * 24 * 60 * 60 * 1000) : undefined,
      },
    })
  }

  console.log(`✅ Seeded ${owners.length} owners (password for all owner logins: owner123)`)

  const sarah = await prisma.user.findUnique({ where: { email: "sarah.mitchell@example.com" } })
  const james = await prisma.user.findUnique({ where: { email: "james.patel@example.com" } })
  const emma = await prisma.user.findUnique({ where: { email: "emma.turner@example.com" } })
  const david = await prisma.user.findUnique({ where: { email: "david.chen@example.com" } })
  const sophie = await prisma.user.findUnique({ where: { email: "sophie.williams@example.com" } })
  const oliver = await prisma.user.findUnique({ where: { email: "oliver.brown@example.com" } })

  const premier = await prisma.garage.findUnique({ where: { slug: "premier-auto-services" } })
  const quickfix = await prisma.garage.findUnique({ where: { slug: "quickfix-mobile" } })
  const elite = await prisma.garage.findUnique({ where: { slug: "elite-car-care" } })
  const citygate = await prisma.garage.findUnique({ where: { slug: "citygate-garage" } })
  const rapid = await prisma.garage.findUnique({ where: { slug: "rapid-repair-centre" } })

  // Bookings across a spread of statuses so admin/dashboard views have realistic data
  const bookingSeeds = [
    {
      id: "seed-booking-1",
      ownerId: sarah?.id,
      vehicleId: "seed-AB12 CDE",
      garageId: premier?.id,
      serviceType: "MOT",
      status: "COMPLETED",
      scheduledAt: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
      totalPrice: 54.99,
    },
    {
      id: "seed-booking-2",
      ownerId: james?.id,
      vehicleId: "seed-XY56 JKL",
      garageId: quickfix?.id,
      serviceType: "BATTERY",
      status: "CONFIRMED",
      scheduledAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      completedAt: null,
      totalPrice: 120,
    },
    {
      id: "seed-booking-3",
      ownerId: emma?.id,
      vehicleId: "seed-MN34 OPQ",
      garageId: elite?.id,
      serviceType: "FULL_SERVICE",
      status: "IN_PROGRESS",
      scheduledAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000),
      completedAt: null,
      totalPrice: 189.99,
    },
    {
      id: "seed-booking-4",
      ownerId: david?.id,
      vehicleId: "seed-CD34 EFG",
      garageId: citygate?.id,
      serviceType: "AIR_CON",
      status: "PENDING",
      scheduledAt: new Date(Date.now() + 6 * 24 * 60 * 60 * 1000),
      completedAt: null,
      totalPrice: 75,
    },
    {
      id: "seed-booking-5",
      ownerId: sophie?.id,
      vehicleId: "seed-GH45 IJK",
      garageId: rapid?.id,
      serviceType: "BRAKES",
      status: "COMPLETED",
      scheduledAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000),
      completedAt: new Date(Date.now() - 19 * 24 * 60 * 60 * 1000),
      totalPrice: 210,
    },
    {
      id: "seed-booking-6",
      ownerId: oliver?.id,
      vehicleId: "seed-KL67 MNO",
      garageId: premier?.id,
      serviceType: "TYRES",
      status: "CANCELLED",
      scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      completedAt: null,
      totalPrice: 320,
    },
  ]

  for (const b of bookingSeeds) {
    if (!b.ownerId || !b.garageId) continue
    await prisma.booking.upsert({
      where: { id: b.id },
      update: {},
      create: {
        id: b.id,
        ownerId: b.ownerId,
        vehicleId: b.vehicleId,
        garageId: b.garageId,
        serviceType: b.serviceType,
        status: b.status,
        scheduledAt: b.scheduledAt,
        completedAt: b.completedAt ?? undefined,
        totalPrice: b.totalPrice,
      },
    })
  }
  console.log(`✅ Seeded ${bookingSeeds.length} bookings across varied statuses`)

  if (sarah && premier) {
    await prisma.review.upsert({
      where: { bookingId: "seed-booking-1" },
      update: {},
      create: {
        id: "seed-review-1",
        ownerId: sarah.id,
        garageId: premier.id,
        bookingId: "seed-booking-1",
        rating: 5,
        title: "Quick and thorough",
        comment: "In and out in under an hour, and they explained everything clearly. Would book again.",
      },
    })
  }

  if (sophie && rapid) {
    await prisma.review.upsert({
      where: { bookingId: "seed-booking-5" },
      update: {},
      create: {
        id: "seed-review-2",
        ownerId: sophie.id,
        garageId: rapid.id,
        bookingId: "seed-booking-5",
        rating: 4,
        title: "Good value",
        comment: "Fair pricing on new brake pads and discs. Slightly longer wait than quoted but solid work.",
      },
    })
  }
  console.log("✅ Seeded 2 sample reviews")

  // Quotes across statuses (authenticated flow)
  const quoteSeeds = [
    {
      id: "seed-quote-1",
      ownerId: emma?.id,
      vehicleId: "seed-MN34 OPQ",
      garageId: elite?.id,
      serviceType: "CAMBELT",
      description: "Cambelt is due for replacement according to service history, please quote.",
      status: "PENDING",
    },
    {
      id: "seed-quote-2",
      ownerId: oliver?.id,
      vehicleId: "seed-KL67 MNO",
      garageId: premier?.id,
      serviceType: "DIAGNOSTICS",
      description: "Engine management light came on this morning, car still drives fine.",
      status: "SENT",
      price: 65,
      laborCost: 65,
      partsCost: 0,
      notes: "Diagnostic scan only — parts quoted separately once we know the fault code.",
    },
    {
      id: "seed-quote-3",
      ownerId: james?.id,
      vehicleId: "seed-XY56 JKL",
      garageId: quickfix?.id,
      serviceType: "BATTERY",
      description: "Battery struggling to start car in cold mornings.",
      status: "ACCEPTED",
      price: 120,
    },
  ]

  for (const q of quoteSeeds) {
    if (!q.ownerId || !q.garageId) continue
    await prisma.quote.upsert({
      where: { id: q.id },
      update: {},
      create: {
        id: q.id,
        ownerId: q.ownerId,
        vehicleId: q.vehicleId,
        garageId: q.garageId,
        serviceType: q.serviceType,
        description: q.description,
        status: q.status,
        price: q.price,
        laborCost: q.laborCost,
        partsCost: q.partsCost,
        notes: q.notes,
        validUntil: q.status === "SENT" ? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) : undefined,
      },
    })
  }
  console.log(`✅ Seeded ${quoteSeeds.length} quotes across varied statuses`)

  // Guest job requests (no account) + garage responses, across the funnel
  const jobRequestSeeds = [
    {
      id: "seed-jobreq-1",
      token: crypto.randomBytes(24).toString("hex"),
      status: "OPEN",
      guestName: "Liam Walker",
      guestEmail: "liam.walker@example.com",
      guestPhone: "07700 900201",
      registration: "RS12 TUV",
      make: "Skoda",
      model: "Octavia",
      year: 2019,
      fuel: "DIESEL",
      mileage: 45000,
      serviceType: "REPAIR",
      description: "Grinding noise from the front left wheel when braking.",
      city: "London",
      postcode: "SW1A 2BB",
      isMobilePreferred: false,
      responses: [],
    },
    {
      id: "seed-jobreq-2",
      token: crypto.randomBytes(24).toString("hex"),
      status: "QUOTED",
      guestName: "Grace Kelly",
      guestEmail: "grace.kelly@example.com",
      guestPhone: "07700 900202",
      registration: "WX34 YZA",
      make: "Mini",
      model: "Cooper",
      year: 2020,
      fuel: "PETROL",
      mileage: 22000,
      serviceType: "MOT",
      description: "MOT due next month, would like to book ahead.",
      city: "Manchester",
      postcode: "M1 2CC",
      isMobilePreferred: true,
      responses: [
        { garageId: quickfix?.id, price: 54.99, status: "SENT", message: "We can fit you in this week, mobile service available." },
      ],
    },
    {
      id: "seed-jobreq-3",
      token: crypto.randomBytes(24).toString("hex"),
      status: "BOOKED",
      guestName: "Noah Ahmed",
      guestEmail: "noah.ahmed@example.com",
      guestPhone: "07700 900203",
      registration: "BC56 DEF",
      make: "Audi",
      model: "A3",
      year: 2018,
      fuel: "PETROL",
      mileage: 61000,
      serviceType: "CLUTCH",
      description: "Clutch feels heavy and slipping on hill starts.",
      city: "Birmingham",
      postcode: "B1 2DD",
      isMobilePreferred: false,
      responses: [
        { garageId: elite?.id, price: 480, status: "ACCEPTED", message: "Clutch kit replacement, includes parts and labour, 1-day turnaround." },
      ],
    },
    {
      id: "seed-jobreq-4",
      token: crypto.randomBytes(24).toString("hex"),
      status: "CANCELLED",
      guestName: "Isla Fraser",
      guestEmail: "isla.fraser@example.com",
      guestPhone: "07700 900204",
      registration: "GH78 IJK",
      make: "Kia",
      model: "Sportage",
      year: 2021,
      fuel: "HYBRID",
      mileage: 15000,
      serviceType: "TYRES",
      description: "Two new front tyres needed, size 225/45 R18.",
      city: "Leeds",
      postcode: "LS1 2EE",
      isMobilePreferred: false,
      responses: [],
    },
  ]

  for (const jr of jobRequestSeeds) {
    const jobRequest = await prisma.jobRequest.upsert({
      where: { id: jr.id },
      update: {},
      create: {
        id: jr.id,
        token: jr.token,
        status: jr.status,
        guestName: jr.guestName,
        guestEmail: jr.guestEmail,
        guestPhone: jr.guestPhone,
        registration: jr.registration,
        make: jr.make,
        model: jr.model,
        year: jr.year,
        fuel: jr.fuel,
        mileage: jr.mileage,
        serviceType: jr.serviceType,
        description: jr.description,
        city: jr.city,
        postcode: jr.postcode,
        isMobilePreferred: jr.isMobilePreferred,
      },
    })

    for (const r of jr.responses) {
      if (!r.garageId) continue
      await prisma.jobResponse.upsert({
        where: { jobRequestId_garageId: { jobRequestId: jobRequest.id, garageId: r.garageId } },
        update: {},
        create: {
          jobRequestId: jobRequest.id,
          garageId: r.garageId,
          price: r.price,
          message: r.message,
          status: r.status,
          validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        },
      })
    }
  }
  console.log(`✅ Seeded ${jobRequestSeeds.length} guest job requests spanning the enquiry funnel`)

  // Messages on the accepted quote thread, so the messaging UI has something to show
  if (james && quickfix) {
    await prisma.message.upsert({
      where: { id: "seed-message-1" },
      update: {},
      create: {
        id: "seed-message-1",
        quoteId: "seed-quote-3",
        senderId: james.id,
        garageId: quickfix.id,
        body: "Hi, is there any chance of getting this done tomorrow morning instead?",
      },
    })
    const quickfixUser = await prisma.user.findUnique({ where: { email: "quickfix@quotemygarage.dev" } })
    if (quickfixUser) {
      await prisma.message.upsert({
        where: { id: "seed-message-2" },
        update: {},
        create: {
          id: "seed-message-2",
          quoteId: "seed-quote-3",
          senderId: quickfixUser.id,
          garageId: quickfix.id,
          body: "Yes, we can do 9am tomorrow — I'll update the booking time once confirmed.",
        },
      })
    }
  }
  console.log("✅ Seeded sample message thread")

  // Notifications so the bell/notification list has real data across both roles
  if (emma) {
    await prisma.notification.upsert({
      where: { id: "seed-notif-1" },
      update: {},
      create: {
        id: "seed-notif-1",
        userId: emma.id,
        type: "BOOKING_STATUS_CHANGED",
        title: "Booking in progress",
        body: "Elite Car Care Centre has started your full service.",
        link: "/dashboard?booking=seed-booking-3",
      },
    })
  }
  if (premier) {
    await prisma.notification.upsert({
      where: { id: "seed-notif-2" },
      update: {},
      create: {
        id: "seed-notif-2",
        garageId: premier.id,
        type: "REVIEW_RECEIVED",
        title: "New 5-star review",
        body: "In and out in under an hour, and they explained everything clearly. Would book again.",
        link: "/garage-dashboard/bookings?booking=seed-booking-1",
      },
    })
  }
  console.log("✅ Seeded sample notifications")

  await seedDemoExtra(prisma)

  // Upgrade the plain bookings above (source, snapshots, reference, searchText), then add the
  // garage-portal demo data (technicians + ~30 bookings for Premier Auto Services).
  const backfilled = await backfillBookings({ db: prisma })
  console.log(`✅ Backfilled ${backfilled.updated} booking(s) with portal fields`)
  await seedGaragePortalDemo(prisma)

  console.log("\nSeed summary:")
  console.log(`  Garages: ${garages.length} (statuses: APPROVED x5, PENDING x2, SUSPENDED x1)`)
  console.log(`  Owners: ${owners.length}`)
  console.log(`  Bookings: ${bookingSeeds.length}`)
  console.log(`  Quotes: ${quoteSeeds.length}`)
  console.log(`  Guest job requests: ${jobRequestSeeds.length}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
