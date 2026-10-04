import { manageUrl } from "@/lib/portal/links"
import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { sendMail } from "@/lib/mail"
import { widgetBookingCustomerEmail } from "@/lib/email-templates"
import { BookingError } from "@/lib/portal/booking-error"
import { createBooking, vehicleLabel } from "@/lib/portal/booking-service"
import { createDepositCheckout } from "@/lib/portal/payment-service"
import { clientIp, hashIp } from "@/lib/portal/ip-hash"
import { handleRouteError } from "@/lib/portal/route-errors"
import { formatLondonDateTime, londonDateString } from "@/lib/portal/tz"
import { isPlausibleVrm } from "@/lib/portal/vrm"
import { computeDaySlots, findWidgetService, loadWidgetGarage } from "@/lib/portal/widget-service"

// Abuse limits, enforced from the Booking table itself (works across serverless instances).
const HOUR_MS = 3600 * 1000
const MAX_PER_EMAIL_PER_HOUR = 3
const MAX_PER_IP_PER_HOUR = 3
const MAX_PER_GARAGE_PER_HOUR = 20

const schema = z.object({
  service: z.string().min(1).max(40),
  start: z.string().datetime(),
  name: z.string().trim().min(2, "Enter your name").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email address").max(200),
  phone: z.string().trim().min(6, "Enter a valid phone number").max(30),
  vrm: z.string().trim().min(2, "Enter your registration").max(12).refine(isPlausibleVrm, "Enter a valid registration"),
  make: z.string().trim().max(50).optional(),
  model: z.string().trim().max(50).optional(),
  notes: z.string().trim().max(500).optional(),
  // Honeypot: real people never see or fill this field; bots usually do.
  website: z.string().max(500).optional(),
})

const DEFAULT_SUCCESS = "Thanks — we'll see you then."

// Public (no auth): create a booking from a garage's website widget.
export async function POST(req: Request, props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params
  try {
    const raw = await req.json().catch(() => null)
    if (!raw || typeof raw !== "object") return NextResponse.json({ error: "Invalid request" }, { status: 400 })

    // A filled honeypot gets a fake success so the bot moves on, and nothing is created.
    if (typeof (raw as { website?: unknown }).website === "string" && (raw as { website: string }).website.trim() !== "") {
      return NextResponse.json({ reference: "QMG-000000", scheduledAt: (raw as { start?: string }).start ?? null, status: "PENDING", message: DEFAULT_SUCCESS }, { status: 201 })
    }

    const data = schema.parse(raw)
    const w = await loadWidgetGarage(slug)
    if (!w) return NextResponse.json({ error: "Booking isn't available for this garage" }, { status: 404 })
    const service = findWidgetService(w, data.service)
    if (!service) return NextResponse.json({ error: "That service isn't available to book online" }, { status: 400 })

    const start = new Date(data.start)
    const garageId = w.garage.id
    const status = w.settings.autoConfirm ? "CONFIRMED" : "PENDING"
    const message = w.settings.successMessage || DEFAULT_SUCCESS

    // Double-submits (a retry, a double click) return the booking that already exists.
    const existing = await prisma.booking.findFirst({
      where: { garageId, source: "WIDGET", customerEmail: data.email, scheduledAt: start, status: { not: "CANCELLED" } },
      select: { reference: true, scheduledAt: true, status: true },
    })
    if (existing) {
      return NextResponse.json({ reference: existing.reference, scheduledAt: existing.scheduledAt.toISOString(), status: existing.status, message, duplicate: true })
    }

    const ip = clientIp(req.headers)
    const ipHash = ip === "unknown" ? null : hashIp(ip) // no proxy header (local dev): can't limit per-IP
    const since = new Date(Date.now() - HOUR_MS)
    const [byEmail, byIp, byGarage] = await Promise.all([
      prisma.booking.count({ where: { source: "WIDGET", customerEmail: data.email, createdAt: { gte: since } } }),
      ipHash ? prisma.booking.count({ where: { source: "WIDGET", ipHash, createdAt: { gte: since } } }) : Promise.resolve(0),
      prisma.booking.count({ where: { garageId, source: "WIDGET", createdAt: { gte: since } } }),
    ])
    if (byEmail >= MAX_PER_EMAIL_PER_HOUR || byIp >= MAX_PER_IP_PER_HOUR || byGarage >= MAX_PER_GARAGE_PER_HOUR) {
      return NextResponse.json(
        { error: "Too many booking requests — please try again later, or call the garage.", code: "rate_limited" },
        { status: 429, headers: { "Retry-After": "3600" } }
      )
    }

    // The slot must still be on offer (not taken, not blocked, inside hours and the booking window).
    const date = londonDateString(start)
    const slots = await computeDaySlots(w, service, date)
    if (!slots.some((s) => s.start.getTime() === start.getTime())) {
      return NextResponse.json(
        {
          error: "Sorry, that time has just been taken — please choose another.",
          code: "slot_taken",
          slots: slots.map((s) => ({ start: s.start.toISOString(), label: s.label })),
        },
        { status: 409 }
      )
    }

    // checkAvailability re-checks the slot inside the creating transaction, under the garage lock,
    // so two people submitting the last free slot at once can't both get it.
    let booking
    try {
      booking = await createBooking({
      checkAvailability: true,
      garageId,
      source: "WIDGET",
      serviceType: service.serviceType,
      scheduledAt: start,
      durationMins: service.durationMins,
      totalPrice: service.priceFrom ?? service.priceTo ?? 0,
      status,
      description: data.notes || null,
      customerName: data.name,
      customerEmail: data.email,
      customerPhone: data.phone,
      vrm: data.vrm,
      vehicleMake: data.make || null,
      vehicleModel: data.model || null,
      ipHash,
      })
    } catch (err) {
      if (err instanceof BookingError && err.code === "OVERLAP") {
        const fresh = await computeDaySlots(w, service, date)
        return NextResponse.json(
          { error: "Sorry, that time has just been taken — please choose another.", code: "slot_taken", slots: fresh.map((s) => ({ start: s.start.toISOString(), label: s.label })) },
          { status: 409 }
        )
      }
      throw err
    }

    await sendMail({
      to: data.email,
      ...widgetBookingCustomerEmail({
        garage: w.garage,
        customerName: data.name,
        serviceType: service.serviceType,
        whenLabel: formatLondonDateTime(start),
        vehicle: vehicleLabel(booking),
        reference: booking.reference,
        confirmed: status === "CONFIRMED",
        extraMessage: w.settings.successMessage || undefined,
        manageHref: manageUrl(booking.manageToken),
      }),
    }).catch((err) => console.error("[widget] customer email failed:", err))

    // Deposit: when the garage takes online payments, send the customer to Stripe. A failure here must not lose the
    // booking, so it falls back to booking without a deposit (the garage still sees it).
    let checkoutUrl: string | null = null
    try {
      checkoutUrl = (await createDepositCheckout(booking.id))?.url ?? null
    } catch (err) {
      console.error("[widget] deposit checkout failed:", err)
    }

    return NextResponse.json({ reference: booking.reference, scheduledAt: booking.scheduledAt.toISOString(), status: booking.status, message, checkoutUrl }, { status: 201 })
  } catch (err) {
    if (err instanceof BookingError || err instanceof z.ZodError) return handleRouteError(err, "Widget booking POST")
    console.error("Widget booking POST error:", err)
    return NextResponse.json({ error: "Something went wrong — please try again." }, { status: 500 })
  }
}
