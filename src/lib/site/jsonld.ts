import { openingHoursJsonLd, snippet } from "@/lib/seo"

// Structured data for a business website: ONE Organization plus one AutoRepair per location, each linked to the
// organisation (branchOf) so search engines see a single business with several branches rather than duplicates.
// It deliberately carries no aggregateRating: a business marking up its own reviews on its own site is self-serving and
// against Google's guidelines; ratings belong on the marketplace listing, which the website links to.

export interface SiteLocationSeo {
  slug: string
  name: string
  phone: string
  address: string
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  openingHours: string | null
}

export interface SiteSeoInput {
  /** The site's own address, e.g. https://acme.quotemygarage.com (no trailing slash). */
  origin: string
  businessName: string
  description: string | null
  logoUrl: string | null
  /** Social profile URLs (already validated https links). */
  sameAs: string[]
  locations: SiteLocationSeo[]
}

/** The fragment id a location has on the page (`#location-york`), used for links and structured data alike. */
export const locationAnchor = (slug: string) => `location-${slug}`

export function siteJsonLd(i: SiteSeoInput) {
  const orgId = `${i.origin}/#organization`
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: i.businessName,
        url: i.origin,
        ...(i.description ? { description: snippet(i.description, 300) } : {}),
        ...(i.logoUrl ? { logo: i.logoUrl } : {}),
        ...(i.sameAs.length > 0 ? { sameAs: i.sameAs } : {}),
      },
      ...i.locations.map((l) => ({
        "@type": "AutoRepair",
        "@id": `${i.origin}/#${locationAnchor(l.slug)}`,
        name: l.name,
        url: `${i.origin}/#${locationAnchor(l.slug)}`,
        telephone: l.phone,
        branchOf: { "@id": orgId },
        address: { "@type": "PostalAddress", streetAddress: l.address, addressLocality: l.city, postalCode: l.postcode, addressCountry: "GB" },
        ...(l.latitude !== null && l.longitude !== null ? { geo: { "@type": "GeoCoordinates", latitude: l.latitude, longitude: l.longitude } } : {}),
        ...openingHoursJsonLd(l.openingHours),
      })),
    ],
  }
}
