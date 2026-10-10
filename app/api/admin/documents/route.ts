import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { notifyGarage } from "@/lib/notifications"
import { garageLinks } from "@/lib/portal/links"
import { DOCUMENT_KIND_LABELS, isDocumentKind } from "@/lib/garage-documents"

const STATUSES = ["PENDING", "APPROVED", "REJECTED"]

async function adminSession() {
  const session = await getServerSession(authOptions)
  return session && (session.user as { role?: string }).role === "ADMIN" ? session : null
}

export async function GET(req: Request) {
  if (!(await adminSession())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const status = sp.get("status")
  const page = Math.max(1, Number(sp.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(sp.get("pageSize")) || 10))
  const where = status && STATUSES.includes(status) ? { status } : undefined

  const [rows, total, counts] = await Promise.all([
    prisma.garageDocument.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { garage: { select: { id: true, name: true, city: true, isVerified: true } } },
    }),
    prisma.garageDocument.count({ where }),
    prisma.garageDocument.groupBy({ by: ["status"], _count: { _all: true } }),
  ])
  const countMap: Record<string, number> = { ALL: 0 }
  for (const c of counts) {
    countMap[c.status] = c._count._all
    countMap.ALL += c._count._all
  }

  return NextResponse.json({
    documents: rows.map((d) => ({
      id: d.id,
      kind: d.kind,
      kindLabel: isDocumentKind(d.kind) ? DOCUMENT_KIND_LABELS[d.kind] : d.kind,
      name: d.name,
      status: d.status,
      note: d.note,
      createdAt: d.createdAt,
      reviewedAt: d.reviewedAt,
      garage: d.garage,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts: countMap,
  })
}

const decisionSchema = z.object({
  documentId: z.string(),
  decision: z.enum(["APPROVE", "REJECT"]),
  // A rejection has to say why, or the garage can't fix it.
  note: z.string().trim().max(300).optional(),
})

export async function PATCH(req: Request) {
  const session = await adminSession()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { documentId, decision, note } = decisionSchema.parse(await req.json())
    if (decision === "REJECT" && !note) return NextResponse.json({ error: "Say why the document was rejected so the garage can fix it" }, { status: 400 })
    const doc = await prisma.garageDocument.findUnique({ where: { id: documentId }, include: { garage: { select: { id: true, name: true } } } })
    if (!doc) return NextResponse.json({ error: "Document not found" }, { status: 404 })

    const status = decision === "APPROVE" ? "APPROVED" : "REJECTED"
    await prisma.garageDocument.update({ where: { id: documentId }, data: { status, note: decision === "REJECT" ? note : null, reviewedAt: new Date() } })

    const label = isDocumentKind(doc.kind) ? DOCUMENT_KIND_LABELS[doc.kind] : doc.kind
    await audit(session, {
      action: decision === "APPROVE" ? "DOCUMENT_APPROVED" : "DOCUMENT_REJECTED",
      targetType: "DOCUMENT",
      targetId: documentId,
      detail: `${label} for ${doc.garage.name}${note ? ` — ${note}` : ""}`,
    })
    await notifyGarage({
      garageId: doc.garage.id,
      type: "GARAGE_STATUS_CHANGED",
      title: decision === "APPROVE" ? "Document approved" : "Document needs attention",
      body: decision === "APPROVE" ? `Your ${label.toLowerCase()} was approved.` : `Your ${label.toLowerCase()} was rejected: ${note}`,
      link: garageLinks.profile,
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    console.error("Admin documents PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
