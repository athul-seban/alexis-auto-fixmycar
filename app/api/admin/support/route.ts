import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { audit } from "@/lib/audit"

// Read-only support view: find a customer or garage and see what they see, without signing in as them.
// Searching lists matching accounts; opening one (`userId`) returns their recent activity and is written to the audit log.

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as { role?: string }).role !== "ADMIN") {
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
        OR: spellings.flatMap((t) => [{ email: { contains: t } }, { name: { contains: t } }, { phone: { contains: t } }, { garage: { name: { contains: t } } }]),
      },
      take: 100,
      select: { id: true, name: true, email: true, phone: true, role: true, suspendedAt: true, createdAt: true, garage: { select: { name: true } } },
    })
    const users = candidates
      .filter((u) => [u.email, u.name ?? "", u.phone ?? "", u.garage?.name ?? ""].some((f) => f.toLowerCase().includes(needle)))
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

  const garage = user.role === "GARAGE" ? await prisma.garage.findUnique({ where: { userId }, select: { id: true, name: true, status: true, isVerified: true, plan: true, subscriptionStatus: true, leadCredits: true, city: true } }) : null

  const bookingWhere = garage ? { garageId: garage.id } : { ownerId: userId }
  const [bookings, quotes, vehicles, reviews, jobRequests, messageCount] = await Promise.all([
    prisma.booking.findMany({
      where: bookingWhere,
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, reference: true, serviceType: true, status: true, scheduledAt: true, totalPrice: true, paymentStatus: true, source: true, customerName: true, garage: { select: { name: true } } },
    }),
    prisma.quote.findMany({
      where: garage ? { garageId: garage.id } : { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 10,
      select: { id: true, serviceType: true, status: true, price: true, createdAt: true },
    }),
    garage ? Promise.resolve([]) : prisma.vehicle.findMany({ where: { ownerId: userId }, take: 10, select: { id: true, registration: true, make: true, model: true, motDueDate: true } }),
    prisma.review.findMany({
      where: garage ? { garageId: garage.id } : { ownerId: userId },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: { id: true, rating: true, comment: true, createdAt: true, disputeStatus: true },
    }),
    garage ? Promise.resolve([]) : prisma.jobRequest.findMany({ where: { guestEmail: user.email }, orderBy: { createdAt: "desc" }, take: 5, select: { id: true, serviceType: true, status: true, city: true, createdAt: true } }),
    prisma.message.count({ where: garage ? { garageId: garage.id } : { senderId: userId } }),
  ])

  await audit(session as never, { action: "SUPPORT_VIEW", targetType: "USER", targetId: userId, detail: `Opened the support view for ${user.email}` })
  return NextResponse.json({ user, garage, bookings, quotes, vehicles, reviews, jobRequests, messageCount })
}
