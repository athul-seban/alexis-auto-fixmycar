import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { z } from "zod"

const markReadSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
})

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const where =
      user.role === "GARAGE"
        ? { garageId: (await prisma.garage.findUnique({ where: { userId: user.id } }))?.id ?? "__none__" }
        : { userId: user.id }

    const [notifications, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: 50,
      }),
      prisma.notification.count({ where: { ...where, readAt: null } }),
    ])

    return NextResponse.json({ notifications, unreadCount })
  } catch (err) {
    console.error("Notifications GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function PATCH(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any

  try {
    const body = await req.json()
    const data = markReadSchema.parse(body)

    const where =
      user.role === "GARAGE"
        ? { garageId: (await prisma.garage.findUnique({ where: { userId: user.id } }))?.id ?? "__none__" }
        : { userId: user.id }

    if (data.all) {
      await prisma.notification.updateMany({
        where: { ...where, readAt: null },
        data: { readAt: new Date() },
      })
    } else if (data.ids?.length) {
      await prisma.notification.updateMany({
        where: { ...where, id: { in: data.ids } },
        data: { readAt: new Date() },
      })
    }

    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid data", details: err.errors }, { status: 400 })
    }
    console.error("Notifications PATCH error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
