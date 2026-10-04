import { parseOpeningHours } from "@/lib/garage-mapper"
import { absoluteUrl } from "@/lib/portal/links"

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const
const SCHEMA_DAY: Record<(typeof DAYS)[number], string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
}

export interface SeoGarage {
  name: string
  slug: string
  description: string | null
  logo: string | null
  images: string
  phone: string
  address: string
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  openingHours: string | null
  averageRating: number
  totalReviews: number
}

/** `new URL(...)` base so relative Open Graph/canonical URLs resolve in production. */
export const siteUrl = () => new URL(absoluteUrl("/"))

/** Trim to a search-snippet length at a word boundary. */
export function snippet(text: string, max = 155): string {
  const clean = text.replace(/\s+/g, " ").trim()
  if (clean.length <= max) return clean
  return clean.slice(0, max - 1).replace(/\s+\S*$/, "") + "…"
}

/** schema.org AutoRepair (a LocalBusiness) for a garage's public page. Only emits what is actually known. */
export function garageJsonLd(g: SeoGarage, images: string[]) {
  const hours = parseOpeningHours(g.openingHours)
  return {
    "@context": "https://schema.org",
    "@type": "AutoRepair",
    name: g.name,
    url: absoluteUrl(`/garage/${g.slug}`),
    telephone: g.phone,
    ...(g.description ? { description: snippet(g.description, 300) } : {}),
    ...(g.logo || images[0] ? { image: [g.logo, ...images].filter(Boolean) } : {}),
    address: { "@type": "PostalAddress", streetAddress: g.address, addressLocality: g.city, postalCode: g.postcode, addressCountry: "GB" },
    ...(g.latitude !== null && g.longitude !== null ? { geo: { "@type": "GeoCoordinates", latitude: g.latitude, longitude: g.longitude } } : {}),
    ...(hours
      ? {
          openingHoursSpecification: DAYS.filter((d) => hours[d]?.open).map((d) => ({
            "@type": "OpeningHoursSpecification",
            dayOfWeek: SCHEMA_DAY[d],
            opens: hours[d].from,
            closes: hours[d].to,
          })),
        }
      : {}),
    ...(g.totalReviews > 0
      ? { aggregateRating: { "@type": "AggregateRating", ratingValue: Number(g.averageRating.toFixed(1)), reviewCount: g.totalReviews, bestRating: 5, worstRating: 1 } }
      : {}),
  }
}

/** Serialise JSON-LD safely for a <script> tag (a "</script>" in user text must not close it). */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, "\\u003c")
}
