import type { Prisma } from "@prisma/client"
import { displayStatus, type DisplayStatus } from "@/lib/portal/booking-status"

// Wire shapes for the garage portal. Dates are ISO strings so the same types serve the API
// and the client. Garage-facing reads use the customer/vehicle snapshot columns only.

export interface BookingRow {
  id: string
  reference: string | null
  vrm: string | null
  customerName: string | null
  customerPhone: string | null
  customerEmail: string | null
  vehicleMake: string | null
  vehicleModel: string | null
  vehicleYear: number | null
  source: string
  technician: { id: string; name: string; color: string } | null
  serviceType: string
  status: string
  displayStatus: DisplayStatus
  scheduledAt: string
  durationMins: number | null
  totalPrice: number
  finalInvoiceValue: number | null
  createdAt: string
  contactedAt: string | null
  hasOwner: boolean
  timeConfirmed: boolean
}

export interface BookingDetail extends BookingRow {
  description: string | null
  notes: string | null
  cancelReason: string | null
  completedAt: string | null
  quoteId: string | null
  jobResponseId: string | null
  review: { rating: number; title: string | null; comment: string; createdAt: string; reply: string | null; repliedAt: string | null } | null
  /** Oldest first. */
  events: { id: string; actorType: string; type: string; detail: string | null; createdAt: string }[]
}

export const BOOKING_ROW_SELECT = {
  id: true,
  reference: true,
  vrm: true,
  customerName: true,
  customerPhone: true,
  customerEmail: true,
  vehicleMake: true,
  vehicleModel: true,
  vehicleYear: true,
  source: true,
  technician: { select: { id: true, name: true, color: true } },
  serviceType: true,
  status: true,
  scheduledAt: true,
  durationMins: true,
  totalPrice: true,
  finalInvoiceValue: true,
  createdAt: true,
  contactedAt: true,
  ownerId: true,
  timeConfirmed: true,
} satisfies Prisma.BookingSelect

export const BOOKING_DETAIL_SELECT = {
  ...BOOKING_ROW_SELECT,
  description: true,
  notes: true,
  cancelReason: true,
  completedAt: true,
  quoteId: true,
  jobResponseId: true,
  review: { select: { rating: true, title: true, comment: true, createdAt: true, reply: true, repliedAt: true } },
  events: { orderBy: { createdAt: "asc" }, select: { id: true, actorType: true, type: true, detail: true, createdAt: true } },
} satisfies Prisma.BookingSelect

type RowSource = Prisma.BookingGetPayload<{ select: typeof BOOKING_ROW_SELECT }>
type DetailSource = Prisma.BookingGetPayload<{ select: typeof BOOKING_DETAIL_SELECT }>

const iso = (d: Date | null) => (d ? d.toISOString() : null)

export function toBookingRow(b: RowSource, now: Date = new Date()): BookingRow {
  return {
    id: b.id,
    reference: b.reference,
    vrm: b.vrm,
    customerName: b.customerName,
    customerPhone: b.customerPhone,
    customerEmail: b.customerEmail,
    vehicleMake: b.vehicleMake,
    vehicleModel: b.vehicleModel,
    vehicleYear: b.vehicleYear,
    source: b.source,
    technician: b.technician,
    serviceType: b.serviceType,
    status: b.status,
    displayStatus: displayStatus(b, now),
    scheduledAt: b.scheduledAt.toISOString(),
    durationMins: b.durationMins,
    totalPrice: b.totalPrice,
    finalInvoiceValue: b.finalInvoiceValue,
    createdAt: b.createdAt.toISOString(),
    contactedAt: iso(b.contactedAt),
    hasOwner: b.ownerId !== null,
    timeConfirmed: b.timeConfirmed,
  }
}

export function toBookingDetail(b: DetailSource, now: Date = new Date()): BookingDetail {
  return {
    ...toBookingRow(b, now),
    description: b.description,
    notes: b.notes,
    cancelReason: b.cancelReason,
    completedAt: iso(b.completedAt),
    quoteId: b.quoteId,
    jobResponseId: b.jobResponseId,
    review: b.review
      ? {
          rating: b.review.rating,
          title: b.review.title,
          comment: b.review.comment,
          createdAt: b.review.createdAt.toISOString(),
          reply: b.review.reply,
          repliedAt: iso(b.review.repliedAt),
        }
      : null,
    events: b.events.map((e) => ({ id: e.id, actorType: e.actorType, type: e.type, detail: e.detail, createdAt: e.createdAt.toISOString() })),
  }
}
