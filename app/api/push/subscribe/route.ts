import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { z } from "zod"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { pushConfigured } from "@/lib/push"

const subscribeSchema = z.object({
  endpoint: z.string().url().max(1000).refine((u) => u.startsWith("https://"), "Push endpoints are always https"),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(10).max(100) }),
})
const unsubscribeSchema = z.object({ endpoint: z.string().url().max(1000) })

/** Who a subscription belongs to: a garage account's pushes go to its garage, everyone else's to the user. */
async function owner(): Promise<{ userId: string } | { garageId: string } | NextResponse> {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  if (user.role === "GARAGE") {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!garage) return NextResponse.json({ error: "Garage profile not found" }, { status: 404 })
    return { garageId: garage.id }
  }
  if (user.role === "OWNER") return { userId: user.id }
  return NextResponse.json({ error: "Forbidden" }, { status: 403 })
}

export async function GET() {
  return NextResponse.json({ available: pushConfigured(), publicKey: pushConfigured() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null })
}

export async function POST(req: Request) {
  const who = await owner()
  if (who instanceof NextResponse) return who
  if (!pushConfigured()) return NextResponse.json({ error: "Push notifications aren't set up on this platform yet." }, { status: 409 })

  try {
    const data = subscribeSchema.parse(await req.json())
    const fields = { p256dh: data.keys.p256dh, auth: data.keys.auth, userAgent: req.headers.get("user-agent")?.slice(0, 200) ?? null }
    // A browser has one endpoint; if someone else signed in on it, the subscription follows the current account.
    await prisma.pushSubscription.upsert({
      where: { endpoint: data.endpoint },
      create: { endpoint: data.endpoint, ...fields, ...("userId" in who ? { userId: who.userId } : { garageId: who.garageId }) },
      update: { ...fields, userId: "userId" in who ? who.userId : null, garageId: "garageId" in who ? who.garageId : null },
    })
    return NextResponse.json({ success: true }, { status: 201 })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid subscription" }, { status: 400 })
    console.error("Push subscribe error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const who = await owner()
  if (who instanceof NextResponse) return who
  try {
    const { endpoint } = unsubscribeSchema.parse(await req.json())
    // Scoped to the caller so nobody can drop someone else's subscription by guessing an endpoint.
    await prisma.pushSubscription.deleteMany({ where: { endpoint, ...who } })
    return NextResponse.json({ success: true })
  } catch (err) {
    if (err instanceof z.ZodError) return NextResponse.json({ error: "Invalid request" }, { status: 400 })
    console.error("Push unsubscribe error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
