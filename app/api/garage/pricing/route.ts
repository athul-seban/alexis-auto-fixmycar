import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { SERVICE_TYPES } from "@/lib/constants"
import { parseServiceList } from "@/lib/garage-mapper"
import { BookingError } from "@/lib/portal/booking-error"
import { DEFAULT_SERVICE_DURATION, pricingSchema } from "@/lib/portal/service-defaults"
import { getServiceLabel } from "@/lib/utils"

async function loadPricing(garageId: string, servicesJson: string) {
  const offered = new Set<string>(parseServiceList(servicesJson))
  const rows = await prisma.servicePrice.findMany({ where: { garageId } })
  const byService = new Map(rows.map((r) => [r.serviceType, r]))
  return SERVICE_TYPES.map((serviceType) => {
    const r = byService.get(serviceType)
    return {
      serviceType,
      label: getServiceLabel(serviceType),
      offered: offered.has(serviceType),
      priceFrom: r?.priceFrom ?? null,
      priceTo: r?.priceTo ?? null,
      durationMins: r?.durationMins ?? DEFAULT_SERVICE_DURATION[serviceType],
      notes: r?.notes ?? null,
      isActive: r?.isActive ?? true,
      configured: !!r,
    }
  })
}

export const GET = withGarage("Garage pricing GET", async (_req, { garage }) => {
  return NextResponse.json({ services: await loadPricing(garage.id, garage.services) })
})

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
            durationMins: p.durationMins, notes: p.notes || null, isActive: p.isActive,
          },
          update: { priceFrom: p.priceFrom ?? null, priceTo: p.priceTo ?? null, durationMins: p.durationMins, notes: p.notes || null, isActive: p.isActive },
        })
      )
    )
    return NextResponse.json({ services: await loadPricing(garage.id, garage.services) })
  },
  { write: true }
)
