import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireSession } from "@/lib/session"
import { resolveActiveGarage } from "@/lib/org/resolve"
import { visibleNotificationTypes } from "@/lib/org/notify-access"
import { z } from "zod"

const markReadSchema = z.object({
  ids: z.array(z.string()).optional(),
  all: z.boolean().optional(),
})

/**
 * Whose notifications to read or mark: a customer's are their own; a garage login sees the ACTIVE location's (shared by
 * everyone who works there), limited to the kinds their role may see (a receptionist doesn't see billing notices). With
 * no usable location the filter matches nothing, never everything.
 */
async function ownerFilter(user: { id: string; role: string }, req?: Request) {
  if (user.role !== "GARAGE") return { userId: user.id }
  const resolved = await resolveActiveGarage(user.id, req)
  if (!resolved.ok) return { garageId: "__none__" }
  return { garageId: resolved.value.garage.id, type: { in: visibleNotificationTypes(resolved.value.access) } }
}

export async function GET(req?: Request) {
  const auth = await requireSession()
  if (!auth.ok) return auth.response
  const { user } = auth

  try {
    const where = await ownerFilter(user, req)

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
  const auth = await requireSession()
  if (!auth.ok) return auth.response
  const { user } = auth

  try {
    const body = await req.json()
    const data = markReadSchema.parse(body)

    const where = await ownerFilter(user, req)

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
