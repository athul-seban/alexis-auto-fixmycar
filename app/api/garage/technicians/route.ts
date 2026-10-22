import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { linkedTechnicianId } from "@/lib/org/own-jobs"
import { peopleAtLocation } from "@/lib/org/technician-link"
import { TECHNICIAN_SELECT, technicianSchema } from "@/lib/portal/technician-schema"

// Who can see the technicians: anyone who sees the location's bookings or diary sees them all (to schedule and filter); a
// technician who may only see their own jobs sees just themselves. Whoever manages technicians also sees which login
// each is linked to, and who could be linked.
export const GET = withGarage("Garage technicians GET", async (_req, ctx) => {
  const { garage, can } = ctx
  const everyone = can("bookings.view") || can("diary.view")
  const manages = can("technicians.manage")
  const own = everyone ? null : await linkedTechnicianId(ctx.userId, garage.id)

  const rows = await prisma.technician.findMany({
    where: { garageId: garage.id, ...(everyone ? {} : { id: own ?? "__no_technician__" }) },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { ...TECHNICIAN_SELECT, user: manages ? { select: { id: true, name: true, email: true } } : false },
  })
  const technicians = rows.map(({ user, ...t }) => (manages ? { ...t, login: user ?? null } : t))
  return NextResponse.json({ technicians, ...(manages ? { people: await peopleAtLocation(garage) } : {}) })
}, { permission: { anyOf: ["bookings.view", "diary.view", "bookings.viewOwn", "diary.viewOwn"] } })

export const POST = withGarage(
  "Garage technicians POST",
  async (req, { garage }) => {
    const data = technicianSchema.parse(await req.json())
    const count = await prisma.technician.count({ where: { garageId: garage.id } })
    const technician = await prisma.technician.create({
      data: {
        garageId: garage.id,
        name: data.name,
        email: data.email || null,
        phone: data.phone || null,
        color: data.color ?? "#1E3A5F",
        isActive: data.isActive ?? true,
        sortOrder: data.sortOrder ?? count,
      },
      select: TECHNICIAN_SELECT,
    })
    return NextResponse.json({ technician }, { status: 201 })
  },
  { permission: "technicians.manage", write: true }
)
