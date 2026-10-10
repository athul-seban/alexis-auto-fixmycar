import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import { garageLinks } from "@/lib/portal/links"
import { getServiceLabel } from "@/lib/utils"

// Conversations are not a model of their own: every quote and every booking is one thread, identified by
// (quoteId | bookingId). A message is "unread" until someone other than its sender has opened the thread.

export type ThreadKey = { quoteId: string } | { bookingId: string }

export const threadKeyOf = (m: { quoteId: string | null; bookingId: string | null }): string => (m.quoteId ? `q:${m.quoteId}` : `b:${m.bookingId}`)

/** Mark every message in a thread that the viewer didn't send as read. Returns how many were newly read. */
export async function markThreadRead(viewerUserId: string, thread: ThreadKey): Promise<number> {
  const res = await prisma.message.updateMany({
    where: { ...thread, senderId: { not: viewerUserId }, readAt: null },
    data: { readAt: new Date() },
  })
  return res.count
}

/**
 * A message only triggers an email if it is the first unread one from that sender in the thread, so a burst of
 * messages is one email and not a flood. (The in-app notification still fires for every message.)
 */
export async function isFirstUnreadFromSender(message: { id: string; senderId: string; quoteId: string | null; bookingId: string | null }): Promise<boolean> {
  const thread: ThreadKey = message.quoteId ? { quoteId: message.quoteId } : { bookingId: message.bookingId! }
  const earlier = await prisma.message.count({ where: { ...thread, senderId: message.senderId, readAt: null, id: { not: message.id } } })
  return earlier === 0
}

export interface ThreadSummary {
  key: string
  kind: "quote" | "booking"
  id: string
  /** Who the other party is, from the viewer's side. */
  with: string
  about: string
  unread: number
  lastBody: string
  lastAt: string
  link: string
}

/** Unread messages for a customer: messages from a garage in threads that belong to them. */
export async function ownerUnreadCount(userId: string): Promise<number> {
  const [quotes, bookings] = await Promise.all([
    prisma.quote.findMany({ where: { ownerId: userId }, select: { id: true } }),
    prisma.booking.findMany({ where: { ownerId: userId }, select: { id: true } }),
  ])
  if (quotes.length === 0 && bookings.length === 0) return 0
  return prisma.message.count({
    where: {
      readAt: null,
      senderId: { not: userId },
      OR: [{ quoteId: { in: quotes.map((q) => q.id) } }, { bookingId: { in: bookings.map((b) => b.id) } }],
    },
  })
}

/** Unread messages for a garage: messages from customers in its threads. */
export async function garageUnreadCount(garage: { id: string; userId: string }): Promise<number> {
  return prisma.message.count({ where: { garageId: garage.id, readAt: null, senderId: { not: garage.userId } } })
}

const PREVIEW = 120

/** The viewer's conversations, newest first, with unread counts. */
export async function threadSummaries(viewer: { role: "OWNER" | "GARAGE"; userId: string; garageId?: string }, limit = 50): Promise<ThreadSummary[]> {
  const where: Prisma.MessageWhereInput =
    viewer.role === "GARAGE"
      ? { garageId: viewer.garageId }
      : {
          OR: [
            { quoteId: { in: (await prisma.quote.findMany({ where: { ownerId: viewer.userId }, select: { id: true } })).map((q) => q.id) } },
            { bookingId: { in: (await prisma.booking.findMany({ where: { ownerId: viewer.userId }, select: { id: true } })).map((b) => b.id) } },
          ],
        }

  const messages = await prisma.message.findMany({ where, orderBy: { createdAt: "desc" }, take: 500, select: { id: true, quoteId: true, bookingId: true, senderId: true, body: true, readAt: true, createdAt: true } })
  const threads = new Map<string, { quoteId: string | null; bookingId: string | null; unread: number; last: (typeof messages)[number] }>()
  for (const m of messages) {
    const key = threadKeyOf(m)
    const t = threads.get(key) ?? { quoteId: m.quoteId, bookingId: m.bookingId, unread: 0, last: m }
    if (!m.readAt && m.senderId !== viewer.userId) t.unread += 1
    threads.set(key, t)
  }
  const picked = [...threads.entries()].slice(0, limit)

  const quoteIds = picked.flatMap(([, t]) => (t.quoteId ? [t.quoteId] : []))
  const bookingIds = picked.flatMap(([, t]) => (t.bookingId ? [t.bookingId] : []))
  const [quotes, bookings] = await Promise.all([
    prisma.quote.findMany({ where: { id: { in: quoteIds } }, select: { id: true, serviceType: true, garage: { select: { name: true } }, owner: { select: { name: true, email: true } } } }),
    prisma.booking.findMany({ where: { id: { in: bookingIds } }, select: { id: true, serviceType: true, customerName: true, garage: { select: { name: true } }, owner: { select: { name: true, email: true } } } }),
  ])
  const q = new Map(quotes.map((x) => [x.id, x]))
  const b = new Map(bookings.map((x) => [x.id, x]))

  const out: ThreadSummary[] = []
  for (const [key, t] of picked) {
    const lastAt = t.last.createdAt.toISOString()
    const lastBody = t.last.body.length > PREVIEW ? `${t.last.body.slice(0, PREVIEW)}…` : t.last.body
    if (t.quoteId) {
      const row = q.get(t.quoteId)
      if (!row) continue
      out.push({
        key, kind: "quote", id: t.quoteId, unread: t.unread, lastBody, lastAt,
        with: viewer.role === "GARAGE" ? (row.owner.name ?? row.owner.email) : row.garage.name,
        about: `Quote · ${getServiceLabel(row.serviceType)}`,
        link: viewer.role === "GARAGE" ? garageLinks.enquiry(t.quoteId) : `/dashboard/quotes`,
      })
    } else if (t.bookingId) {
      const row = b.get(t.bookingId)
      if (!row) continue
      out.push({
        key, kind: "booking", id: t.bookingId, unread: t.unread, lastBody, lastAt,
        with: viewer.role === "GARAGE" ? (row.customerName ?? row.owner?.name ?? row.owner?.email ?? "Customer") : row.garage.name,
        about: `Booking · ${getServiceLabel(row.serviceType)}`,
        link: viewer.role === "GARAGE" ? garageLinks.booking(t.bookingId) : `/dashboard/bookings`,
      })
    }
  }
  return out
}
