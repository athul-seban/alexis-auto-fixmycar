import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { TECHNICIAN_SELECT as SELECT, technicianSchema } from "@/lib/portal/technician-schema"

type Params = { id: string }

export const PATCH = withGarage<Params>(
  "Garage technician PATCH",
  async (req, { garage }, { id }) => {
    const data = technicianSchema.partial().parse(await req.json())
    const existing = await prisma.technician.findFirst({ where: { id, garageId: garage.id } })
    if (!existing) throw new BookingError("NOT_FOUND", "Technician not found")

    const technician = await prisma.technician.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.email !== undefined ? { email: data.email || null } : {}),
        ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
        ...(data.color !== undefined ? { color: data.color } : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
      },
      select: SELECT,
    })
    return NextResponse.json({ technician })
  },
  { write: true }
)

// Deleting a technician who has bookings would orphan history in the diary, so they're
// deactivated instead (kept for past bookings, hidden from scheduling).
export const DELETE = withGarage<Params>(
  "Garage technician DELETE",
  async (_req, { garage }, { id }) => {
    const existing = await prisma.technician.findFirst({ where: { id, garageId: garage.id } })
    if (!existing) throw new BookingError("NOT_FOUND", "Technician not found")

    const bookings = await prisma.booking.count({ where: { technicianId: id } })
    if (bookings > 0) {
      await prisma.technician.update({ where: { id }, data: { isActive: false } })
      return NextResponse.json({ success: true, deactivated: true })
    }
    await prisma.technician.delete({ where: { id } })
    return NextResponse.json({ success: true, deactivated: false })
  },
  { write: true }
)
