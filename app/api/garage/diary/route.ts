import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { parseOpeningHours } from "@/lib/garage-mapper"
import { garageCapacity } from "@/lib/portal/availability"
import { BOOKING_ROW_SELECT, toBookingRow } from "@/lib/portal/booking-rows"
import { startOfWeek } from "@/lib/portal/diary-layout"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { addDays, diffDays, isValidDateString, londonDayRange, todayLondon } from "@/lib/portal/tz"
import { TECHNICIAN_SELECT } from "@/lib/portal/technician-schema"

const MAX_DIARY_DAYS = 42

export const GET = withGarage("Garage diary GET", async (req, { garage }) => {
  const sp = new URL(req.url).searchParams
  const now = new Date()
  const weekStart = startOfWeek(todayLondon(now))
  const from = sp.get("from") ?? weekStart
  const to = sp.get("to") ?? addDays(weekStart, 6)
  if (!isValidDateString(from) || !isValidDateString(to) || from > to) {
    return NextResponse.json({ error: "from and to must be valid YYYY-MM-DD dates, from <= to" }, { status: 400 })
  }
  if (diffDays(from, to) + 1 > MAX_DIARY_DAYS) {
    return NextResponse.json({ error: `The diary can show at most ${MAX_DIARY_DAYS} days at a time` }, { status: 400 })
  }
  const technicianId = sp.get("technicianId") || undefined
  const { gte, lt } = londonDayRange(from, to)

  const [bookingRows, blockRows, technicians] = await Promise.all([
    prisma.booking.findMany({
      where: {
        garageId: garage.id,
        status: { not: "CANCELLED" },
        // Overlap with the window (a booking that starts the evening before can run into it).
        scheduledAt: { gte: new Date(gte.getTime() - 24 * 3600 * 1000), lt },
        ...(technicianId ? { technicianId } : {}),
      },
      select: BOOKING_ROW_SELECT,
      orderBy: { scheduledAt: "asc" },
    }),
    prisma.diaryBlock.findMany({
      where: {
        garageId: garage.id,
        startAt: { lt },
        endAt: { gt: gte },
        // A technician view shows that person's time off plus whole-garage closures.
        ...(technicianId ? { OR: [{ technicianId }, { technicianId: null }] } : {}),
      },
      include: { technician: { select: { id: true, name: true, color: true } } },
      orderBy: { startAt: "asc" },
    }),
    prisma.technician.findMany({ where: { garageId: garage.id }, orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }], select: TECHNICIAN_SELECT }),
  ])

  // Drop earlier-starting bookings that ended before the window opens.
  const bookings = bookingRows
    .map((b) => toBookingRow(b, now))
    .filter((b) => new Date(b.scheduledAt).getTime() + (b.durationMins ?? 60) * 60000 > gte.getTime())

  const settings = parsePortalSettings(garage.portalSettings)
  return NextResponse.json({
    range: { from, to },
    bookings,
    blocks: blockRows.map((b) => ({
      id: b.id,
      startAt: b.startAt.toISOString(),
      endAt: b.endAt.toISOString(),
      allDay: b.allDay,
      reason: b.reason,
      technician: b.technician,
    })),
    openingHours: parseOpeningHours(garage.openingHours),
    technicians,
    capacity: garageCapacity(technicians.filter((t) => t.isActive).length, settings.bays),
  })
})
