import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const actionSchema = z.object({
  garageId: z.string(),
  action: z.enum(["approve", "reject", "suspend"]),
  reason: z.string().optional(),
})

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const status = searchParams.get("status") ?? "PENDING"

  const garages = await prisma.garage.findMany({
    where: { status: status as any },
    include: { user: { select: { name: true, email: true, phone: true } } },
    orderBy: { createdAt: "desc" },
  })

  return NextResponse.json({ garages })
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { garageId, action } = actionSchema.parse(body)

    const statusMap = { approve: "APPROVED", reject: "SUSPENDED", suspend: "SUSPENDED" }

    const garage = await prisma.garage.update({
      where: { id: garageId },
      data: {
        status: statusMap[action] as any,
        isVerified: action === "approve",
      },
    })

    return NextResponse.json({ garage })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data" }, { status: 400 })
    }
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
