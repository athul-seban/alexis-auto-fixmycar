import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { requireAdmin } from "@/lib/admin-auth"
import { errorCode } from "@/lib/errors"
import { articleInputSchema } from "@/lib/article-input"

type Ctx = { params: Promise<{ id: string }> }

export async function GET(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const article = await prisma.article.findUnique({ where: { id: (await params).id } })
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 })
  return NextResponse.json({ article })
}

export async function PATCH(req: Request, { params }: Ctx) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const { id } = await params

  try {
    const data = articleInputSchema.parse(await req.json())
    const existing = await prisma.article.findUnique({ where: { id }, select: { publishedAt: true } })
    if (!existing) return NextResponse.json({ error: "Article not found" }, { status: 404 })
    const article = await prisma.article.update({
      where: { id },
      // The first publish date sticks: unpublishing and republishing doesn't make an old guide look new.
      data: { ...data, publishedAt: data.status === "PUBLISHED" ? (existing.publishedAt ?? new Date()) : existing.publishedAt },
    })
    return NextResponse.json({ article })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid data" }, { status: 400 })
    if (errorCode(err) === "P2002") return NextResponse.json({ error: "Another article already uses that web address" }, { status: 409 })
    console.error("Admin articles PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const auth = await requireAdmin()
  if (!auth.ok) return auth.response
  const res = await prisma.article.deleteMany({ where: { id: (await params).id } })
  if (res.count === 0) return NextResponse.json({ error: "Article not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}
