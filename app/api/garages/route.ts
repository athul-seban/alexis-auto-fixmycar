import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toGarageListItem, toGarageProfile } from "@/lib/garage-mapper"
import { MAX_COMPARE_GARAGES } from "@/lib/constants"

const LIST_SELECT = {
  id: true, name: true, slug: true, description: true, logo: true, images: true,
  phone: true, email: true, city: true, postcode: true, latitude: true, longitude: true,
  status: true, isVerified: true, isMobile: true, services: true,
  averageRating: true, totalReviews: true, totalBookings: true, createdAt: true,
} as const

const COMPARE_SELECT = {
  ...LIST_SELECT,
  address: true,
  website: true,
  openingHours: true,
} as const

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)

    // Compare-by-ids branch — powers the /compare page
    const idsParam = searchParams.get("ids")
    if (idsParam) {
      const ids = Array.from(new Set(idsParam.split(",").map((s) => s.trim()).filter(Boolean))).slice(
        0,
        MAX_COMPARE_GARAGES
      )
      const rows = await prisma.garage.findMany({
        where: { id: { in: ids }, status: "APPROVED" },
        select: COMPARE_SELECT,
      })
      const ordered = ids
        .map((id) => rows.find((r) => r.id === id))
        .filter((r): r is NonNullable<typeof r> => Boolean(r))
        .map(toGarageProfile)

      return NextResponse.json({ garages: ordered, total: ordered.length, page: 1, limit: ordered.length, pages: 1 })
    }

    const city = searchParams.get("city")
    const postcode = searchParams.get("postcode")
    const service = searchParams.get("service")
    const isMobile = searchParams.get("mobile") === "true"
    const isVerified = searchParams.get("verified") === "true"
    const minRating = searchParams.get("minRating")
    const sortBy = searchParams.get("sort") ?? "rating"
    const page = parseInt(searchParams.get("page") ?? "1")
    const limit = parseInt(searchParams.get("limit") ?? "20")

    const where: any = { status: "APPROVED" }

    // SQLite's Prisma connector doesn't support `mode: "insensitive"` — sqlite's
    // underlying LIKE (which `contains` compiles to) is already ASCII case-insensitive
    // by default, so this is safe to drop rather than throw at runtime.
    if (city) where.city = { contains: city }
    if (postcode) where.postcode = { startsWith: postcode.slice(0, 3).toUpperCase() }
    // `services` is a String column holding JSON (sqlite has no native array/`has`
    // filter), so match against the serialized JSON directly. Quoting the token
    // avoids false positives between enum values that share a substring.
    if (service) where.services = { contains: `"${service}"` }
    if (isMobile) where.isMobile = true
    if (isVerified) where.isVerified = true
    if (minRating) where.averageRating = { gte: parseFloat(minRating) }

    const orderBy: any =
      sortBy === "rating" ? { averageRating: "desc" }
      : sortBy === "reviews" ? { totalReviews: "desc" }
      : sortBy === "bookings" ? { totalBookings: "desc" }
      : { averageRating: "desc" }

    const [garages, total] = await Promise.all([
      prisma.garage.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        select: LIST_SELECT,
      }),
      prisma.garage.count({ where }),
    ])

    return NextResponse.json({
      garages: garages.map(toGarageListItem),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    })
  } catch (err) {
    console.error("Garages GET error:", err)
    return NextResponse.json({ error: "Failed to fetch garages" }, { status: 500 })
  }
}
