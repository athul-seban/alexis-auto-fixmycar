import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { prisma } from "@/lib/prisma"
import { authOptions } from "@/lib/auth"

export async function GET(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session || (session.user as any).role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const q = searchParams.get("q")?.trim().toLowerCase()
  const quoteId = searchParams.get("quoteId")
  const bookingId = searchParams.get("bookingId")
  const page = Math.max(1, Number(searchParams.get("page")) || 1)
  const pageSize = Math.min(50, Math.max(1, Number(searchParams.get("pageSize")) || 10))

  // Thread-level view: group messages by (quoteId|bookingId) into a thread summary
  if (!quoteId && !bookingId) {
    const messages = await prisma.message.findMany({
      include: {
        sender: { select: { name: true, email: true, role: true } },
        garage: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
    })

    const threadMap = new Map<
      string,
      { key: string; quoteId: string | null; bookingId: string | null; garageName: string; lastBody: string; lastSenderRole: string; lastAt: Date; messageCount: number }
    >()

    for (const m of messages) {
      const key = m.quoteId ? `quote:${m.quoteId}` : `booking:${m.bookingId}`
      const existing = threadMap.get(key)
      if (!existing) {
        threadMap.set(key, {
          key,
          quoteId: m.quoteId,
          bookingId: m.bookingId,
          garageName: m.garage.name,
          lastBody: m.body,
          lastSenderRole: m.sender.role,
          lastAt: m.createdAt,
          messageCount: 1,
        })
      } else {
        existing.messageCount += 1
      }
    }

    const threads = Array.from(threadMap.values()).sort((a, b) => b.lastAt.getTime() - a.lastAt.getTime())

    const filtered = q
      ? threads.filter((t) => t.garageName.toLowerCase().includes(q) || t.lastBody.toLowerCase().includes(q))
      : threads

    const total = filtered.length
    const start = (page - 1) * pageSize
    const pageItems = filtered.slice(start, start + pageSize)

    return NextResponse.json({
      threads: pageItems,
      total,
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    })
  }

  // Single-thread view: full message list for one quote/booking
  const messages = await prisma.message.findMany({
    where: quoteId ? { quoteId } : { bookingId },
    include: { sender: { select: { id: true, name: true, email: true, role: true } } },
    orderBy: { createdAt: "asc" },
  })

  return NextResponse.json({ messages })
}
