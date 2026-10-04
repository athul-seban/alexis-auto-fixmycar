export interface OwnerVehicle {
  id: string
  registration: string
  make: string
  model: string
  year: number
  fuel: string | null
  mileage: number | null
  motDueDate: string | null
  serviceDueDate: string | null
}

export interface OwnerReview {
  id: string
  rating: number
  comment: string
  reply: string | null
}

export interface OwnerBooking {
  id: string
  reference: string | null
  serviceType: string
  status: string
  scheduledAt: string
  timeConfirmed: boolean
  totalPrice: number
  vehicle: { id: string; registration: string; make: string; model: string } | null
  garage: { id: string; name: string; slug: string; city: string; phone: string }
  review: OwnerReview | null
}

export interface OwnerQuote {
  id: string
  serviceType: string
  status: string
  description: string
  price: number | null
  createdAt: string
  vehicle: { id: string; registration: string; make: string; model: string }
  garage: { id: string; name: string; slug: string; city: string; averageRating: number; isVerified: boolean }
}

const DAY_MS = 86_400_000

/** MOT/service dates within 30 days (or already past). */
export function isDueSoon(iso: string | null, now = Date.now()): boolean {
  return iso !== null && new Date(iso).getTime() - now <= 30 * DAY_MS
}

/** A booking that is still to happen or in progress. */
export const isActiveStatus = (status: string) => ["PENDING", "CONFIRMED", "IN_PROGRESS"].includes(status)
