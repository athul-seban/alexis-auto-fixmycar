import { prisma } from "@/lib/prisma"
import type { CustomerBookingRow } from "@/lib/portal/customers"

/** Every booking a garage has ever had, as the minimal rows the customer grouping needs. */
export async function loadCustomerRows(garageId: string): Promise<CustomerBookingRow[]> {
  return prisma.booking.findMany({
    where: { garageId },
    select: { id: true, status: true, scheduledAt: true, totalPrice: true, finalInvoiceValue: true, customerName: true, customerEmail: true, customerPhone: true, vrm: true, vehicleMake: true, vehicleModel: true },
    orderBy: { scheduledAt: "desc" },
    take: 20_000,
  })
}

/** The garage's merges as a fromKey -> toKey map, ready for buildCustomers(). */
export async function loadRedirects(garageId: string): Promise<Map<string, string>> {
  const rows = await prisma.customerMerge.findMany({ where: { garageId }, select: { fromKey: true, toKey: true } })
  return new Map(rows.map((r) => [r.fromKey, r.toKey]))
}
