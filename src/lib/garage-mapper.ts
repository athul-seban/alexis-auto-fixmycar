import type { GarageListItem, GarageProfile, OpeningHours, ServiceType } from "@/types"

export function parseServiceList(json: string | null | undefined): ServiceType[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseImageList(json: string | null | undefined): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function parseOpeningHours(json: string | null | undefined): OpeningHours | null {
  if (!json) return null
  try {
    return JSON.parse(json) as OpeningHours
  } catch {
    return null
  }
}

interface RawGarageListSelect {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  images: string
  phone: string
  email: string
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  status: string
  isVerified: boolean
  isMobile: boolean
  services: string
  averageRating: number
  totalReviews: number
  totalBookings: number
  createdAt: Date
}

interface RawGarageCompareSelect extends RawGarageListSelect {
  address: string
  website: string | null
  openingHours: string | null
}

export function toGarageListItem(row: RawGarageListSelect): GarageListItem {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    logo: row.logo,
    images: parseImageList(row.images),
    phone: row.phone,
    email: row.email,
    city: row.city,
    postcode: row.postcode,
    latitude: row.latitude,
    longitude: row.longitude,
    status: row.status as GarageListItem["status"],
    isVerified: row.isVerified,
    isMobile: row.isMobile,
    services: parseServiceList(row.services),
    averageRating: row.averageRating,
    totalReviews: row.totalReviews,
    totalBookings: row.totalBookings,
    createdAt: row.createdAt.toISOString(),
  }
}

export function toGarageProfile(row: RawGarageCompareSelect): GarageProfile {
  return {
    ...toGarageListItem(row),
    address: row.address,
    website: row.website,
    openingHours: parseOpeningHours(row.openingHours),
  }
}
