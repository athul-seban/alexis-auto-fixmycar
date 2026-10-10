import { describe, it, expect, beforeEach, afterAll } from "vitest"
import { prisma } from "@/lib/prisma"
import { GET } from "./route"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"

const PREFIX = "searchtest-"
const search = async (qs = "") => {
  const res = await GET(new Request(`http://x/api/garages?city=${PREFIX}city${qs}`))
  return (await res.json()) as { garages: { id: string; name: string; featured?: boolean; recommended?: boolean }[]; total: number }
}

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

const rated = (id: string, over: object) => prisma.garage.update({ where: { id }, data: over })

describe("GET /api/garages — best match", () => {
  it("is the default order, and a strong record beats a single perfect review", async () => {
    const a = await makeGarage(PREFIX, { key: "proven" })
    const b = await makeGarage(PREFIX, { key: "fluke" })
    await rated(a.garage.id, { averageRating: 4.8, totalReviews: 120, isVerified: true, avgResponseMins: 20 })
    await rated(b.garage.id, { averageRating: 5, totalReviews: 1 })

    const { garages } = await search()
    expect(garages.map((g) => g.id)).toEqual([a.garage.id, b.garage.id])
    expect(garages[0].recommended).toBe(true)
    expect(garages[1].recommended).toBe(false)
  })

  it("puts a currently featured garage first and labels it, but not a lapsed one", async () => {
    const top = await makeGarage(PREFIX, { key: "top" })
    const paid = await makeGarage(PREFIX, { key: "paid" })
    const lapsed = await makeGarage(PREFIX, { key: "lapsed" })
    await rated(top.garage.id, { averageRating: 4.9, totalReviews: 200, isVerified: true })
    await rated(paid.garage.id, { averageRating: 3.5, totalReviews: 4, featuredUntil: new Date(Date.now() + 86_400_000) })
    await rated(lapsed.garage.id, { averageRating: 3.4, totalReviews: 4, featuredUntil: new Date(Date.now() - 86_400_000) })

    const { garages } = await search()
    expect(garages[0].id).toBe(paid.garage.id)
    expect(garages[0].featured).toBe(true)
    expect(garages.find((g) => g.id === lapsed.garage.id)?.featured).toBe(false)
    expect(garages[1].id).toBe(top.garage.id)
  })

  it("ranks the nearer garage higher when the customer's location is known", async () => {
    const near = await makeGarage(PREFIX, { key: "near" })
    const far = await makeGarage(PREFIX, { key: "far" })
    await rated(near.garage.id, { latitude: 52.64, longitude: -1.14 })
    await rated(far.garage.id, { latitude: 51.5, longitude: -0.12 })

    const { garages } = await search("&lat=52.63&lng=-1.13")
    expect(garages.map((g) => g.id)).toEqual([near.garage.id, far.garage.id])
  })

  it("lets the cheaper garage win a tie when searching a specific service", async () => {
    const cheap = await makeGarage(PREFIX, { key: "cheap" })
    const dear = await makeGarage(PREFIX, { key: "dear" })
    await prisma.servicePrice.create({ data: { garageId: cheap.garage.id, serviceType: "MOT", priceFrom: 35 } })
    await prisma.servicePrice.create({ data: { garageId: dear.garage.id, serviceType: "MOT", priceFrom: 60 } })

    const { garages } = await search("&service=MOT")
    expect(garages.map((g) => g.id)).toEqual([cheap.garage.id, dear.garage.id])
  })

  it("still honours the explicit sorts and filters, and pages the ranked list", async () => {
    const a = await makeGarage(PREFIX, { key: "a" })
    const b = await makeGarage(PREFIX, { key: "b" })
    await rated(a.garage.id, { averageRating: 3, totalReviews: 50, isVerified: true })
    await rated(b.garage.id, { averageRating: 4.9, totalReviews: 5 })

    expect((await search("&sort=rating")).garages[0].id).toBe(b.garage.id)
    expect((await search("&verified=true")).garages.map((g) => g.id)).toEqual([a.garage.id])
    const page2 = await search("&limit=1&page=2")
    expect(page2.garages).toHaveLength(1)
    expect(page2.total).toBe(2)
  })

  it("never lists garages that aren't approved", async () => {
    await makeGarage(PREFIX, { key: "pending", status: "PENDING" })
    expect((await search()).total).toBe(0)
  })
})
