import { describe, expect, it } from "vitest"
import { outwardPostcode, redactForGarage } from "./redact"

describe("outwardPostcode", () => {
  it("keeps only the outward code", () => {
    expect(outwardPostcode("le11 3tu")).toBe("LE11")
    expect(outwardPostcode("LE113TU")).toBe("LE11")
    expect(outwardPostcode("SW1A 1AA")).toBe("SW1A")
    expect(outwardPostcode("")).toBe("")
  })
})

describe("redactForGarage", () => {
  const input = {
    vehicle: { vrm: "AB12CDE", make: "Ford", model: "Focus", year: 2015 },
    customer: { name: "Ann Lee", phone: "07700900123" },
    location: { city: "Loughborough", postcode: "LE11 3TU" },
  }
  it("hides personal details before acceptance", () => {
    const r = redactForGarage(input, false)
    expect(r.vehicle).toEqual({ vrm: null, make: "Ford", model: "Focus", year: 2015 })
    expect(r.customer).toEqual({ name: null, phone: null })
    expect(r.location).toEqual({ city: "Loughborough", postcode: "LE11" })
    expect(r.detailsShared).toBe(false)
  })
  it("reveals everything once accepted", () => {
    const r = redactForGarage(input, true)
    expect(r.customer.name).toBe("Ann Lee")
    expect(r.vehicle.vrm).toBe("AB12CDE")
    expect(r.detailsShared).toBe(true)
  })
})
