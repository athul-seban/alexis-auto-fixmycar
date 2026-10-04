import { describe, it, expect } from "vitest"
import { jobMatchesGarage, toGarageJobView } from "@/lib/job-matching"

const garage = { city: "Bristol", postcode: "BS1 4DJ", services: JSON.stringify(["MOT", "BRAKES"]), isMobile: false }
const job = { city: "Bristol", postcode: "BS1 5AA", serviceType: "MOT", isMobilePreferred: false }

describe("jobMatchesGarage", () => {
  it("matches on city, case-insensitively, when the service is offered", () => {
    expect(jobMatchesGarage(job, garage)).toBe(true)
    expect(jobMatchesGarage({ ...job, city: "BRISTOL (north)" }, garage)).toBe(true)
  })

  it("matches on postcode prefix when the city differs", () => {
    expect(jobMatchesGarage({ ...job, city: "Clifton", postcode: "bs1 2ab" }, garage)).toBe(true)
  })

  it("rejects other areas and services the garage doesn't offer", () => {
    expect(jobMatchesGarage({ ...job, city: "Leeds", postcode: "LS1 1AA" }, garage)).toBe(false)
    expect(jobMatchesGarage({ ...job, serviceType: "CLUTCH" }, garage)).toBe(false)
  })

  it("only lets mobile garages take mobile-preferred jobs", () => {
    expect(jobMatchesGarage({ ...job, isMobilePreferred: true }, garage)).toBe(false)
    expect(jobMatchesGarage({ ...job, isMobilePreferred: true }, { ...garage, isMobile: true })).toBe(true)
  })

  it("copes with a garage that has no/invalid services", () => {
    expect(jobMatchesGarage(job, { ...garage, services: "not json" })).toBe(false)
  })
})

describe("toGarageJobView", () => {
  it("drops the tracking token and guest email but keeps the rest", () => {
    const view = toGarageJobView({ token: "secret", guestEmail: "g@example.com", guestPhone: "0770", city: "Bristol" })
    expect(view).toEqual({ guestPhone: "0770", city: "Bristol" })
  })
})
