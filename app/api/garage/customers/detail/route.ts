import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { buildCustomers, customerKey } from "@/lib/portal/customers"
import { loadCustomerRows } from "@/lib/portal/customers-db"

const KEY_PATTERN = /^[epvu]:[^\s]{1,190}$/

/** One customer: their summary, recent bookings and the garage's private note. The key comes from the list. */
export const GET = withGarage("Garage customer detail GET", async (req, { garage }) => {
  const key = new URL(req.url).searchParams.get("key") ?? ""
  if (!KEY_PATTERN.test(key)) throw new BookingError("INVALID_INPUT", "Invalid customer")

  const rows = (await loadCustomerRows(garage.id)).filter((r) => customerKey(r) === key)
  const customer = buildCustomers(rows)[0]
  if (!customer) throw new BookingError("NOT_FOUND", "Customer not found")

  const [note, recent] = await Promise.all([
    prisma.customerNote.findUnique({ where: { garageId_customerKey: { garageId: garage.id, customerKey: key } }, select: { body: true, updatedAt: true } }),
    prisma.booking.findMany({
      where: { id: { in: rows.map((r) => r.id).slice(0, 50) } },
      orderBy: { scheduledAt: "desc" },
      select: { id: true, reference: true, serviceType: true, status: true, scheduledAt: true, totalPrice: true, finalInvoiceValue: true, vrm: true },
    }),
  ])

  return NextResponse.json({
    customer: { ...customer, lastVisit: customer.lastVisit?.toISOString() ?? null, nextBooking: customer.nextBooking?.toISOString() ?? null },
    note: note ? { body: note.body, updatedAt: note.updatedAt.toISOString() } : null,
    bookings: recent.map((b) => ({ ...b, scheduledAt: b.scheduledAt.toISOString() })),
  })
})
