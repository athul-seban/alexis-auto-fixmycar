import type { BookingRow } from "@/lib/portal/booking-rows"
import type { OpeningHours } from "@/types"
import type { TechnicianOption } from "@/components/garage-portal/bookings/types"

export interface DiaryBlockRow {
  id: string
  startAt: string
  endAt: string
  allDay: boolean
  reason: string | null
  technician: { id: string; name: string; color: string } | null
}

export interface DiaryResponse {
  range: { from: string; to: string }
  bookings: BookingRow[]
  blocks: DiaryBlockRow[]
  openingHours: OpeningHours | null
  technicians: (TechnicianOption & { email: string | null; phone: string | null; sortOrder: number })[]
  capacity: number
}
