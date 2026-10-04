import type { Booking } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { Slot } from "@/lib/portal/availability"
import { DEFAULT_SERVICE_DURATION } from "@/lib/portal/service-defaults"
import { computeDaySlots, findWidgetService, loadWidgetGarage, type WidgetService } from "@/lib/portal/widget-service"
import type { ServiceType } from "@/types"

export interface RescheduleContext {
  durationMins: number
  /** Start times the garage offers on a London day, with this booking's own slot counted as free. */
  slotsFor: (date: string) => Promise<Slot[]>
}

/**
 * What a customer needs to move their own booking: the garage's online slot rules (its booking-widget settings).
 * Null when the garage has no online booking (widget off, not approved), so rescheduling stays a phone call.
 */
export async function loadRescheduleContext(booking: Pick<Booking, "id" | "garageId" | "serviceType" | "durationMins">): Promise<RescheduleContext | null> {
  const garage = await prisma.garage.findUnique({ where: { id: booking.garageId }, select: { slug: true } })
  if (!garage) return null
  const w = await loadWidgetGarage(garage.slug)
  if (!w) return null

  const durationMins = booking.durationMins ?? findWidgetService(w, booking.serviceType)?.durationMins ?? DEFAULT_SERVICE_DURATION[booking.serviceType as ServiceType] ?? 60
  // The booking keeps its own duration even if the garage has since changed the service's default.
  const service: WidgetService = {
    ...(findWidgetService(w, booking.serviceType) ?? { serviceType: booking.serviceType, label: booking.serviceType, priceFrom: null, priceTo: null, priceLabel: null, notes: null }),
    durationMins,
  }
  return { durationMins, slotsFor: (date) => computeDaySlots(w, service, date, new Date(), booking.id) }
}
