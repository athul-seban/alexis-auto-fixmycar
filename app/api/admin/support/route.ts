import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { audit } from "@/lib/audit"
import { isAdmin } from "@/lib/roles"
import { getBilling } from "@/lib/org/billing"
import { ALL_LOCATIONS } from "@/lib/org/access"

// Read-only support view: find a customer or garage and see what they see, without signing in as them.
// Searching lists matching accounts; opening one (`userId`) returns their recent activity and is written to the audit log.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || !isAdmin((session.user as { role?: string }).role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const sp = new URL(req.url).searchParams
  const userId = sp.get("userId")

  try {
    if (userId) return await detail(session, userId)

    const q = sp.get("q")?.trim() ?? ""
    if (q.length < 3) return NextResponse.json({ users: [] })
    // SQLite and Postgres disagree on case-insensitive `contains`, so search the lower-cased forms in memory over a bounded set.
    const needle = q.toLowerCase()
    // Postgres `contains` is case-sensitive and SQLite's isn't, so ask the database for the likely spellings and let
    // the in-memory filter below decide.
    const spellings = [...new Set([q, needle, q.toUpperCase(), needle.replace(/(^|\s)\S/g, (c) => c.toUpperCase())])]
    const candidates = await prisma.user.findMany({
      where: {
        OR: spellings.flatMap((t) => [
          { email: { contains: t } },
          { name: { contains: t } },
          { phone: { contains: t } },
          { garage: { name: { contains: t } } },
          // Staff have no garage of their own: they are found through the business they belong to.
          { memberships: { some: { organisation: { name: { contains: t } } } } },
        ]),
      },
      take: 100,
      select: {
        id: true, name: true, email: true, phone: true, role: true, suspendedAt: true, createdAt: true,
        garage: { select: { name: true } },
        memberships: { take: 1, orderBy: { createdAt: "asc" }, select: { organisation: { select: { name: true } } } },
      },
    })
    const users = candidates
      .map(({ memberships, ...u }) => ({ ...u, business: memberships[0]?.organisation.name ?? null }))
      .filter((u) => [u.email, u.name ?? "", u.phone ?? "", u.garage?.name ?? "", u.business ?? ""].some((f) => f.toLowerCase().includes(needle)))
      .slice(0, 10)
    return NextResponse.json({ users })
  } catch (err) {
    console.error("Admin support GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

async function detail(session: Awaited<ReturnType<typeof getServerSession>>, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, phone: true, role: true, suspendedAt: true, createdAt: true, lockedUntil: true, failedLoginAttempts: true, smsOptIn: true },
  })
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 })

  // A garage-side person is either the legacy login of one garage, or a member of a business (an owner or staff) who
  // works at some of its locations. Their activity is the activity of the locations they can open.
  const memberships =
    user.role === "GARAGE"
      ? await prisma.membership.findMany({
          where: { userId },
          orderBy: { createdAt: "asc" },
          take: 1,
          select: { status: true, organisation: { select: { id: true, name: true, suspendedAt: true } }, assignments: { select: { scopeKey: true, role: { select: { name: true } } } } },
        })
      : []
  const membership = memberships[0] ?? null

  let business: { name: string; status: string; suspended: boolean; locationCount: number; access: { role: string; where: string }[] } | null = null
  let scopeIds: string[] = []
  if (membership) {
    const orgLocations = await prisma.garage.findMany({ where: { organisationId: membership.organisation.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, name: true } })
    const names = new Map(orgLocations.map((l) => [l.id, l.name]))
    const everywhere = membership.assignments.some((a) => a.scopeKey === ALL_LOCATIONS)
    scopeIds = everywhere ? orgLocations.map((l) => l.id) : [...new Set(membership.assignments.map((a) => a.scopeKey))].filter((id) => names.has(id))
    business = {
      name: membership.organisation.name,
      status: membership.status,
      suspended: membership.organisation.suspendedAt !== null,
      locationCount: orgLocations.length,
      access: membership.assignments.map((a) => ({ role: a.role.name, where: a.scopeKey === ALL_LOCATIONS ? "All locations" : (names.get(a.scopeKey) ?? "A removed location") })),
    }
  }

  const own = user.role === "GARAGE" ? await prisma.garage.findUnique({ where: { userId }, select: { id: true, name: true, status: true, isVerified: true, city: true } }) : null
  const location = own ?? (scopeIds[0] ? await prisma.garage.findUnique({ where: { id: scopeIds[0] }, select: { id: true, name: true, status: true, isVerified: true, city: true } }) : null)
  // The plan and the credit balance belong to the business, so show the business's, not a location's copy.
  const billing = location ? await getBilling(location.id) : null
  const garage = location && billing ? { ...location, plan: billing.plan, subscriptionStatus: billing.subscriptionStatus, leadCredits: billing.leadCredits } : null
  const garageIds = scopeIds.length > 0 ? scopeIds : location ? [location.id] : null

  const [bookings, quotes, vehicles, reviews, jobRequests, messageCount] = await Promise.all([
    prisma.booking.findMany({
      where: garageIds ? { garageId: { in: garageIds } } : { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, reference: true, serviceType: true, status: true, scheduledAt: true, totalPrice: true, paymentStatus: true, source: true, customerName: true, garage: { select: { name: true } } },
    }),
    prisma.quote.findMany({
      where: garageIds ? { garageId: { in: garageIds } } : { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, serviceType: true, status: true, price: true, createdAt: true },
    }),
    garageIds ? Promise.resolve([]) : prisma.vehicle.findMany({ where: { ownerId: userId }, take: 10, select: { id: true, registration: true, make: true, model: true, motDueDate: true } }),
    prisma.review.findMany({
      where: garageIds ? { garageId: { in: garageIds } } : { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, rating: true, comment: true, createdAt: true, disputeStatus: true },
    }),
    garageIds ? Promise.resolve([]) : prisma.jobRequest.findMany({ where: { guestEmail: user.email }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, serviceType: true, status: true, city: true, createdAt: true } }),
    prisma.message.count({ where: garageIds ? { garageId: { in: garageIds } } : { senderId: userId } }),
  ])

  await audit(session as never, { action: "SUPPORT_VIEW", targetType: "USER", targetId: userId, detail: `Opened the support view for ${user.email}` })
  return NextResponse.json({ user, garage, business, bookings, quotes, vehicles, reviews, jobRequests, messageCount })
}
