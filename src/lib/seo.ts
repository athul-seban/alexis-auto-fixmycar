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

export interface SeoArticle {
  slug: string
  title: string
  excerpt: string
  publishedAt: Date
  updatedAt: Date
}

/** schema.org Article for a published guide/blog post. */
export function articleJsonLd(a: SeoArticle) {
  return {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: a.title,
    description: a.excerpt,
    mainEntityOfPage: absoluteUrl(`/blog/${a.slug}`),
    datePublished: a.publishedAt.toISOString(),
    dateModified: a.updatedAt.toISOString(),
    author: { "@type": "Organization", name: "Quote My Garage" },
    publisher: { "@type": "Organization", name: "Quote My Garage" },
  }
}

/** schema.org Organization for the whole site (home page). Only facts we actually hold. */
export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Quote My Garage",
    url: absoluteUrl("/"),
    logo: absoluteUrl("/icons/512"),
  }
}

/** schema.org WebSite, with a sitelinks search box that points at the real search page. */
export function websiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "Quote My Garage",
    url: absoluteUrl("/"),
    potentialAction: {
      "@type": "SearchAction",
      target: { "@type": "EntryPoint", urlTemplate: absoluteUrl("/search?location={search_term_string}") },
      "query-input": "required name=search_term_string",
    },
  }
}

/** schema.org BreadcrumbList; `path` is site-relative. The last crumb is the current page. */
export function breadcrumbJsonLd(crumbs: { name: string; path: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.name, item: absoluteUrl(c.path) })),
  }
}

/** schema.org ItemList of garage pages, for a location landing page. */
export function garageListJsonLd(garages: { name: string; slug: string }[]) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    itemListElement: garages.map((g, i) => ({ "@type": "ListItem", position: i + 1, name: g.name, url: absoluteUrl(`/garage/${g.slug}`) })),
  }
}
