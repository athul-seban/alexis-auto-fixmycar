import { prisma } from "@/lib/prisma"
import { parseServiceList } from "@/lib/garage-mapper"
import { getServiceLabel } from "@/lib/utils"

// Location landing pages (/garages/<city> and /garages/<city>/<service>) are built only from approved garages, so a
// page exists exactly when there is real content for it.

/** Services that get their own landing pages, with the URL slug used for each. */
export const LANDING_SERVICES = [
  { type: "MOT", slug: "mot" },
  { type: "FULL_SERVICE", slug: "full-service" },
  { type: "INTERIM_SERVICE", slug: "interim-service" },
  { type: "BRAKES", slug: "brakes" },
  { type: "TYRES", slug: "tyres" },
  { type: "CLUTCH", slug: "clutch" },
  { type: "CAMBELT", slug: "cambelt" },
  { type: "EXHAUST", slug: "exhaust" },
  { type: "BATTERY", slug: "battery" },
  { type: "AIR_CON", slug: "air-con" },
  { type: "DIAGNOSTICS", slug: "diagnostics" },
  { type: "ELECTRIC_SERVICE", slug: "electric-vehicle-service" },
] as const

export const serviceBySlug = (slug: string) => LANDING_SERVICES.find((s) => s.slug === slug)
export const slugForService = (type: string) => LANDING_SERVICES.find((s) => s.type === type)?.slug

/** Plain, factual one-liners about each service. No prices or promises. */
export const SERVICE_BLURBS: Record<string, string> = {
  MOT: "An MOT is the annual roadworthiness and emissions test required for most cars once they are three years old. A garage will tell you what failed and what needs fixing before you can drive on.",
  FULL_SERVICE: "A full service is the most thorough routine check: oil and filters, brakes, steering, suspension, lights and more, following the manufacturer's schedule.",
  INTERIM_SERVICE: "An interim service is a lighter check done between full services, ideal for high-mileage drivers or when your last service was more than six months ago.",
  BRAKES: "Brake work covers pads, discs, fluid and calipers. Squealing, grinding or a soft pedal are all signs to get them checked promptly.",
  TYRES: "Tyre fitting, balancing, puncture repair and replacement. The legal minimum tread depth is 1.6mm across the central three-quarters of the tyre.",
  CLUTCH: "Clutch repair or replacement, usually needed when the biting point changes, the clutch slips or gear changes feel rough.",
  CAMBELT: "A cambelt (timing belt) change is preventative maintenance on a schedule set by the manufacturer; a failed belt can cause serious engine damage.",
  EXHAUST: "Exhaust repairs and replacements, from a blown section or leaking joint to catalytic converter and DPF issues.",
  BATTERY: "Battery testing and replacement, including mobile fitting from some garages if your car will not start.",
  AIR_CON: "Air conditioning checks, re-gas and repairs, useful if the system blows warm air or has a musty smell.",
  DIAGNOSTICS: "Fault diagnosis using diagnostic equipment, typically when a warning light comes on or the car runs poorly.",
  ELECTRIC_SERVICE: "Servicing and checks for electric and hybrid vehicles by garages equipped for high-voltage systems.",
}

export const slugify = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // drop accents: "Zürich" -> "zurich"
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

export interface LandingGarage {
  id: string
  slug: string
  name: string
  city: string
  postcode: string
  address: string
  description: string | null
  isVerified: boolean
  isMobile: boolean
  rating: number
  reviews: number
  services: string[]
  serviceTypes: string[]
}

const select = {
  id: true, slug: true, name: true, city: true, postcode: true, address: true, description: true, isVerified: true,
  isMobile: true, averageRating: true, totalReviews: true, services: true,
} as const

function toLanding(g: {
  id: string; slug: string; name: string; city: string; postcode: string; address: string; description: string | null
  isVerified: boolean; isMobile: boolean; averageRating: number; totalReviews: number; services: string
}): LandingGarage {
  const types = parseServiceList(g.services) as string[]
  return {
    id: g.id, slug: g.slug, name: g.name, city: g.city, postcode: g.postcode, address: g.address, description: g.description,
    isVerified: g.isVerified, isMobile: g.isMobile, rating: Math.round(g.averageRating * 10) / 10, reviews: g.totalReviews,
    serviceTypes: types, services: types.map((t) => getServiceLabel(t)),
  }
}

/** Cities that have at least one approved garage, biggest first. */
export async function listCities(): Promise<{ city: string; slug: string; count: number }[]> {
  try {
    const groups = await prisma.garage.groupBy({ by: ["city"], where: { status: "APPROVED" }, _count: { _all: true } })
    const merged = new Map<string, { city: string; slug: string; count: number }>()
    for (const g of groups) {
      const slug = slugify(g.city)
      if (!slug) continue
      const prev = merged.get(slug)
      merged.set(slug, { city: prev?.city ?? g.city.trim(), slug, count: (prev?.count ?? 0) + g._count._all })
    }
    return [...merged.values()].sort((a, b) => b.count - a.count || a.city.localeCompare(b.city))
  } catch (err) {
    console.error("[locations] cities unavailable:", err)
    return []
  }
}

/** Approved garages in a city (by URL slug), best-reviewed first, optionally only those offering a service. */
export async function getCityGarages(citySlug: string, serviceType?: string): Promise<{ city: string; garages: LandingGarage[] } | null> {
  const cities = await listCities()
  const match = cities.find((c) => c.slug === citySlug)
  if (!match) return null
  // Matched in memory on the slug: SQLite and Postgres disagree on case-insensitive filters, and "Leeds" / "leeds"
  // / "LEEDS" must all land on one page.
  const rows = await prisma.garage.findMany({ where: { status: "APPROVED" }, select, take: 2000 })
  const all = rows.filter((g) => slugify(g.city) === citySlug).map(toLanding)
  const garages = (serviceType ? all.filter((g) => g.serviceTypes.includes(serviceType)) : all).sort(
    (a, b) => Number(b.isVerified) - Number(a.isVerified) || b.reviews - a.reviews || b.rating - a.rating || a.name.localeCompare(b.name)
  )
  return { city: match.city, garages }
}

/** The landing-page services that at least one of these garages offers, in display order. */
export function servicesOffered(garages: LandingGarage[]): string[] {
  const seen = new Set<string>()
  for (const g of garages) for (const t of g.serviceTypes) if (slugForService(t)) seen.add(t)
  return LANDING_SERVICES.map((s) => s.type).filter((t) => seen.has(t))
}
