import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

const TARGETS = ["GARAGE", "USER", "REVIEW", "DOCUMENT"]

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sp = new URL(req.url).searchParams
  const target = sp.get("target")
  const q = sp.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize")) || 10))

  const where = target && TARGETS.includes(target) ? { targetType: target } : undefined
  // Text search is in memory (cross-DB case-insensitivity); plain browsing pages in the database.
  const [rows, counts, totalNoSearch] = await Promise.all([
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, ...(q ? {} : { skip: (page - 1) * pageSize, take: pageSize }) }),
    prisma.auditLog.groupBy({ by: ["targetType"], _count: { _all: true } }),
    prisma.auditLog.count({ where }),
  ])

  const filtered = q ? rows.filter((r) => [r.action, r.actorEmail ?? "", r.detail ?? ""].some((f) => f.toLowerCase().includes(q))) : rows
  const total = q ? filtered.length : totalNoSearch
  const items = q ? filtered.slice((page - 1) * pageSize, page * pageSize) : filtered

  const countMap: Record<string, number> = {}
  for (const c of counts) countMap[c.targetType] = c._count._all

  return NextResponse.json({
    entries: items.map((r) => ({ id: r.id, action: r.action, actor: r.actorEmail ?? "Unknown", targetType: r.targetType, targetId: r.targetId, detail: r.detail, createdAt: r.createdAt })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: { ALL: Object.values(countMap).reduce((a, b) => a + b, 0), ...countMap },
  })
}
