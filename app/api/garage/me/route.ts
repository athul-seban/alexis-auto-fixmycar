import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"
import { toGarageProfile, parseServiceList } from "@/lib/garage-mapper"

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const user = session.user as any
  if (user.role !== "GARAGE") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

  try {
    const garage = await prisma.garage.findUnique({ where: { userId: user.id } })
    if (!garage) return NextResponse.json({ error: "Garage not found" }, { status: 404 })

    const profile = toGarageProfile(garage as any)
    const verificationBadges = parseServiceList((garage as any).verificationBadges)

    return NextResponse.json({ garage: { ...profile, verificationBadges } })
  } catch (err) {
    console.error("Garage me GET error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
