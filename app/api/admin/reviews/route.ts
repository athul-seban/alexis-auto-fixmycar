import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

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

  const all = await prisma.review.findMany({
    where: rating ? { rating: Number(rating) } : undefined,
    include: {
      owner: { select: { name: true, email: true } },
      garage: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  })

  const filtered = q
    ? all.filter(
        (r) =>
          r.comment.toLowerCase().includes(q) ||
          r.garage.name.toLowerCase().includes(q) ||
          (r.owner.name ?? r.owner.email).toLowerCase().includes(q)
      )
    : all

  const total = filtered.length
  const start = (page - 1) * pageSize
  const pageItems = filtered.slice(start, start + pageSize)

  const ratingCounts: Record<number, number> = {}
  for (const r of all) ratingCounts[r.rating] = (ratingCounts[r.rating] ?? 0) + 1

  return NextResponse.json({
    reviews: pageItems.map((r) => ({
      id: r.id,
      rating: r.rating,
      title: r.title,
      comment: r.comment,
      createdAt: r.createdAt,
      garage: r.garage.name,
      customer: r.owner.name ?? r.owner.email,
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
    await prisma.review.delete({ where: { id: reviewId } })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
