import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { BookingError } from "@/lib/portal/booking-error"
import { OrgError } from "@/lib/org/org-error"
import { assertCanLink } from "@/lib/org/technician-link"
import { TECHNICIAN_SELECT as SELECT, technicianSchema } from "@/lib/portal/technician-schema"
import { z } from "zod"

type Params = { id: string }

const patchSchema = technicianSchema.partial().extend({ userId: z.string().min(1).max(64).nullable().optional() })

async function loginOf(technicianId: string) {
  const t = await prisma.technician.findUnique({ where: { id: technicianId }, select: { user: { select: { id: true, name: true, email: true } } } })
  return t?.user ?? null
}

export const PATCH = withGarage<Params>(
  "Garage technician PATCH",
  async (req, { garage }, { id }) => {
    const data = patchSchema.parse(await req.json())
    const existing = await prisma.technician.findFirst({ where: { id, garageId: garage.id } })
    if (!existing) throw new BookingError("NOT_FOUND", "Technician not found")

    // Linking a login (userId) or unlinking it (null): only people who work at this location can be linked.
    if (data.userId) await assertCanLink(garage, data.userId, id)

    let technician
    try {
      technician = await prisma.technician.update({
        where: { id },
        data: {
          ...(data.name !== undefined ? { name: data.name } : {}),
          ...(data.email !== undefined ? { email: data.email || null } : {}),
          ...(data.phone !== undefined ? { phone: data.phone || null } : {}),
          ...(data.color !== undefined ? { color: data.color } : {}),
          ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
          ...(data.sortOrder !== undefined ? { sortOrder: data.sortOrder } : {}),
          ...(data.userId !== undefined ? { userId: data.userId } : {}),
        },
        select: SELECT,
      })
    } catch (err) {
      // Two requests linking the same person at once: the unique (location, login) pair refuses the second.
      if ((err as { code?: string })?.code === "P2002") throw new OrgError("CONFLICT", "That person is already linked to a technician here.")
      throw err
    }
    return NextResponse.json({ technician: { ...technician, login: await loginOf(id) } })
  },
  { permission: "technicians.manage", write: true }
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
  { permission: "technicians.manage", write: true }
)
