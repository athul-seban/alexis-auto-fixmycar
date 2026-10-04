export interface CustomerRow {
  key: string
  name: string
  email: string | null
  phone: string | null
  vehicles: { vrm: string; label: string }[]
  bookings: number
  completed: number
  noShows: number
  cancelled: number
  spend: number
  lastVisit: string | null
  nextBooking: string | null
}

export interface CustomerBookingItem {
  id: string
  reference: string | null
  serviceType: string
  status: string
  scheduledAt: string
  totalPrice: number
  finalInvoiceValue: number | null
  vrm: string | null
}

export interface CustomerDetail {
  customer: CustomerRow
  note: { body: string; updatedAt: string } | null
  bookings: CustomerBookingItem[]
}
