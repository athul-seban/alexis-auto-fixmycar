import { NextResponse } from "next/server"
import { audit } from "@/lib/audit"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { ratingAfterRemove } from "@/lib/portal/ratings"
import { z } from "zod"

/** Reviews left through a booking link have no owner account; fall back to the name snapshot. */
function reviewerName(r: { owner: { name: string | null; email: string } | null; customerName: string | null }) {
  return r.owner?.name ?? r.owner?.email ?? r.customerName ?? "Customer"
}

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const rating = searchParams.get("rating")
  const q = searchParams.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  const where = rating ? { rating: Number(rating) } : undefined
  const [all, ratingGroups, totalNoSearch] = await Promise.all([
    prisma.review.findMany({
    where,
    ...(q ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
    include: {
      owner: { select: { name: true, email: true } },
      garage: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
    }),
    prisma.review.groupBy({ by: ["rating"], _count: { _all: true } }),
    prisma.review.count({ where }),
  ])

  const filtered = q
    ? all.filter(
        (r) =>
          r.comment.toLowerCase().includes(q) ||
          r.garage.name.toLowerCase().includes(q) ||
          reviewerName(r).toLowerCase().includes(q)
      )
    : all

  const total = q ? filtered.length : totalNoSearch
  const pageItems = q ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered

  const ratingCounts: Record<number, number> = {}
  for (const g of ratingGroups) ratingCounts[g.rating] = g._count._all

  return NextResponse.json({
    reviews: pageItems.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt,
      garage: r.garage.name,
      customer: reviewerName(r),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    ratingCounts,
  })
}

const deleteSchema = z.object({ reviewId: z.string() })

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { reviewId } = deleteSchema.parse(body)
    const review = await prisma.review.findUnique({ where: { id: reviewId } })
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })

    // Keep the garage's public rating in step with the removal (it was never adjusted before).
    const garage = await prisma.garage.findUnique({ where: { id: review.garageId } })
    await prisma.$transaction([
      prisma.review.delete({ where: { id: reviewId } }),
      ...(garage ? [prisma.garage.update({ where: { id: garage.id }, data: ratingAfterRemove(garage, review.rating) })] : []),
    ])
    await audit(session, { action: "REVIEW_DELETED", targetType: "REVIEW", targetId: reviewId, detail: `${review.rating}★ review of ${garage?.name ?? "a garage"}` })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
