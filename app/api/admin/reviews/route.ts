import { NextResponse } from "next/server"
import { audit } from "@/lib/audit"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { ratingAfterRemove } from "@/lib/portal/ratings"
import { notifyGarage } from "@/lib/notifications"
import { garageLinks } from "@/lib/portal/links"
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

  // `rating=DISPUTED` is the moderation queue: reviews a garage has challenged that are still awaiting a decision.
  const where = rating === "DISPUTED" ? { disputeStatus: "OPEN" } : rating ? { rating: Number(rating) } : undefined
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
  const openDisputes = await prisma.review.count({ where: { disputeStatus: "OPEN" } })

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
      disputeStatus: r.disputeStatus,
      disputeReason: r.disputeReason,
      disputedAt: r.disputedAt,
      disputeNote: r.disputeNote,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    ratingCounts,
    counts: { DISPUTED: openDisputes },
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

const decisionSchema = z.object({
  reviewId: z.string(),
  decision: z.enum(["UPHOLD", "REJECT"]),
  note: z.string().trim().max(500).optional(),
})

/**
 * Decide a garage's dispute. UPHOLD removes the review (and adjusts the garage's rating, as a delete does);
 * REJECT keeps it and records why. Either way the garage is told, and the decision is audited.
 */
export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const { reviewId, decision, note } = decisionSchema.parse(await req.json())
    const review = await prisma.review.findUnique({ where: { id: reviewId }, include: { garage: true } })
    if (!review) return NextResponse.json({ error: "Review not found" }, { status: 404 })
    if (review.disputeStatus !== "OPEN") return NextResponse.json({ error: "This review has no open dispute" }, { status: 409 })

    if (decision === "UPHOLD") {
      await prisma.$transaction([
        prisma.review.delete({ where: { id: reviewId } }),
        prisma.garage.update({ where: { id: review.garageId }, data: ratingAfterRemove(review.garage, review.rating) }),
      ])
    } else {
      await prisma.review.update({ where: { id: reviewId }, data: { disputeStatus: "REJECTED", disputeNote: note || null } })
    }

    await audit(session, {
      action: decision === "UPHOLD" ? "REVIEW_DISPUTE_UPHELD" : "REVIEW_DISPUTE_REJECTED",
      targetType: "REVIEW",
      targetId: reviewId,
      detail: `${review.rating}★ review of ${review.garage.name}${note ? ` — ${note}` : ""}`,
    })
    await notifyGarage({
      garageId: review.garageId,
      type: "REVIEW_RECEIVED",
      title: decision === "UPHOLD" ? "Your review dispute was upheld" : "Your review dispute was not upheld",
      body: decision === "UPHOLD" ? "The review has been removed from your listing." : (note ? `The review stays. ${note}` : "The review stays on your listing."),
      link: garageLinks.reviews,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    console.error("Admin review dispute PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
