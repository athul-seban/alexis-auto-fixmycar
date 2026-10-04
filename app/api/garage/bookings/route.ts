import { manageUrl } from "@/lib/portal/links"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { SERVICE_TYPES } from "@/lib/constants"
import { parseOpeningHours } from "@/lib/garage-mapper"
import { sendMail } from "@/lib/mail"
import { bookingConfirmedGuestNotification, garageBookingCustomerEmail } from "@/lib/email-templates"
import { BookingError } from "@/lib/portal/booking-error"
import { acceptJobResponse, createBooking, findOverlaps, notifyBookingOwner, summariseConflict, vehicleLabel } from "@/lib/portal/booking-service"
import { isWithinOpeningHours } from "@/lib/portal/availability"
import { displayStatus } from "@/lib/portal/booking-status"
import { BOOKING_ROW_SELECT, toBookingRow } from "@/lib/portal/booking-rows"
import { TABS, buildBookingsWhere, buildOrderBy, parseBookingsQuery, tabWhere } from "@/lib/portal/bookings-query"
import { CSV_MAX_ROWS, toCsv } from "@/lib/portal/csv"
import { sourceLabel } from "@/lib/portal/labels"
import { normalisePhone } from "@/lib/portal/phone"
import { londonDateString, londonTimeString, formatLondonDateTime } from "@/lib/portal/tz"
import { getServiceLabel } from "@/lib/utils"

export const GET = withGarage("Garage bookings GET", async (req, { garage }) => {
  const parsed = parseBookingsQuery(new URL(req.url).searchParams)
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
  const q = parsed.value
  const now = new Date()

  let where = buildBookingsWhere(garage.id, q, now)
  if (q.outcome === "pending") {
    // "Awaiting outcome" depends on each booking's duration, so resolve it here and filter by id.
    const candidates = await prisma.booking.findMany({
      where: { garageId: garage.id, status: { in: ["PENDING", "CONFIRMED"] }, scheduledAt: { lt: now } },
      select: { id: true, status: true, scheduledAt: true, durationMins: true },
    })
    const ids = candidates.filter((c) => displayStatus(c, now) === "AWAITING_OUTCOME").map((c) => c.id)
    where = { AND: [where, { id: { in: ids } }] }
  }
  const orderBy = buildOrderBy(q)

  if (q.format === "csv") {
    const rows = await prisma.booking.findMany({ where, orderBy, take: CSV_MAX_ROWS, select: BOOKING_ROW_SELECT })
    const csv = toCsv(
      [
        "Reference", "Customer", "Phone", "Email", "VRM", "Make", "Model", "Year", "Source", "Technician",
        "Service", "Status", "Booked for", "Created", "Price (GBP)", "Final invoice (GBP)", "Contacted",
      ],
      rows.map((r) => [
        r.reference, r.customerName, normalisePhone(r.customerPhone), r.customerEmail, r.vrm, r.vehicleMake,
        r.vehicleModel, r.vehicleYear, sourceLabel(r.source), r.technician?.name, getServiceLabel(r.serviceType),
        r.status, formatLondonDateTime(r.scheduledAt), formatLondonDateTime(r.createdAt), r.totalPrice,
        r.finalInvoiceValue, r.contactedAt ? "Yes" : "No",
      ]),
      { bom: true }
    )
    return new Response(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="bookings-${londonDateString(now)}.csv"`,
        "Cache-Control": "no-store",
      },
    })
  }

  const [rows, total, tabCounts, quotesAwaiting, jobsAwaiting] = await Promise.all([
    prisma.booking.findMany({
      where,
      orderBy,
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      select: BOOKING_ROW_SELECT,
    }),
    prisma.booking.count({ where }),
    Promise.all(TABS.map((t) => prisma.booking.count({ where: { AND: [{ garageId: garage.id }, tabWhere(t, now)] } }))),
    prisma.quote.count({ where: { garageId: garage.id, status: "SENT" } }),
    prisma.jobResponse.count({ where: { garageId: garage.id, status: "SENT" } }),
  ])

  const counts: Record<string, number> = Object.fromEntries(TABS.map((t, i) => [t, tabCounts[i]]))
  counts.estimates = quotesAwaiting + jobsAwaiting

  return NextResponse.json({
    bookings: rows.map((r) => toBookingRow(r, now)),
    total,
    page: q.page,
    pageSize: q.pageSize,
    totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    counts,
  })
})

const createSchema = z
  .object({
    customer: z
      .object({
        name: z.string().trim().min(1, "Customer name is required").max(100),
        email: z.union([z.string().trim().email().max(200), z.literal("")]).optional(),
        phone: z.string().trim().max(30).optional(),
      })
      .optional(),
    vehicle: z
      .object({
        vrm: z.string().trim().min(2, "Registration is required").max(12),
        make: z.string().trim().max(50).optional(),
        model: z.string().trim().max(50).optional(),
        year: z.number().int().min(1900).max(new Date().getFullYear() + 1).optional(),
      })
      .optional(),
    serviceType: z.enum(SERVICE_TYPES).optional(),
    scheduledAt: z.string().datetime(),
    durationMins: z.number().int().min(15).max(960).optional(),
    technicianId: z.string().max(40).optional(),
    totalPrice: z.number().min(0).max(1_000_000).optional(),
    description: z.string().trim().max(1000).optional(),
    notes: z.string().trim().max(1000).optional(),
    status: z.enum(["PENDING", "CONFIRMED"]).default("CONFIRMED"),
    allowOverlap: z.boolean().default(false),
    notifyCustomer: z.boolean().default(true),
    fromQuoteId: z.string().max(40).optional(),
    fromJobResponseId: z.string().max(40).optional(),
  })
  .superRefine((d, ctx) => {
    const fromEstimate = d.fromQuoteId || d.fromJobResponseId
    if (d.fromQuoteId && d.fromJobResponseId) {
      ctx.addIssue({ code: "custom", message: "Choose either a quote or a job response, not both" })
    }
    if (!fromEstimate) {
      if (!d.customer) ctx.addIssue({ code: "custom", path: ["customer"], message: "Customer details are required" })
      if (!d.vehicle) ctx.addIssue({ code: "custom", path: ["vehicle"], message: "Vehicle registration is required" })
      if (!d.serviceType) ctx.addIssue({ code: "custom", path: ["serviceType"], message: "Service is required" })
      if (d.totalPrice === undefined) ctx.addIssue({ code: "custom", path: ["totalPrice"], message: "Price is required" })
    }
  })

export const POST = withGarage(
  "Garage bookings POST",
  async (req, { garage }) => {
    const data = createSchema.parse(await req.json())
    const scheduledAt = new Date(data.scheduledAt)

    if (data.technicianId) {
      const tech = await prisma.technician.findFirst({ where: { id: data.technicianId, garageId: garage.id } })
      if (!tech) throw new BookingError("INVALID_INPUT", "Technician not found")
    }

    // Warn (never block) when outside opening hours; block clashes unless the garage overrides.
    const dayStr = londonDateString(scheduledAt)
    const warnings: string[] = []
    if (!isWithinOpeningHours(parseOpeningHours(garage.openingHours), dayStr, londonTimeString(scheduledAt), data.durationMins ?? 60)) {
      warnings.push("OUTSIDE_OPENING_HOURS")
    }
    if (!data.allowOverlap) {
      const o = await findOverlaps({ garageId: garage.id, start: scheduledAt, durationMins: data.durationMins, technicianId: data.technicianId })
      if (!o.available) {
        throw new BookingError("OVERLAP", "That slot clashes with another booking or time off", {
          reason: o.reason,
          conflicts: o.conflicts.map(summariseConflict),
        })
      }
    }

    // ── From a priced quote (an account holder) ──
    if (data.fromQuoteId) {
      const quote = await prisma.quote.findFirst({ where: { id: data.fromQuoteId, garageId: garage.id } })
      if (!quote) throw new BookingError("NOT_FOUND", "Quote not found")
      if (quote.status !== "SENT" || quote.price === null) {
        throw new BookingError("CONFLICT", "Only a quote you've priced and sent can be booked")
      }
      const booking = await createBooking({
        garageId: garage.id,
        source: "QUOTE",
        ownerId: quote.ownerId,
        vehicleId: quote.vehicleId,
        quoteId: quote.id,
        serviceType: quote.serviceType,
        description: quote.description,
        notes: data.notes,
        scheduledAt,
        durationMins: data.durationMins,
        technicianId: data.technicianId,
        totalPrice: data.totalPrice ?? quote.price,
        status: data.status,
        enforceApproved: false,
        notify: false,
        checkAvailability: !data.allowOverlap,
      })
      if (data.notifyCustomer) {
        await notifyBookingOwner(booking, {
          type: "BOOKING_CREATED",
          title: "Your booking is scheduled",
          body: `${garage.name} booked your ${getServiceLabel(booking.serviceType)} for ${formatLondonDateTime(scheduledAt)}`,
        })
      }
      return NextResponse.json({ booking: toBookingRow(await loadRow(booking.id)), warnings }, { status: 201 })
    }

    // ── From a priced guest job response ──
    if (data.fromJobResponseId) {
      const response = await prisma.jobResponse.findFirst({ where: { id: data.fromJobResponseId, garageId: garage.id } })
      if (!response) throw new BookingError("NOT_FOUND", "Job response not found")
      if (response.status !== "SENT") throw new BookingError("CONFLICT", "That quote has already been accepted or declined")

      const accepted = await acceptJobResponse({ jobRequestId: response.jobRequestId, jobResponseId: response.id, scheduledAt })
      const booking = await prisma.booking.update({
        where: { id: accepted.booking.id },
        data: {
          status: data.status,
          durationMins: data.durationMins ?? null,
          technicianId: data.technicianId ?? null,
          notes: data.notes ?? null,
          ...(data.totalPrice !== undefined ? { totalPrice: data.totalPrice } : {}),
        },
      })
      if (data.notifyCustomer) {
        await sendMail({
          to: accepted.jobRequest.guestEmail,
          ...bookingConfirmedGuestNotification({ jobRequest: accepted.jobRequest, garage: accepted.jobResponse.garage, price: booking.totalPrice }),
        })
      }
      return NextResponse.json({ booking: toBookingRow(await loadRow(booking.id)), warnings }, { status: 201 })
    }

    // ── Walk-in / phone booking ──
    const booking = await createBooking({
      garageId: garage.id,
      source: "DIRECT",
      serviceType: data.serviceType!,
      description: data.description,
      notes: data.notes,
      scheduledAt,
      durationMins: data.durationMins,
      technicianId: data.technicianId,
      totalPrice: data.totalPrice!,
      status: data.status,
      checkAvailability: !data.allowOverlap,
      customerName: data.customer!.name,
      customerEmail: data.customer!.email || null,
      customerPhone: data.customer!.phone || null,
      vrm: data.vehicle!.vrm,
      vehicleMake: data.vehicle!.make || null,
      vehicleModel: data.vehicle!.model || null,
      vehicleYear: data.vehicle!.year ?? null,
    })

    if (data.notifyCustomer && booking.customerEmail) {
      await sendMail({
        to: booking.customerEmail,
        ...garageBookingCustomerEmail({
          garage,
          customerName: booking.customerName,
          serviceType: booking.serviceType,
          whenLabel: formatLondonDateTime(scheduledAt),
          reference: booking.reference,
          vehicle: vehicleLabel(booking),
          manageHref: manageUrl(booking.manageToken),
        }),
      })
    }
    return NextResponse.json({ booking: toBookingRow(await loadRow(booking.id)), warnings }, { status: 201 })
  },
  { write: true }
)

async function loadRow(id: string) {
  return prisma.booking.findUniqueOrThrow({ where: { id }, select: BOOKING_ROW_SELECT })
}
