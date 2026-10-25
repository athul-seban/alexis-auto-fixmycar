import { prisma } from "@/lib/prisma"
import { parseOpeningHours, parseServiceList } from "@/lib/garage-mapper"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { orgFeatureEnabled } from "@/lib/org/features"
import { parseContent, type SiteContent } from "@/lib/site/content"
import { parseTheme, type SiteTheme } from "@/lib/site/theme"
import { contentForTier, siteTier } from "@/lib/site/tier"
import type { OpeningHours, ServiceType } from "@/types"

// What a visitor sees, gathered in one place so the live page and the owner's preview can't drift apart. Locations and
// reviews are read live from the business's garages (never copied into the site), and only what is APPROVED is shown.

export interface PublicLocation {
  id: string
  slug: string
  name: string
  phone: string
  email: string
  address: string
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  openingHours: OpeningHours | null
  /** The raw hours JSON, for structured data. */
  openingHoursRaw: string | null
  services: ServiceType[]
  /** Online booking is switched on for this location, so "Book online" works. */
  bookable: boolean
}

export interface PublicReview {
  id: string
  rating: number
  comment: string
  /** First name only. */
  name: string
  location: string
  date: string
}

export interface PublicSite {
  siteId: string
  organisationId: string
  /** The address label it was reached on (empty for a preview). */
  label: string
  businessName: string
  logo: string | null
  theme: SiteTheme
  content: SiteContent
  locations: PublicLocation[]
  reviews: PublicReview[]
  /** Every service any live location offers, once each. */
  services: ServiceType[]
  /** The business's real standing on the marketplace, for the trust line. Never typed in by the business. */
  trust: PublicTrust
  updatedAt: string
}

export interface PublicTrust {
  /** Average star rating across the live locations, one decimal; null when nobody has reviewed it yet. */
  rating: number | null
  reviewCount: number
  /** At least one live location has passed the platform's verification. */
  verified: boolean
}

export type PublicSiteResult =
  | { state: "ok"; site: PublicSite }
  /** An old address that now belongs to a new one: send visitors there permanently. */
  | { state: "redirect"; label: string }
  /** Unknown, unpublished, switched off, suspended, or with nothing live to show. Always a real 404. */
  | { state: "missing" }

const firstName = (full: string | null | undefined): string => {
  const first = (full ?? "").trim().split(/\s+/)[0]
  return first ? first.slice(0, 30) : "A customer"
}

/** The live locations and a few good reviews of a business. */
export async function loadLocationsAndReviews(organisationId: string): Promise<{ locations: PublicLocation[]; reviews: PublicReview[]; services: ServiceType[]; trust: PublicTrust }> {
  const garages = await prisma.garage.findMany({ where: { organisationId, status: "APPROVED" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
  const locations: PublicLocation[] = garages.map((g) => ({
    id: g.id,
    slug: g.slug,
    name: g.name,
    phone: g.phone,
    email: g.email,
    address: g.address,
    city: g.city,
    postcode: g.postcode,
    latitude: g.latitude,
    longitude: g.longitude,
    openingHours: parseOpeningHours(g.openingHours),
    openingHoursRaw: g.openingHours,
    services: parseServiceList(g.services),
    bookable: parsePortalSettings(g.portalSettings).widget.enabled,
  }))

  // Good, substantial reviews only, not ones under dispute; newest first. A handful is plenty for a one-page site.
  const rows =
    garages.length === 0
      ? []
      : await prisma.review.findMany({
          where: { garageId: { in: garages.map((g) => g.id) }, rating: { gte: 4 } },
          orderBy: { createdAt: "desc" },
          take: 40,
          select: { id: true, rating: true, comment: true, customerName: true, createdAt: true, disputeStatus: true, garageId: true, owner: { select: { name: true } } },
        })
  const nameOf = new Map(garages.map((g) => [g.id, g.name]))
  const reviews: PublicReview[] = rows
    .filter((r) => r.comment.trim().length >= 20 && r.disputeStatus !== "OPEN" && r.disputeStatus !== "UPHELD")
    .slice(0, 6)
    .map((r) => ({ id: r.id, rating: r.rating, comment: r.comment.trim().slice(0, 400), name: firstName(r.customerName ?? r.owner?.name), location: nameOf.get(r.garageId) ?? "", date: r.createdAt.toISOString() }))

  const services = [...new Set(locations.flatMap((l) => l.services))]
  return { locations, reviews, services, trust: trustOf(garages) }
}

/** The marketplace's own figures for these locations: the review-weighted average rating, the review count, and verification. */
export function trustOf(garages: { averageRating: number; totalReviews: number; isVerified: boolean }[]): PublicTrust {
  const reviewCount = garages.reduce((n, g) => n + Math.max(0, g.totalReviews), 0)
  const weighted = garages.reduce((sum, g) => sum + g.averageRating * Math.max(0, g.totalReviews), 0)
  const average = reviewCount > 0 ? weighted / reviewCount : 0
  return { rating: reviewCount > 0 && average > 0 ? Math.round(average * 10) / 10 : null, reviewCount, verified: garages.some((g) => g.isVerified) }
}

/** A site as it would look, from draft parts, for an owner's or an admin's preview. Locations and reviews are the live ones. */
export async function buildPreviewSite(args: { siteId: string; organisationId: string; businessName: string; logo: string | null; theme: SiteTheme; content: SiteContent }): Promise<PublicSite> {
  const { locations, reviews, services, trust } = await loadLocationsAndReviews(args.organisationId)
  return { ...args, label: "", locations, reviews, services, trust, updatedAt: new Date().toISOString() }
}

/** Resolve an address to a site. Redirects old addresses; otherwise returns the published site or "missing". */
export async function loadPublicSite(label: string): Promise<PublicSiteResult> {
  const domain = await prisma.siteDomain.findUnique({
    where: { host: label },
    include: { site: { include: { organisation: { select: { id: true, name: true, suspendedAt: true, plan: true, subscriptionStatus: true } } } } },
  })
  if (!domain) return { state: "missing" }
  // The `sites` flag is the rollback: switched off for a business, its website stops being served (the content is kept).
  if (!orgFeatureEnabled("sites", domain.site.organisationId)) return { state: "missing" }

  if (domain.status === "REDIRECT") {
    const active = await prisma.siteDomain.findFirst({ where: { siteId: domain.siteId, status: "ACTIVE" }, select: { host: true } })
    return active ? { state: "redirect", label: active.host } : { state: "missing" }
  }

  const { site } = domain
  if (site.status !== "PUBLISHED" || site.disabledAt || site.organisation.suspendedAt) return { state: "missing" }

  const { locations, reviews, services, trust } = await loadLocationsAndReviews(site.organisationId)
  if (locations.length === 0) return { state: "missing" } // a business with nothing live has nothing to show

  return {
    state: "ok",
    site: {
      siteId: site.id,
      organisationId: site.organisationId,
      label,
      businessName: site.organisation.name,
      logo: site.logo,
      theme: parseTheme(site.theme),
      // The advanced design only shows while the business has it (what it saved stays stored and returns on upgrade).
      content: contentForTier(parseContent(site.content, site.organisation.name), siteTier(site.organisation)),
      locations,
      reviews,
      services,
      trust,
      updatedAt: site.updatedAt.toISOString(),
    },
  }
}
