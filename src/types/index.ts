export type UserRole = "OWNER" | "GARAGE" | "ADMIN"
export type GarageStatus = "PENDING" | "APPROVED" | "SUSPENDED"
export type QuoteStatus = "PENDING" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
export type BookingStatus = "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "NO_SHOW"
export type BookingSource = "MARKETPLACE" | "QUOTE" | "JOB_REQUEST" | "WIDGET" | "DIRECT"
export type ServiceType =
  | "MOT"
  | "FULL_SERVICE"
  | "INTERIM_SERVICE"
  | "MINOR_SERVICE"
  | "REPAIR"
  | "DIAGNOSTICS"
  | "TYRES"
  | "BRAKES"
  | "CLUTCH"
  | "CAMBELT"
  | "EXHAUST"
  | "BATTERY"
  | "WINDSCREEN"
  | "AIR_CON"
  | "ELECTRIC_SERVICE"
  | "OTHER"

export interface User {
  id: string
  name: string | null
  email: string
  image: string | null
  phone: string | null
  role: UserRole
  createdAt: Date
}

export interface GarageListItem {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  images: string[]
  phone: string
  email: string
  city: string
  postcode: string
  latitude: number | null
  longitude: number | null
  status: GarageStatus
  isVerified: boolean
  isMobile: boolean
  services: ServiceType[]
  totalReviews: number
  averageRating: number
  totalBookings: number
  createdAt: string
  /** Search-only: paid placement, the ranking's pick, and the garage's average time to answer a request. */
  featured?: boolean
  recommended?: boolean
  avgResponseMins?: number | null
}

export interface GarageProfile extends GarageListItem {
  address: string
  website: string | null
  openingHours: OpeningHours | null
  user?: User
}

export interface OpeningHours {
  monday: DayHours
  tuesday: DayHours
  wednesday: DayHours
  thursday: DayHours
  friday: DayHours
  saturday: DayHours
  sunday: DayHours
}

export interface DayHours {
  open: boolean
  from: string
  to: string
}

export interface Vehicle {
  id: string
  registration: string
  make: string
  model: string
  year: number
  fuel: string | null
  color: string | null
  mileage: number | null
}

export interface Quote {
  id: string
  serviceType: ServiceType
  description: string
  status: QuoteStatus
  price: number | null
  laborCost: number | null
  partsCost: number | null
  notes: string | null
  validUntil: Date | null
  createdAt: Date
  vehicle: Vehicle
  garage: GarageProfile
}

export interface Booking {
  id: string
  serviceType: ServiceType
  description: string | null
  status: BookingStatus
  scheduledAt: Date
  completedAt: Date | null
  totalPrice: number
  createdAt: Date
  // Null for walk-in / widget bookings made without an owner account.
  vehicle: Vehicle | null
  garage: GarageProfile
  review: Review | null
}

export interface Review {
  id: string
  rating: number
  title: string | null
  comment: string
  createdAt: Date
  // The garage's public reply, if it has written one.
  reply?: string | null
  repliedAt?: string | null
  owner: { name: string | null; image: string | null }
}

/** A garage's published price for one service (from its Pricing page). */
export interface PublicServicePrice {
  serviceType: string
  priceFrom: number | null
  priceTo: number | null
  durationMins: number
  notes: string | null
}

export interface SearchFilters {
  location: string
  serviceType?: ServiceType
  rating?: number
  maxDistance?: number
  isMobile?: boolean
  isVerified?: boolean
  sortBy?: "rating" | "reviews" | "distance" | "price"
}

export interface DashboardStats {
  total: number
  change: number
  changeLabel: string
}
