import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { threadSummaries } from "@/lib/messaging"
import { can } from "@/lib/org/access"
import { resolveActiveGarage } from "@/lib/org/resolve"

// The signed-in customer's or garage's conversations with unread counts (powers the inbox lists and sidebar badges).
export async function GET(req?: Request) {
  const session = await getServerSession(authOptions)
  const user = session?.user as { id?: string; role?: string } | undefined
  if (!user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  try {
    if (user.role === "OWNER") {
      const threads = await threadSummaries({ role: "OWNER", userId: user.id })
      return NextResponse.json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) })
    }
    if (user.role === "GARAGE") {
      // The ACTIVE location's inbox. A member without messages.view just has an empty one (this is polled for the badge).
      const resolved = await resolveActiveGarage(user.id, req)
      if (!resolved.ok || !can(resolved.value.access, "messages.view")) return NextResponse.json({ threads: [], unread: 0 })
      const threads = await threadSummaries({ role: "GARAGE", userId: user.id, garageId: resolved.value.garage.id })
      return NextResponse.json({ threads, unread: threads.reduce((n, t) => n + t.unread, 0) })
    }
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  } catch (err) {
    console.error("Messages summary error:", err)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
