import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { articleInputSchema } from "@/lib/article-input"

async function adminId() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  return user?.role === "ADMIN" ? (user.id ?? null) : null
}

export async function GET(req: Request) {
  if (!(await adminId())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const status = sp.get("status")
  const q = sp.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize")) || 10))
  const where = status === "DRAFT" || status === "PUBLISHED" ? { status } : undefined

  const [rows, counts, totalNoSearch] = await Promise.all([
    prisma.article.findMany({
      where,
      orderBy: { updatedAt: "desc" },
      ...(q ? {} : { skip: (page - 1) * pageSize, take: pageSize }),
      select: { id: true, slug: true, title: true, excerpt: true, status: true, publishedAt: true, updatedAt: true },
    }),
    prisma.article.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.article.count({ where }),
  ])
  // Title search happens in memory so it behaves the same on SQLite and Postgres.
  const filtered = q ? rows.filter((r) => r.title.toLowerCase().includes(q) || r.slug.includes(q)) : rows
  const total = q ? filtered.length : totalNoSearch
  const items = q ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered

  const countMap: Record<string, number> = { ALL: 0 }
  for (const c of counts) {
    countMap[c.status] = c._count._all
    countMap.ALL += c._count._all
  }
  return NextResponse.json({ articles: items, total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize)), counts: countMap })
}

export async function POST(req: Request) {
  const id = await adminId()
  if (!id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const data = articleInputSchema.parse(await req.json())
    const article = await prisma.article.create({
      data: { ...data, authorId: id, publishedAt: data.status === "PUBLISHED" ? new Date() : null },
    })
    return NextResponse.json({ article }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: err.issues[0]?.message ?? "Invalid data" }, { status: 400 })
    if ((err as { code?: string })?.code === "P2002") return NextResponse.json({ error: "Another article already uses that web address" }, { status: 409 })
    console.error("Admin articles POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
