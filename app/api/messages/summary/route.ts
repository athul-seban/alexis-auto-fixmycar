import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { threadSummaries } from "@/lib/messaging"

// The signed-in customer's or garage's conversations with unread counts (powers the inbox lists and sidebar badges).
export async function GET() {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    if (user.role === "OWNER") {
      const threads = await threadSummaries({ role: "OWNER", userId: user.id })
      return NextResponse.json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) })
    }
    if (user.role === "GARAGE") {
      const garage = await prisma.garage.findUnique({ where: { userId: user.id }, select: { id: true } })
      if (!garage) return NextResponse.json({ threads: [], unread: 0 })
      const threads = await threadSummaries({ role: "GARAGE", userId: user.id, garageId: garage.id })
      return NextResponse.json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) })
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } catch (err) {
    console.error("Messages summary error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
