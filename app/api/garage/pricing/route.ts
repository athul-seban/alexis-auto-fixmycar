import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { parseServiceList } from "@/lib/garage-mapper"
import { BookingError } from "@/lib/portal/booking-error"
import { loadPricing } from "@/lib/portal/pricing-read"
import { pricingSchema } from "@/lib/portal/service-defaults"
import { getServiceLabel } from "@/lib/utils"

export const GET = withGarage("Garage pricing GET", async (_req, { garage }) => {
  return NextResponse.json({ services: await loadPricing(garage.id, garage.services) })
}, { permission: "pricing.view" })

export const PUT = withGarage(
  "Garage pricing PUT",
  async (req, { garage }) => {
    const { prices } = pricingSchema.parse(await req.json())
    const offered = new Set<string>(parseServiceList(garage.services))
    const unknown = prices.find((p) => !offered.has(p.serviceType))
    if (unknown) {
      throw new BookingError("INVALID_INPUT", `${getServiceLabel(unknown.serviceType)} isn't one of your services — add it on your Profile first`)
    }

    await prisma.$transaction(
      prices.map((p) =>
        prisma.servicePrice.upsert({
          where: { garageId_serviceType: { garageId: garage.id, serviceType: p.serviceType } },
          create: {
            garageId: garage.id, serviceType: p.serviceType, priceFrom: p.priceFrom ?? null, priceTo: p.priceTo ?? null,
            fixedPrice: p.fixedPrice ?? null, autoQuote: p.autoQuote,
            durationMins: p.durationMins, notes: p.notes || null, isActive: p.isActive,
          },
          update: { priceFrom: p.priceFrom ?? null, priceTo: p.priceTo ?? null, fixedPrice: p.fixedPrice ?? null, autoQuote: p.autoQuote, durationMins: p.durationMins, notes: p.notes || null, isActive: p.isActive },
        })
      )
    )
    return NextResponse.json({ services: await loadPricing(garage.id, garage.services) })
  },
  { permission: "pricing.edit", write: true }
)
