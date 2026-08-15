export interface TrackedGarage {
  id: string
  name: string
  slug: string
  city: string
  postcode: string
  logo: string | null
  isVerified: boolean
  isMobile: boolean
  averageRating: number
  totalReviews: number
  phone: string
}

export interface TrackedJobResponse {
  id: string
  price: number
  laborCost: number | null
  partsCost: number | null
  message: string | null
  status: string
  validUntil: string | null
  createdAt: string
  garage: TrackedGarage
}

export interface TrackedJobRequest {
  id: string
  token: string
  status: string
  guestName: string
  guestEmail: string
  guestPhone: string
  registration: string
  make: string
  model: string
  year: number
  fuel: string | null
  mileage: number | null
  serviceType: string
  description: string
  city: string
  postcode: string
  isMobilePreferred: boolean
  preferredDate: string | null
  createdAt: string
  responses: TrackedJobResponse[]
}
