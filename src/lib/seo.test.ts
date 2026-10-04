import { describe, expect, it } from "vitest"
import { garageJsonLd, jsonLdString, snippet, type SeoGarage } from "@/lib/seo"

const garage: SeoGarage = {
  name: "Premier Auto",
  slug: "premier-auto",
  description: "Family run garage.",
  logo: null,
  images: "[]",
  phone: "01234 567890",
  address: "1 High St",
  city: "London",
  postcode: "N1 1AA",
  latitude: 51.5,
  longitude: -0.1,
  openingHours: JSON.stringify({
    monday: { open: true, from: "09:00", to: "17:00" },
    tuesday: { open: false, from: "09:00", to: "17:00" },
  }),
  averageRating: 4.66,
  totalReviews: 12,
}

describe("snippet", () => {
  it("leaves short text alone and cuts long text at a word boundary", () => {
    expect(snippet("short  text")).toBe("short text")
    const out = snippet("word ".repeat(100), 50)
    expect(out.length).toBeLessThanOrEqual(50)
    expect(out.endsWith("…")).toBe(true)
    expect(out).not.toMatch(/wor…$/)
  })
})

describe("garageJsonLd", () => {
  it("describes the garage as an AutoRepair business with only open days", () => {
    const ld = garageJsonLd(garage, [])
    expect(ld["@type"]).toBe("AutoRepair")
    expect(ld.address.postalCode).toBe("N1 1AA")
    expect(ld.openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:00" }])
    expect(ld.aggregateRating).toMatchObject({ ratingValue: 4.7, reviewCount: 12 })
    expect(ld.geo).toMatchObject({ latitude: 51.5 })
    expect("image" in ld).toBe(false)
  })

  it("omits ratings without reviews and geo without coordinates", () => {
    const ld = garageJsonLd({ ...garage, totalReviews: 0, latitude: null }, [])
    expect("aggregateRating" in ld).toBe(false)
    expect("geo" in ld).toBe(false)
  })
})

describe("jsonLdString", () => {
  it("escapes < so user text cannot close the script tag", () => {
    expect(jsonLdString({ a: "</script><script>alert(1)" })).not.toContain("</script>")
  })
})
