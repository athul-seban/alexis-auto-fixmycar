import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const updateSchema = z.object({
  registration: z.string().min(2).optional(),
  make: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
  year: z.number().int().min(1970).max(new Date().getFullYear() + 1).optional(),
  fuel: z.string().optional(),
  color: z.string().optional(),
  mileage: z.number().int().positive().optional(),
  motDueDate: z.string().datetime().nullable().optional(),
  serviceDueDate: z.string().datetime().nullable().optional(),
})

interface Params {
  params: Promise<{ id: string }>
}

export async function PATCH(req: Request, props: Params) {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: params.id, ownerId: user.id } })
    if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })

    const body = await req.json()
    const data = updateSchema.parse(body)

    const updated = await prisma.vehicle.update({
      where: { id: params.id },
      data: {
        ...data,
        motDueDate: data.motDueDate === undefined ? undefined : data.motDueDate ? new Date(data.motDueDate) : null,
        serviceDueDate:
          data.serviceDueDate === undefined ? undefined : data.serviceDueDate ? new Date(data.serviceDueDate) : null,
      },
    })

    return NextResponse.json({ vehicle: updated })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Vehicle PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(_req: Request, props: Params) {
  const params = await props.params
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const vehicle = await prisma.vehicle.findFirst({ where: { id: params.id, ownerId: user.id } })
    if (!vehicle) return NextResponse.json({ error: "Vehicle not found" }, { status: 404 })

    await prisma.vehicle.delete({ where: { id: params.id } })
    return NextResponse.json({ success: true })
  } catch (err: any) {
    if (err?.code === "P2003") {
      return NextResponse.json(
        { error: "This vehicle has existing quotes or bookings and can't be deleted" },
        { status: 409 }
      )
    }
    console.error("Vehicle DELETE error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
