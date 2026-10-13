import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { notifyGarage, notifyUser } from "@/lib/notifications"
import { absoluteUrl, garageLinks } from "@/lib/portal/links"
import { emailGarage } from "@/lib/portal/garage-email"
import { sendMail } from "@/lib/mail"
import { garageQuoteRequestEmail, quoteReceivedEmail } from "@/lib/email-templates"
import { parseServiceList } from "@/lib/garage-mapper"
import { parsePortalSettings } from "@/lib/portal/portal-settings"
import { parseWorks, resolveQuoteLines, respondDeadline } from "@/lib/portal/quote-pricing"
import { autoQuoteQuote, expireDueRequests } from "@/lib/portal/quote-request-service"
import { getServiceLabel } from "@/lib/utils"
import { z } from "zod"
import { SERVICE_TYPES } from "@/lib/constants"

const createSchema = z.object({
  vehicleId: z.string(),
  garageId: z.string(),
  // One or more works. serviceType is still accepted for a single work (older clients).
  serviceType: z.enum(SERVICE_TYPES).optional(),
  services: z.array(z.enum(SERVICE_TYPES)).min(1).max(SERVICE_TYPES.length).optional(),
  description: z.string().min(10),
})

const respondSchema = z.object({
  quoteId: z.string(),
  // A request with several works needs an amount for each one in items; a single work may just send price.
  price: z.number().positive().optional(),
  items: z.array(z.object({ serviceType: z.string(), price: z.number().positive() })).max(20).optional(),
  laborCost: z.number().positive().optional(),
  partsCost: z.number().positive().optional(),
  notes: z.string().optional(),
  validDays: z.number().min(1).max(30).default(7),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  const { searchParams } = new URL(req.url)
  const role = user.role

  try {
    if (role === "OWNER") {
      await expireDueRequests({ ownerId: user.id })
      const quotes = await prisma.quote.findMany({
        where: { ownerId: user.id },
        include: {
          vehicle: true,
          garage: { select: { id: true, name: true, slug: true, city: true, averageRating: true, isVerified: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json({ quotes })
    }

    if (role === "GARAGE") {
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

      const quotes = await prisma.quote.findMany({
        where: { garageId: garage.id },
        // No owner name/phone and no registration until the customer accepts (src/lib/portal/redact.ts).
        include: {
          vehicle: { select: { id: true, make: true, model: true, year: true, fuel: true } },
        },
        orderBy: { createdAt: "desc" },
      })
      return NextResponse.json({ quotes: quotes.map((q) => ({ ...q, ownerId: undefined })) })
    }

    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } catch (err) {
    console.error("Quotes GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  const body = await req.json()

  try {
    if (user.role === "OWNER" && body.action === "request") {
      const { services: requestedWorks, serviceType: singleWork, ...rest } = createSchema.parse(body)
      const works = [...new Set(requestedWorks ?? (singleWork ? [singleWork] : []))]
      if (works.length === 0) return NextResponse.json({ error: "Choose at least one service" }, { status: 400 })
      const data = { ...rest, serviceType: works[0] }
      // The vehicle must be the caller's own (the garage gets to see its registration), and the garage must be live.
      const [vehicle, garage] = await Promise.all([
        prisma.vehicle.findFirst({ where: { id: data.vehicleId, ownerId: user.id }, select: { id: true } }),
        prisma.garage.findFirst({ where: { id: data.garageId, status: "APPROVED" }, select: { id: true, services: true, portalSettings: true } }),
      ])
      if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })
      if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })
      const offered = parseServiceList(garage.services) as string[]
      if (!works.every((w) => offered.includes(w))) {
        return NextResponse.json({ error: "That garage doesn't offer every service you chose" }, { status: 400 })
      }
      const quote = await prisma.quote.create({
        data: {
          ownerId: user.id,
          vehicleId: data.vehicleId,
          garageId: data.garageId,
          serviceType: data.serviceType as any,
          description: data.description,
          status: "PENDING",
          services: JSON.stringify(works),
          // The garage has the time it set in Settings to quote, after which the request closes or is estimated.
          respondBy: respondDeadline(new Date(), parsePortalSettings(garage.portalSettings).quotes.responseHours),
        },
        include: { garage: { select: { name: true } }, vehicle: true },
      })
      // Every work priced automatically? Then the quote goes out now and the garage isn't asked to quote.
      const instantlyQuoted = await autoQuoteQuote(quote.id).catch(() => false)
      if (instantlyQuoted) {
        const fresh = await prisma.quote.findUnique({ where: { id: quote.id } })
        return NextResponse.json({ quote: fresh ?? quote, instantlyQuoted: true }, { status: 201 })
      }
      await notifyGarage({
        garageId: data.garageId,
        type: "QUOTE_REQUESTED",
        title: "New quote request",
        body: `${works.map(getServiceLabel).join(", ")} request for ${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}`,
        link: garageLinks.enquiry(quote.id),
      })
      // The garage learns who the customer is only once they accept (see src/lib/portal/redact.ts).
      await emailGarage(data.garageId, "emailEnquiry", (g, t) =>
        garageQuoteRequestEmail({
          t,
          garageName: g.name,
          customerName: null,
          serviceType: works.join(","),
          vehicle: `${quote.vehicle.year} ${quote.vehicle.make} ${quote.vehicle.model}`,
          description: data.description,
          ctaHref: absoluteUrl(garageLinks.enquiry(quote.id)),
        })
      )
      return NextResponse.json({ quote }, { status: 201 })
    }

    if (user.role === "GARAGE" && body.action === "respond") {
      const data = respondSchema.parse(body)
      const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
      if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

      // A garage that missed its deadline can no longer quote by hand (the request has closed or become an estimate).
      await expireDueRequests({ garageId: garage.id })
      const quote = await prisma.quote.findFirst({
        where: { id: data.quoteId, garageId: garage.id },
      })
      if (!quote) return NextResponse.json({ error: "Quote not found" }, { status: 404 })
      // A request can be quoted (or re-quoted while still open) — not once it's accepted, declined or expired.
      if (quote.status !== "PENDING" && quote.status !== "SENT") {
        return NextResponse.json({ error: `This request is ${quote.status.toLowerCase()} and can no longer be quoted` }, { status: 409 })
      }

      const lines = resolveQuoteLines(parseWorks(quote.services, quote.serviceType), data)
      if ('error' in lines) return NextResponse.json({ error: lines.error }, { status: 400 })
      const price = lines.total

      const validUntil = new Date()
      validUntil.setDate(validUntil.getDate() + data.validDays)

      const updated = await prisma.quote.update({
        where: { id: data.quoteId },
        data: {
          price,
          source: "MANUAL",
          lineItems: JSON.stringify(lines.items),
          laborCost: data.laborCost,
          partsCost: data.partsCost,
          notes: data.notes,
          validUntil,
          status: "SENT",
        },
      })
      await notifyUser({
        userId: quote.ownerId,
        type: "QUOTE_RESPONDED",
        title: `${garage.name} sent you a quote`,
        body: `Quoted £${price.toFixed(2)} for your ${parseWorks(quote.services, quote.serviceType).map(getServiceLabel).join(", ")} request`,
        link: `/dashboard?quote=${quote.id}`,
      })
      const quoteOwner = await prisma.user.findUnique({ where: { id: quote.ownerId }, select: { name: true, email: true, emailNotifications: true } })
      if (quoteOwner?.emailNotifications) {
        await sendMail({
          to: quoteOwner.email,
          ...quoteReceivedEmail({
            customerName: quoteOwner.name,
            garageName: garage.name,
            serviceType: quote.serviceType,
            price,
            validUntil,
            notes: data.notes ?? null,
            ctaHref: absoluteUrl("/dashboard/quotes"),
          }),
        })
      }
      return NextResponse.json({ quote: updated })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Quotes POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
