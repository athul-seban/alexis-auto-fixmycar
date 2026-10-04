import { NextResponse } from "next/server"
import { audit } from "@/lib/audit"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyGarage } from "@/lib/notifications"
import { garageLinks } from "@/lib/portal/links"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { garageReadiness } from "@/lib/portal/readiness"
import { z } from "zod"

const actionSchema = z.object({
  garageId: z.string(),
  action: z.enum(["approve", "reject", "suspend"]),
  reason: z.string().trim().max(500).optional(),
  /** Approve even though required profile items are missing. */
  force: z.boolean().optional(),
})

const BADGES = ["ID_VERIFIED", "INSURANCE_VERIFIED", "QUALIFICATIONS_VERIFIED"] as const
const badgeSchema = z.object({
  garageId: z.string(),
  badges: z.array(z.enum(BADGES)),
})

function parseBadges(json: string): string[] {
  try {
    const v = JSON.parse(json)
    return Array.isArray(v) ? v.filter((b): b is string => typeof b === "string") : []
  } catch {
    return []
  }
}

const AUDIT_FOR = { approve: "GARAGE_APPROVED", reject: "GARAGE_REJECTED", suspend: "GARAGE_SUSPENDED" } as const

async function requireAdmin() {
  const session = await getServerSession(authOptions)
  return session && (session.user as any).role === "ADMIN" ? session : null
}

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? "PENDING"
  const q = searchParams.get("q")?.trim().toLowerCase()
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  const include = { user: { select: { name: true, email: true, phone: true } } } as const
  const where = { status }

  // Text search is done in memory (SQLite and Postgres disagree on case-insensitive `contains`), so only
  // searches pay for loading every garage in the status; plain browsing pages in the database.
  let total: number
  let pageRows
  if (q) {
    const all = await prisma.garage.findMany({ where, include, orderBy: { createdAt: "desc" } })
    const hits = all.filter((g) => [g.name, g.city, g.email].some((f) => f.toLowerCase().includes(q)))
    total = hits.length
    pageRows = hits.slice((page - 1) * pageSize, page * pageSize)
  } else {
    ;[total, pageRows] = await Promise.all([
      prisma.garage.count({ where }),
      prisma.garage.findMany({ where, include, orderBy: { createdAt: "desc" }, skip: (page - 1) * pageSize, take: pageSize }),
    ])
  }

  const ids = pageRows.map((g) => g.id)
  const [statusCounts, priceCounts] = await Promise.all([
    prisma.garage.groupBy({ by: ["status"], _count: { status: true } }),
    prisma.servicePrice.groupBy({ by: ["garageId"], where: { garageId: { in: ids }, isActive: true }, _count: { _all: true } }),
  ])
  const prices = new Map(priceCounts.map((p) => [p.garageId, p._count._all]))

  const counts = { PENDING: 0, APPROVED: 0, SUSPENDED: 0 } as Record<string, number>
  for (const row of statusCounts) counts[row.status] = row._count.status

  return NextResponse.json({
    garages: pageRows.map((g) => ({
      id: g.id,
      name: g.name,
      slug: g.slug,
      city: g.city,
      postcode: g.postcode,
      email: g.email,
      phone: g.phone,
      status: g.status,
      isVerified: g.isVerified,
      badges: parseBadges(g.verificationBadges),
      averageRating: g.averageRating,
      totalReviews: g.totalReviews,
      totalBookings: g.totalBookings,
      widgetEnabled: parsePortalSettings(g.portalSettings).widget.enabled,
      createdAt: g.createdAt,
      owner: g.user,
      readiness: garageReadiness({ ...g, priceCount: prices.get(g.id) ?? 0 }),
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    counts,
  })
}

const STATUS_FOR = { approve: "APPROVED", reject: "SUSPENDED", suspend: "SUSPENDED" } as const

export async function POST(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { garageId, action, reason, force } = actionSchema.parse(await req.json())

    const existing = await prisma.garage.findUnique({ where: { id: garageId } })
    if (!existing) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    if (action === "approve" && !force) {
      const priceCount = await prisma.servicePrice.count({ where: { garageId, isActive: true } })
      const readiness = garageReadiness({ ...existing, priceCount })
      if (!readiness.ready) {
        return NextResponse.json(
          { error: `This garage's profile is incomplete: ${readiness.missingRequired.join(", ")}.`, code: "NOT_READY", missing: readiness.missingRequired },
          { status: 409 }
        )
      }
    }

    const garage = await prisma.garage.update({
      where: { id: garageId },
      data: { status: STATUS_FOR[action], isVerified: action === "approve" },
    })

    await audit(session, { action: AUDIT_FOR[action], targetType: "GARAGE", targetId: garageId, detail: [garage.name, force ? "approved despite missing profile items" : null, reason].filter(Boolean).join(" · ") })

    // Tell the garage what happened (only when it actually changed).
    if (existing.status !== garage.status) {
      await notifyGarage({
        garageId,
        type: "GARAGE_STATUS_CHANGED",
        title: action === "approve" ? "Your garage has been approved" : "Your garage has been suspended",
        body:
          action === "approve"
            ? "You're now live on Quote My Garage and your booking widget can be switched on."
            : (reason ? `Reason: ${reason}. ` : "") + "The portal is now read-only. Contact support to resolve this.",
        link: action === "approve" ? garageLinks.website : garageLinks.dashboard,
      })
    }

    return NextResponse.json({ garage })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    console.error("Admin garage POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await requireAdmin()
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    const { garageId, badges } = badgeSchema.parse(await req.json())
    const garage = await prisma.garage.update({
      where: { id: garageId },
      data: { verificationBadges: JSON.stringify([...new Set(badges)]) },
    })
    await audit(session, { action: "GARAGE_BADGES", targetType: "GARAGE", targetId: garageId, detail: badges.join(", ") || "none" })
    return NextResponse.json({ garage })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    console.error("Admin garage badges PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
