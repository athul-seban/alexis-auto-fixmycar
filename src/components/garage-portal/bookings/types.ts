import type { BookingRow, BookingDetail } from "@/lib/portal/booking-rows"

export type { BookingRow, BookingDetail }

export interface TechnicianOption {
  id: string
  name: string
  color: string
  isActive: boolean
}

export interface BookingsResponse {
  bookings: BookingRow[]
  total: number
  page: number
  pageSize: number
  totalPages: number
  counts: Record<string, number>
}

export interface OverlapDetails {
  code: "OVERLAP"
  error: string
  reason: "FULL" | "BLOCKED" | "TECHNICIAN_BUSY" | null
  conflicts: { id: string; reference: string | null; customerName: string | null; vrm: string | null; scheduledAt: string; durationMins: number | null }[]
}
