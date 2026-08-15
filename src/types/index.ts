export type UserRole = "OWNER" | "GARAGE" | "ADMIN"
export type GarageStatus = "PENDING" | "APPROVED" | "SUSPENDED"
export type QuoteStatus = "PENDING" | "SENT" | "ACCEPTED" | "REJECTED" | "EXPIRED"
export type BookingStatus = "PENDING" | "CONFIRMED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED"
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
  vehicle: Vehicle
  garage: GarageProfile
  review: Review | null
}

export interface Review {
  id: string
  rating: number
  title: string | null
  comment: string
  createdAt: Date
  owner: { name: string | null; image: string | null }
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
