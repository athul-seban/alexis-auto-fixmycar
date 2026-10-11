import { afterAll, beforeEach, describe, expect, it } from "vitest"
import { cleanupPrefix, makeGarage } from "@/test/fixtures"
import { getCityGarages, listCities, serviceBySlug, servicesOffered, slugForService, slugify } from "./locations"

const PREFIX = "locations-"
const CITY = "Testville-Locations"

beforeEach(() => cleanupPrefix(PREFIX))
afterAll(() => cleanupPrefix(PREFIX))

describe("slugify", () => {
  it("makes URL-safe city slugs", () => {
    expect(slugify("Leeds")).toBe("leeds")
    expect(slugify("  Stoke-on-Trent ")).toBe("stoke-on-trent")
    expect(slugify("St. Albans")).toBe("st-albans")
    expect(slugify("Cardiff Bay & Docks")).toBe("cardiff-bay-docks")
    expect(slugify("Zürich")).toBe("zurich")
    expect(slugify("!!!")).toBe("")
  })
})

describe("service slugs", () => {
  it("round-trips between URL slug and service type", () => {
    expect(serviceBySlug("mot")?.type).toBe("MOT")
    expect(serviceBySlug("air-con")?.type).toBe("AIR_CON")
    expect(slugForService("FULL_SERVICE")).toBe("full-service")
    expect(serviceBySlug("nonsense")).toBeUndefined()
    expect(slugForService("OTHER")).toBeUndefined()
  })
})

describe("city landing data", () => {
  it("lists only approved garages, merging case variants of a city, and filters by service", async () => {
    await makeGarage(PREFIX, { key: "a", city: CITY, services: ["MOT", "BRAKES"] })
    await makeGarage(PREFIX, { key: "b", city: CITY.toLowerCase(), services: ["MOT"] })
    await makeGarage(PREFIX, { key: "c", city: CITY, services: ["MOT"], status: "PENDING" }) // never public
    await makeGarage(PREFIX, { key: "d", city: CITY, services: ["TYRES"], status: "SUSPENDED" })

    const all = await getCityGarages(slugify(CITY))
    expect(all).not.toBeNull()
    expect(all!.garages).toHaveLength(2)

    const mot = await getCityGarages(slugify(CITY), "MOT")
    expect(mot!.garages).toHaveLength(2)
    const brakes = await getCityGarages(slugify(CITY), "BRAKES")
    expect(brakes!.garages).toHaveLength(1)
    expect((await getCityGarages(slugify(CITY), "TYRES"))!.garages).toHaveLength(0) // the only TYRES garage is suspended

    expect(servicesOffered(all!.garages)).toEqual(["MOT", "BRAKES"])
    const cities = await listCities()
    expect(cities.find((c) => c.slug === slugify(CITY))?.count).toBe(2)
  })

  it("returns null for a city with no approved garages", async () => {
    await makeGarage(PREFIX, { key: "p", city: "Pendington-Locations", status: "PENDING" })
    expect(await getCityGarages("pendington-locations")).toBeNull()
    expect(await getCityGarages("does-not-exist")).toBeNull()
  })
})
