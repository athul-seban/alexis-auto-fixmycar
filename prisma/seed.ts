import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

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
    isVerified: true,
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
    isVerified: true,
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
    isVerified: true,
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
    isVerified: false,
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
    isVerified: true,
    isMobile: false,
    services: ["BRAKES", "TYRES", "BATTERY", "WINDSCREEN", "EXHAUST"],
    averageRating: 4.5,
    totalReviews: 134,
    totalBookings: 398,
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

  const garagePassword = await bcrypt.hash("garage123", 10)

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

    await prisma.garage.upsert({
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
        status: "APPROVED",
        isVerified: g.isVerified,
        isMobile: g.isMobile,
        services: JSON.stringify(g.services),
        openingHours: JSON.stringify(openingHours),
        images: JSON.stringify([]),
        averageRating: g.averageRating,
        totalReviews: g.totalReviews,
        totalBookings: g.totalBookings,
      },
    })
  }

  console.log(`✅ Seeded ${garages.length} garages (password for all garage logins: garage123)`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
