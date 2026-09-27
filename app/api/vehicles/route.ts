import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const createSchema = z.object({
  registration: z.string().min(2),
  make: z.string().min(1),
  model: z.string().min(1),
  year: z.number().int().min(1970).max(new Date().getFullYear() + 1),
  fuel: z.string().optional(),
  color: z.string().optional(),
  mileage: z.number().int().positive().optional(),
  motDueDate: z.string().datetime().optional(),
  serviceDueDate: z.string().datetime().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const vehicles = await prisma.vehicle.findMany({
      where: { ownerId: user.id },
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ vehicles })
  } catch (err) {
    console.error("Vehicles GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "OWNER") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const body = await req.json()
    const data = createSchema.parse(body)

    const vehicle = await prisma.vehicle.create({
      data: {
        ownerId: user.id,
        registration: data.registration.toUpperCase(),
        make: data.make,
        model: data.model,
        year: data.year,
        fuel: data.fuel,
        color: data.color,
        mileage: data.mileage,
        motDueDate: data.motDueDate ? new Date(data.motDueDate) : undefined,
        serviceDueDate: data.serviceDueDate ? new Date(data.serviceDueDate) : undefined,
      },
    })

    return NextResponse.json({ vehicle }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Vehicles POST error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
