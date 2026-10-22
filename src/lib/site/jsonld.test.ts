import { describe, expect, it } from "vitest"
import { jsonLdString } from "@/lib/seo"
import { locationAnchor, siteJsonLd, type SiteLocationSeo } from "./jsonld"

const hours = JSON.stringify({ monday: { open: true, from: "09:00", to: "17:30" }, tuesday: { open: false, from: "09:00", to: "17:00" } })
const york: SiteLocationSeo = { slug: "york", name: "Acme York", phone: "01904 123456", address: "12 Micklegate", city: "York", postcode: "YO1 6JX", latitude: 53.95, longitude: -1.08, openingHours: hours }
const leeds: SiteLocationSeo = { slug: "leeds", name: "Acme Leeds", phone: "0113 123456", address: "1 The Headrow", city: "Leeds", postcode: "LS1 1AA", latitude: null, longitude: null, openingHours: null }
const input = { origin: "https://acme.quotemygarage.com", businessName: "Acme Motors", description: "A family garage", logoUrl: "https://x.public.blob.vercel-storage.com/orgs/o/logo.png", sameAs: ["https://facebook.com/acme"], locations: [york, leeds] }

describe("siteJsonLd", () => {
  const graph = siteJsonLd(input)["@graph"] as Record<string, any>[]

  it("is one Organization and one AutoRepair per location", () => {
    expect(graph.map((n) => n["@type"])).toEqual(["Organization", "AutoRepair", "AutoRepair"])
    expect(graph[0]).toMatchObject({ "@id": "https://acme.quotemygarage.com/#organization", name: "Acme Motors", url: "https://acme.quotemygarage.com", sameAs: ["https://facebook.com/acme"] })
  })

  it("links each location to the organisation, with a stable per-location id and anchor", () => {
    expect(graph[1]).toMatchObject({ "@id": "https://acme.quotemygarage.com/#location-york", branchOf: { "@id": "https://acme.quotemygarage.com/#organization" } })
    expect(locationAnchor("york")).toBe("location-york")
    expect(new Set(graph.map((n) => n["@id"])).size).toBe(3)
  })

  it("only says what is known: geo and hours only when present", () => {
    expect(graph[1].geo).toMatchObject({ latitude: 53.95, longitude: -1.08 })
    expect(graph[1].openingHoursSpecification).toEqual([{ "@type": "OpeningHoursSpecification", dayOfWeek: "Monday", opens: "09:00", closes: "17:30" }])
    expect(graph[2]).not.toHaveProperty("geo")
    expect(graph[2]).not.toHaveProperty("openingHoursSpecification")
  })

  it("never claims a rating on the business's own site", () => {
    expect(JSON.stringify(siteJsonLd(input))).not.toMatch(/aggregateRating|ratingValue|reviewCount/)
  })

  it("is safe inside a script tag even if the business name contains markup", () => {
    const out = jsonLdString(siteJsonLd({ ...input, businessName: "</script><script>alert(1)</script>" }))
    expect(out).not.toContain("</script>")
    expect(JSON.parse(out)["@graph"][0].name).toBe("</script><script>alert(1)</script>")
  })
})
