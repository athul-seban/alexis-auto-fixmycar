import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const city = searchParams.get("city")
    const postcode = searchParams.get("postcode")
    const service = searchParams.get("service")
    const isMobile = searchParams.get("mobile") === "true"
    const isVerified = searchParams.get("verified") === "true"
    const sortBy = searchParams.get("sort") ?? "rating"
    const page = parseInt(searchParams.get("page") ?? "1")
    const limit = parseInt(searchParams.get("limit") ?? "20")

    const where: any = { status: "APPROVED" }

    if (city) where.city = { contains: city, mode: "insensitive" }
    if (postcode) where.postcode = { startsWith: postcode.slice(0, 3).toUpperCase() }
    if (service) where.services = { has: service }
    if (isMobile) where.isMobile = true
    if (isVerified) where.isVerified = true

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
        select: {
          id: true, name: true, slug: true, description: true, logo: true, images: true,
          phone: true, email: true, city: true, postcode: true, latitude: true, longitude: true,
          status: true, isVerified: true, isMobile: true, services: true,
          averageRating: true, totalReviews: true, totalBookings: true, createdAt: true,
        },
      }),
      prisma.garage.count({ where }),
    ])

    return NextResponse.json({ garages, total, page, limit, pages: Math.ceil(total / limit) })
  } catch (err) {
    console.error("Garages GET error:", err)
    return NextResponse.json({ error: "Failed to fetch garages" }, { status: 500 })
  }
}
