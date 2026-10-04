import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { parsePortalSettings } from "@/lib/portal/portal-settings"

const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS
/** Same thresholds the public widget enforces (see app/api/widget/[slug]/bookings). */
const PER_VISITOR_LIMIT = 3

/**
 * Widget oversight: which garages run the booking widget, how much it brings in, and visitors (hashed IP / email)
 * who are making repeated bookings — the pattern the widget's rate limits exist to stop.
 */
export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const now = Date.now()
  const [garages, bookings] = await Promise.all([
    prisma.garage.findMany({ where: { status: "APPROVED" }, select: { id: true, name: true, slug: true, portalSettings: true } }),
    prisma.booking.findMany({
      where: { source: "WIDGET", createdAt: { gte: new Date(now - 7 * DAY_MS) } },
      select: { garageId: true, ipHash: true, customerEmail: true, status: true, createdAt: true },
    }),
  ])

  const enabled = garages.filter((g) => parsePortalSettings(g.portalSettings).widget.enabled)
  const names = new Map(garages.map((g) => [g.id, g.name]))

  const rows = enabled.map((g) => {
    const mine = bookings.filter((b) => b.garageId === g.id)
    return {
      id: g.id,
      name: g.name,
      slug: g.slug,
      bookings7d: mine.length,
      bookings24h: mine.filter((b) => now - b.createdAt.getTime() < DAY_MS).length,
      lastHour: mine.filter((b) => now - b.createdAt.getTime() < HOUR_MS).length,
      cancelled7d: mine.filter((b) => b.status === "CANCELLED").length,
      lastBookingAt: mine.length ? new Date(Math.max(...mine.map((b) => b.createdAt.getTime()))) : null,
    }
  })

  // Repeat visitors: the same IP hash or email at the same garage ≥ the per-hour limit within 24h.
  const groups = new Map<string, { kind: "ip" | "email"; garageId: string; count: number; lastAt: Date }>()
  for (const b of bookings) {
    if (now - b.createdAt.getTime() >= DAY_MS) continue
    for (const [kind, value] of [["ip", b.ipHash], ["email", b.customerEmail?.toLowerCase()]] as const) {
      if (!value) continue
      const key = `${kind}:${b.garageId}:${value}`
      const g = groups.get(key)
      if (g) {
        g.count += 1
        if (b.createdAt > g.lastAt) g.lastAt = b.createdAt
      } else groups.set(key, { kind, garageId: b.garageId, count: 1, lastAt: b.createdAt })
    }
  }
  const flags = [...groups.values()]
    .filter((g) => g.count >= PER_VISITOR_LIMIT)
    .sort((a, b) => b.count - a.count)
    .map((g) => ({ kind: g.kind, garage: names.get(g.garageId) ?? "Unknown", count: g.count, lastAt: g.lastAt }))

  return NextResponse.json({
    garages: rows.sort((a, b) => b.bookings7d - a.bookings7d),
    flags,
    totals: {
      enabledGarages: enabled.length,
      bookings7d: bookings.length,
      bookings24h: rows.reduce((n, r) => n + r.bookings24h, 0),
    },
  })
}
