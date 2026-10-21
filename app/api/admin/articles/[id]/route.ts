import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { articleInputSchema } from "@/lib/article-input"
import { isAdmin } from "@/lib/roles"

type Ctx = { params: Promise<{ id: string }> }

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  return isAdmin((session?.user as { role?: string } | undefined)?.role)
}

export async function GET(_req: Request, { params }: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const article = await prisma.article.findUnique({ where: { id: (await params).id } })
  if (!article) return NextResponse.json({ error: "Article not found" }, { status: 404 })
  return NextResponse.json({ article })
}

export async function PATCH(req: Request, { params }: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
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
    if ((err as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Another article already uses that web address" }, { status: 409 })
    console.error("Admin articles PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  const res = await prisma.article.deleteMany({ where: { id: (await params).id } })
  if (res.count === 0) return NextResponse.json({ error: "Article not found" }, { status: 404 })
  return NextResponse.json({ success: true })
}
