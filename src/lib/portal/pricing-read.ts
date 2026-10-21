import { prisma } from "@/lib/prisma"
import { SERVICE_TYPES } from "@/lib/constants"
import { parseServiceList } from "@/lib/garage-mapper"
import { DEFAULT_SERVICE_DURATION } from "@/lib/portal/service-defaults"
import { getServiceLabel } from "@/lib/utils"

/**
 * Every service type with the garage's configured price, or the defaults when none is set. Shared by the garage's own
 * Pricing page (which can edit) and the admin's read-only view of a garage's prices.
 */
export async function loadPricing(garageId: string, servicesJson: string) {
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
      fixedPrice: r?.fixedPrice ?? null,
      autoQuote: r?.autoQuote ?? false,
      durationMins: r?.durationMins ?? DEFAULT_SERVICE_DURATION[serviceType],
      notes: r?.notes ?? null,
      isActive: r?.isActive ?? true,
      configured: !!r,
    }
  })
}
