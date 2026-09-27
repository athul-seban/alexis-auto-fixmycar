import { describe, it, expect } from "vitest"
import { parseServiceList, parseImageList, parseOpeningHours, toGarageListItem, toGarageProfile } from "./garage-mapper"

describe("parseServiceList", () => {
  it("parses a valid JSON array", () => {
    expect(parseServiceList('["MOT","BRAKES"]')).toEqual(["MOT", "BRAKES"])
  })
  it("returns [] for null/undefined", () => {
    expect(parseServiceList(null)).toEqual([])
    expect(parseServiceList(undefined)).toEqual([])
  })
  it("returns [] for malformed JSON", () => {
    expect(parseServiceList("not json")).toEqual([])
  })
  it("returns [] when JSON parses to a non-array", () => {
    expect(parseServiceList('{"a":1}')).toEqual([])
  })
})

describe("parseImageList", () => {
  it("parses a valid JSON array of URLs", () => {
    expect(parseImageList('["https://a.com/1.jpg"]')).toEqual(["https://a.com/1.jpg"])
  })
  it("returns [] for malformed JSON", () => {
    expect(parseImageList("{bad")).toEqual([])
  })
})

describe("parseOpeningHours", () => {
  it("parses valid opening hours JSON", () => {
    const json = JSON.stringify({ monday: { open: true, from: "08:00", to: "18:00" } })
    expect(parseOpeningHours(json)).toEqual({ monday: { open: true, from: "08:00", to: "18:00" } })
  })
  it("returns null for null input", () => {
    expect(parseOpeningHours(null)).toBeNull()
  })
  it("returns null for malformed JSON", () => {
    expect(parseOpeningHours("{{{")).toBeNull()
  })
})

const baseRow = {
  id: "g1",
  name: "Test Garage",
  slug: "test-garage",
  description: null,
  logo: null,
  images: '["img1.jpg"]',
  phone: "0123",
  email: "test@garage.com",
  city: "London",
  postcode: "SW1A 1AA",
  latitude: null,
  longitude: null,
  status: "APPROVED",
  isVerified: true,
  isMobile: false,
  services: '["MOT"]',
  averageRating: 4.5,
  totalReviews: 10,
  totalBookings: 20,
  createdAt: new Date("2024-01-01T00:00:00.000Z"),
}

describe("toGarageListItem", () => {
  it("maps a raw Prisma row into a GarageListItem with parsed JSON fields", () => {
    const result = toGarageListItem(baseRow)
    expect(result.services).toEqual(["MOT"])
    expect(result.images).toEqual(["img1.jpg"])
    expect(result.createdAt).toBe("2024-01-01T00:00:00.000Z")
    expect(result.status).toBe("APPROVED")
  })
})

describe("toGarageProfile", () => {
  it("extends the list item with address, website and parsed opening hours", () => {
    const result = toGarageProfile({
      ...baseRow,
      address: "1 High Street",
      website: "https://test-garage.com",
      openingHours: JSON.stringify({ monday: { open: true, from: "09:00", to: "17:00" } }),
    })
    expect(result.address).toBe("1 High Street")
    expect(result.website).toBe("https://test-garage.com")
    expect(result.openingHours?.monday).toEqual({ open: true, from: "09:00", to: "17:00" })
    expect(result.services).toEqual(["MOT"])
  })
})
