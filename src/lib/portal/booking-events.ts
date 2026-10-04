import type { Prisma } from "@prisma/client"
import { prisma } from "@/lib/prisma"
import type { BookingSource } from "@/types"

export type BookingEventType = "CREATED" | "STATUS" | "RESCHEDULED" | "TECHNICIAN" | "CONTACTED" | "NOTE" | "REMINDER" | "REVIEW" | "PAYMENT"
export type EventActor = "GARAGE" | "OWNER" | "CUSTOMER" | "ADMIN" | "SYSTEM"

type Db = Prisma.TransactionClient | typeof prisma

/** Append one entry to a booking's history. Pass the transaction client to make it atomic with the change. */
export function recordBookingEvent(
  db: Db,
  e: { bookingId: string; actorType: EventActor; type: BookingEventType; detail?: string | null; actorName?: string | null }
) {
  return db.bookingEvent.create({
    data: { bookingId: e.bookingId, actorType: e.actorType, type: e.type, detail: e.detail ?? null, actorName: e.actorName ?? null },
  })
}

/** Who "did" a creation, from how the booking arrived. */
export function creationActor(source: BookingSource | string): EventActor {
  if (source === "DIRECT") return "GARAGE"
  if (source === "MARKETPLACE" || source === "QUOTE") return "OWNER"
  return "CUSTOMER" // widget + guest job requests have no account
}

export async function listBookingEvents(bookingId: string) {
  const rows = await prisma.bookingEvent.findMany({ where: { bookingId }, orderBy: { createdAt: "asc" } })
  return rows.map((r) => ({
    id: r.id,
    actorType: r.actorType as EventActor,
    actorName: r.actorName,
    type: r.type as BookingEventType,
    detail: r.detail,
    createdAt: r.createdAt.toISOString(),
  }))
}
