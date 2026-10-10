import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { toGarageListItem, toGarageProfile } from "@/lib/garage-mapper"
import { MAX_COMPARE_GARAGES } from "@/lib/constants"
import { isFeatured } from "@/lib/portal/plans"
import { haversineKm, orderGarages, priceScores, rankScore } from "@/lib/ranking"

const LIST_SELECT = {
  id: true, name: true, slug: true, description: true, logo: true, images: true,
  phone: true, email: true, city: true, postcode: true, latitude: true, longitude: true,
  status: true, isVerified: true, isMobile: true, services: true,
  averageRating: true, totalReviews: true, totalBookings: true, createdAt: true,
  featuredUntil: true, avgResponseMins: true,
} as const

// Ranking scores every garage that matches the filters, so cap how many it considers.
const RANK_CANDIDATES = 500

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
    const sortBy = searchParams.get("sort") ?? "best"
    const lat = parseFloat(searchParams.get("lat") ?? "")
    const lng = parseFloat(searchParams.get("lng") ?? "")
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

    if (sortBy === "best") {
      const [candidates, total] = await Promise.all([
        prisma.garage.findMany({ where, take: RANK_CANDIDATES, select: LIST_SELECT }),
        prisma.garage.count({ where }),
      ])
      const ids = candidates.map((c) => c.id)
      const [outcomes, prices] = await Promise.all([
        prisma.booking.groupBy({
          by: ["garageId", "status"],
          where: { garageId: { in: ids }, status: { in: ["COMPLETED", "CANCELLED", "NO_SHOW"] } },
          _count: { _all: true },
        }),
        service
          ? prisma.servicePrice.findMany({ where: { garageId: { in: ids }, serviceType: service, isActive: true }, select: { garageId: true, priceFrom: true } })
          : Promise.resolve([]),
      ])
      const completion = new Map<string, { done: number; all: number }>()
      for (const o of outcomes) {
        const c = completion.get(o.garageId) ?? { done: 0, all: 0 }
        c.all += o._count._all
        if (o.status === "COMPLETED") c.done += o._count._all
        completion.set(o.garageId, c)
      }
      const price = priceScores(new Map(candidates.map((c) => [c.id, prices.find((p) => p.garageId === c.id)?.priceFrom ?? null])))
      const here = Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null
      const now = new Date()

      const ranked = orderGarages(
        candidates.map((g) => {
          const c = completion.get(g.id)
          return {
            item: g,
            totalReviews: g.totalReviews,
            featured: isFeatured(g, now),
            score: rankScore({
              averageRating: g.averageRating,
              totalReviews: g.totalReviews,
              isVerified: g.isVerified,
              avgResponseMins: g.avgResponseMins,
              // Too few finished bookings to judge: stay neutral instead of punishing a 1-of-1 cancellation.
              completionRate: c && c.all >= 3 ? c.done / c.all : null,
              distanceKm: here && g.latitude !== null && g.longitude !== null ? haversineKm(here, { lat: g.latitude, lng: g.longitude }) : null,
              priceScore: price.get(g.id) ?? null,
            }),
          }
        })
      )
      const pageItems = ranked.slice((page - 1) * limit, page * limit)
      return NextResponse.json({
        garages: pageItems.map((r) => ({ ...toGarageListItem(r.item), featured: r.featured, recommended: r.recommended, avgResponseMins: r.item.avgResponseMins })),
        total,
        page,
        limit,
        pages: Math.ceil(total / limit),
      })
    }

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
