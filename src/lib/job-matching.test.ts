import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { prisma } from "./prisma"
import { findMatchingGaragesForJob, findMatchingJobRequestsForGarage } from "./job-matching"

// Integration test against the real (local SQLite) dev database. Creates its
// own fixtures under a unique prefix and cleans them up afterward so it's
// safe to run alongside seeded data.
const PREFIX = "jmtest-"

async function makeUserWithGarage(opts: {
  city: string
  postcode: string
  services: string[]
  isMobile?: boolean
  status?: string
}) {
  const user = await prisma.user.create({
    data: {
      email: `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`,
      role: "GARAGE",
      garage: {
        create: {
          name: `${PREFIX}Garage`,
          slug: `${PREFIX}${Date.now()}-${Math.random().toString(36).slice(2)}`,
          phone: "01234567890",
          email: "garage@example.com",
          address: "1 Test St",
          city: opts.city,
          postcode: opts.postcode,
          status: opts.status ?? "APPROVED",
          isMobile: opts.isMobile ?? false,
          services: JSON.stringify(opts.services),
        },
      },
    },
    include: { garage: true },
  })
  return user.garage!
}

describe("findMatchingGaragesForJob", () => {
  afterAll(async () => {
    await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  })

  it("matches an approved garage in the same city offering the service", async () => {
    await makeUserWithGarage({ city: "Bristol", postcode: "BS1 1AA", services: ["MOT", "BRAKES"] })

    const matches = await findMatchingGaragesForJob({
      city: "Bristol",
      postcode: "BS1 1AA",
      serviceType: "MOT",
    })

    expect(matches.some((g) => g.city === "Bristol")).toBe(true)
  })

  it("excludes garages that don't offer the requested service", async () => {
    const garage = await makeUserWithGarage({ city: "Leeds", postcode: "LS1 1AA", services: ["TYRES"] })

    const matches = await findMatchingGaragesForJob({
      city: "Leeds",
      postcode: "LS1 1AA",
      serviceType: "MOT",
    })

    expect(matches.some((g) => g.id === garage.id)).toBe(false)
  })

  it("excludes non-mobile garages when mobileOnly is requested", async () => {
    const garage = await makeUserWithGarage({
      city: "Cardiff",
      postcode: "CF1 1AA",
      services: ["MOT"],
      isMobile: false,
    })

    const matches = await findMatchingGaragesForJob({
      city: "Cardiff",
      postcode: "CF1 1AA",
      serviceType: "MOT",
      mobileOnly: true,
    })

    expect(matches.some((g) => g.id === garage.id)).toBe(false)
  })

  it("excludes garages that are not APPROVED", async () => {
    const garage = await makeUserWithGarage({
      city: "Oxford",
      postcode: "OX1 1AA",
      services: ["MOT"],
      status: "PENDING",
    })

    const matches = await findMatchingGaragesForJob({
      city: "Oxford",
      postcode: "OX1 1AA",
      serviceType: "MOT",
    })

    expect(matches.some((g) => g.id === garage.id)).toBe(false)
  })
})

describe("findMatchingJobRequestsForGarage", () => {
  afterAll(async () => {
    await prisma.jobRequest.deleteMany({ where: { guestEmail: { startsWith: PREFIX } } })
    await prisma.garage.deleteMany({ where: { name: { startsWith: PREFIX } } })
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } })
  })

  it("matches OPEN job requests in the garage's area requiring an offered service", async () => {
    const garage = await makeUserWithGarage({ city: "Bath", postcode: "BA1 1AA", services: ["MOT"] })

    await prisma.jobRequest.create({
      data: {
        token: `${PREFIX}${Date.now()}`,
        status: "OPEN",
        guestName: "Test Guest",
        guestEmail: `${PREFIX}guest@example.com`,
        guestPhone: "07000000000",
        registration: "AB12CDE",
        make: "Ford",
        model: "Focus",
        year: 2020,
        serviceType: "MOT",
        description: "Needs MOT",
        city: "Bath",
        postcode: "BA1 1AA",
      },
    })

    const jobs = await findMatchingJobRequestsForGarage(garage)
    expect(jobs.some((j) => j.city === "Bath")).toBe(true)
  })

  it("excludes job requests for services the garage doesn't offer", async () => {
    const garage = await makeUserWithGarage({ city: "York", postcode: "YO1 1AA", services: ["TYRES"] })

    await prisma.jobRequest.create({
      data: {
        token: `${PREFIX}${Date.now()}-2`,
        status: "OPEN",
        guestName: "Test Guest",
        guestEmail: `${PREFIX}guest2@example.com`,
        guestPhone: "07000000000",
        registration: "XY34FGH",
        make: "VW",
        model: "Golf",
        year: 2021,
        serviceType: "MOT",
        description: "Needs MOT",
        city: "York",
        postcode: "YO1 1AA",
      },
    })

    const jobs = await findMatchingJobRequestsForGarage(garage)
    expect(jobs.some((j) => j.city === "York")).toBe(false)
  })
})
