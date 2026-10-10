import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"

const querySchema = z.object({
  rating: z.coerce.number().int().min(1).max(5).optional(),
  replied: z.enum(["yes", "no"]).optional(),
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().refine((n) => [10, 25, 50].includes(n), "Unsupported page size").default(10),
})

export const GET = withGarage("Garage reviews GET", async (req, { garage }) => {
  const sp = new URL(req.url).searchParams
  const parsed = querySchema.safeParse({
    rating: sp.get("rating") || undefined,
    replied: sp.get("replied") || undefined,
    page: sp.get("page") || undefined,
    pageSize: sp.get("pageSize") || undefined,
  })
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    return NextResponse.json({ error: `Invalid ${issue.path.join(".") || "query"}: ${issue.message}` }, { status: 400 })
  }
  const q = parsed.data

  const where = {
    garageId: garage.id,
    ...(q.rating ? { rating: q.rating } : {}),
    ...(q.replied === "yes" ? { reply: { not: null } } : q.replied === "no" ? { reply: null } : {}),
  }

  const [rows, total, byRatingRows, unreplied] = await Promise.all([
    prisma.review.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        owner: { select: { name: true } },
        booking: { select: { id: true, reference: true, serviceType: true } },
      },
    }),
    prisma.review.count({ where }),
    prisma.review.groupBy({ by: ["rating"], where: { garageId: garage.id }, _count: { rating: true } }),
    prisma.review.count({ where: { garageId: garage.id, reply: null } }),
  ])

  const byRating: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  for (const r of byRatingRows) byRating[r.rating] = r._count.rating

  return NextResponse.json({
    reviews: rows.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt.toISOString(),
      reply: r.reply,
      repliedAt: r.repliedAt?.toISOString() ?? null,
      disputeStatus: r.disputeStatus,
      disputeNote: r.disputeNote,
      customerName: r.owner?.name ?? r.customerName ?? "Customer",
      serviceType: r.booking.serviceType,
      bookingId: r.booking.id,
      bookingReference: r.booking.reference,
    })),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    counts: { byRating, unreplied },
    // The headline figures customers see on the public listing.
    summary: { average: garage.averageRating, total: garage.totalReviews },
  })
})
