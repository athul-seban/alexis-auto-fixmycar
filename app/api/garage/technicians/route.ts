import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { TECHNICIAN_SELECT, technicianSchema } from "@/lib/portal/technician-schema"

export const GET = withGarage("Garage technicians GET", async (_req, { garage }) => {
  const technicians = await prisma.technician.findMany({
    where: { garageId: garage.id },
    orderBy: [{ isActive: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: TECHNICIAN_SELECT,
  })
  return NextResponse.json({ technicians })
})

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
  { write: true }
)
