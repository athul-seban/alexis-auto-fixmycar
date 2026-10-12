import { describe, it, expect } from "vitest"
import { directionsUrl } from "@/lib/geo-links"

describe("directionsUrl", () => {
  it("prefers coordinates, and falls back to the encoded address", () => {
    expect(directionsUrl({ latitude: 51.45, longitude: -2.59, address: "1 High St", city: "Bristol", postcode: "BS1 1AA" }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=51.45%2C-2.59")
    expect(directionsUrl({ latitude: null, longitude: null, address: "1 High St", city: "Bristol", postcode: "BS1 1AA" }))
      .toBe("https://www.google.com/maps/dir/?api=1&destination=1%20High%20St%2C%20Bristol%2C%20BS1%201AA")
  })
})
