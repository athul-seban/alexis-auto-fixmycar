import type { Garage } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { parseOpeningHours, parseServiceList } from "@/lib/garage-mapper"
import { computeSlots, type Slot } from "@/lib/portal/availability"
import { getBusyForRange } from "@/lib/portal/booking-service"
import { parsePortalSettings, type WidgetSettings } from "@/lib/portal/portal-settings"
import { DEFAULT_SERVICE_DURATION, priceLabel } from "@/lib/portal/service-defaults"
import { addDays, startOfLondonDay } from "@/lib/portal/tz"
import { SERVICE_TYPES } from "@/lib/constants"
import { getServiceLabel } from "@/lib/utils"

export interface WidgetService {
  serviceType: string
  label: string
  durationMins: number
  priceFrom: number | null
  priceTo: number | null
  priceLabel: string | null
  notes: string | null
}

export interface WidgetGarage {
  garage: Garage
  settings: WidgetSettings
  services: WidgetService[]
}

/**
 * The public face of a garage's booking widget, or null when it must not be reachable:
 * unknown slug, garage not APPROVED (pending/suspended), or the garage switched the widget off.
 */
export async function loadWidgetGarage(slug: string): Promise<WidgetGarage | null> {
  const garage = await prisma.garage.findUnique({ where: { slug } })
  if (!garage || garage.status !== "APPROVED") return null

  const portal = parsePortalSettings(garage.portalSettings)
  if (!portal.widget.enabled) return null

  const offered = new Set<string>(parseServiceList(garage.services))
  const priceRows = await prisma.servicePrice.findMany({ where: { garageId: garage.id } })
  const byService = new Map(priceRows.map((p) => [p.serviceType, p]))

  const services: WidgetService[] = SERVICE_TYPES.filter((s) => offered.has(s))
    .filter((s) => byService.get(s)?.isActive !== false) // a price row can switch a service off for the widget
    .map((s) => {
      const row = byService.get(s)
      return {
        serviceType: s,
        label: getServiceLabel(s),
        durationMins: row?.durationMins ?? DEFAULT_SERVICE_DURATION[s],
        priceFrom: row?.priceFrom ?? null,
        priceTo: row?.priceTo ?? null,
        priceLabel: priceLabel(row?.priceFrom ?? null, row?.priceTo ?? null),
        notes: row?.notes ?? null,
      }
    })

  return { garage, settings: portal.widget, services }
}

export function findWidgetService(w: WidgetGarage, serviceType: string): WidgetService | null {
  return w.services.find((s) => s.serviceType === serviceType) ?? null
}

/** Bookable start times for one London day for a given service. `excludeBookingId` frees a booking's own slot, so a customer moving it can pick nearby times. */
export async function computeDaySlots(
  w: WidgetGarage,
  service: WidgetService,
  date: string,
  now: Date = new Date(),
  excludeBookingId?: string
): Promise<Slot[]> {
  const dayStart = startOfLondonDay(date)
  const dayEnd = startOfLondonDay(addDays(date, 1))
  const busy = await getBusyForRange(w.garage.id, dayStart, dayEnd, excludeBookingId)
  return computeSlots({
    date,
    openingHours: parseOpeningHours(w.garage.openingHours),
    durationMins: service.durationMins,
    slotMins: w.settings.slotMins,
    leadHours: w.settings.leadHours,
    maxDaysAhead: w.settings.maxDaysAhead,
    capacity: busy.capacity,
    bookings: busy.bookings,
    blocks: busy.blocks,
    now,
  })
}
