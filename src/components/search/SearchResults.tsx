"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Search, MapPin, SlidersHorizontal, Car, Star, Shield, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GarageCard } from "@/components/search/GarageCard"

const serviceOptions = [
  { value: "", label: "All Services" },
  { value: "MOT", label: "MOT Test" },
  { value: "FULL_SERVICE", label: "Full Service" },
  { value: "INTERIM_SERVICE", label: "Interim Service" },
  { value: "BRAKES", label: "Brakes" },
  { value: "TYRES", label: "Tyres" },
  { value: "REPAIR", label: "Engine Repair" },
  { value: "DIAGNOSTICS", label: "Diagnostics" },
  { value: "CLUTCH", label: "Clutch" },
  { value: "CAMBELT", label: "Cambelt" },
  { value: "EXHAUST", label: "Exhaust" },
  { value: "BATTERY", label: "Battery" },
  { value: "WINDSCREEN", label: "Windscreen" },
  { value: "AIR_CON", label: "Air Con" },
]

const mockGarages = [
  {
    id: "1", name: "Premier Auto Services", slug: "premier-auto-services",
    description: "Family-run garage with 20+ years experience. Specialists in all makes and models.",
    logo: null, images: [], phone: "020 7123 4567", email: "info@premier.com", website: null,
    address: "123 High Street", city: "London", postcode: "SW1A 1AA", latitude: 51.5, longitude: -0.12,
    status: "APPROVED" as const, isVerified: true, isMobile: false,
    services: ["MOT", "FULL_SERVICE", "BRAKES", "TYRES", "REPAIR"] as any,
    openingHours: null, totalReviews: 342, averageRating: 4.9, totalBookings: 1205,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "2", name: "QuickFix Mobile Mechanics", slug: "quickfix-mobile",
    description: "Mobile mechanics who come to you. Available 7 days a week across Manchester.",
    logo: null, images: [], phone: "0161 234 5678", email: "hello@quickfix.com", website: null,
    address: "Mobile Service", city: "Manchester", postcode: "M1 1AA", latitude: 53.48, longitude: -2.24,
    status: "APPROVED" as const, isVerified: true, isMobile: true,
    services: ["DIAGNOSTICS", "BATTERY", "TYRES", "BRAKES"] as any,
    openingHours: null, totalReviews: 218, averageRating: 4.8, totalBookings: 876,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "3", name: "Elite Car Care Centre", slug: "elite-car-care",
    description: "Award-winning garage specialising in premium and performance vehicles.",
    logo: null, images: [], phone: "0121 456 7890", email: "info@elitecar.com", website: null,
    address: "45 Industrial Way", city: "Birmingham", postcode: "B1 1AA", latitude: 52.48, longitude: -1.89,
    status: "APPROVED" as const, isVerified: true, isMobile: false,
    services: ["MOT", "CAMBELT", "CLUTCH", "FULL_SERVICE", "REPAIR"] as any,
    openingHours: null, totalReviews: 185, averageRating: 4.7, totalBookings: 654,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "4", name: "Citygate Garage", slug: "citygate-garage",
    description: "Trusted local garage serving Leeds for over 15 years. Free collection available.",
    logo: null, images: [], phone: "0113 789 0123", email: "info@citygate.com", website: null,
    address: "78 Park Road", city: "Leeds", postcode: "LS1 1AA", latitude: 53.8, longitude: -1.55,
    status: "APPROVED" as const, isVerified: false, isMobile: false,
    services: ["FULL_SERVICE", "EXHAUST", "AIR_CON", "MOT"] as any,
    openingHours: null, totalReviews: 156, averageRating: 4.6, totalBookings: 423,
    createdAt: new Date(), updatedAt: new Date(),
  },
  {
    id: "5", name: "Rapid Repair Centre", slug: "rapid-repair-centre",
    description: "Fast turnaround repairs with competitive pricing. Same day service available.",
    logo: null, images: [], phone: "0117 234 5678", email: "info@rapid.com", website: null,
    address: "22 Union Street", city: "Bristol", postcode: "BS1 1AA", latitude: 51.45, longitude: -2.59,
    status: "APPROVED" as const, isVerified: true, isMobile: false,
    services: ["BRAKES", "TYRES", "BATTERY", "WINDSCREEN", "EXHAUST"] as any,
    openingHours: null, totalReviews: 134, averageRating: 4.5, totalBookings: 398,
    createdAt: new Date(), updatedAt: new Date(),
  },
]

export function SearchResults() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [location, setLocation] = useState(searchParams.get("location") ?? "")
  const [serviceType, setServiceType] = useState(searchParams.get("service") ?? "")
  const [registration, setRegistration] = useState(searchParams.get("reg") ?? "")
  const [mobileOnly, setMobileOnly] = useState(searchParams.get("mobile") === "true")
  const [verifiedOnly, setVerifiedOnly] = useState(false)
  const [minRating, setMinRating] = useState("")
  const [sortBy, setSortBy] = useState("rating")
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [garages, setGarages] = useState(mockGarages)

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location) params.set("location", location)
    if (registration) params.set("reg", registration)
    if (serviceType) params.set("service", serviceType)
    if (mobileOnly) params.set("mobile", "true")
    router.push(`/search?${params.toString()}`)
  }

  const filteredGarages = garages
    .filter((g) => {
      if (mobileOnly && !g.isMobile) return false
      if (verifiedOnly && !g.isVerified) return false
      if (minRating && g.averageRating < parseFloat(minRating)) return false
      if (serviceType && !g.services.includes(serviceType as any)) return false
      return true
    })
    .sort((a, b) => {
      if (sortBy === "rating") return b.averageRating - a.averageRating
      if (sortBy === "reviews") return b.totalReviews - a.totalReviews
      return 0
    })

  return (
    <div>
      {/* Search Bar */}
      <div className="bg-[#1E3A5F] py-5">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <form onSubmit={handleSearch}>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                <input
                  type="text"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder="Postcode or town"
                  className="w-full h-11 pl-10 pr-4 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                />
              </div>
              <div className="flex-1 relative">
                <Car className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full h-11 pl-10 pr-4 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] appearance-none cursor-pointer"
                >
                  {serviceOptions.map((s) => (
                    <option key={s.value} value={s.value}>{s.label}</option>
                  ))}
                </select>
              </div>
              <Button type="submit" className="h-11 gap-2">
                <Search className="h-4 w-4" />
                Search
              </Button>
            </div>
          </form>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar Filters */}
          <aside className="lg:w-64 flex-shrink-0">
            <div className="bg-white rounded-xl border border-gray-200 p-5 sticky top-24">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-bold text-slate-900">Filters</h2>
                <button
                  onClick={() => {
                    setMobileOnly(false)
                    setVerifiedOnly(false)
                    setMinRating("")
                  }}
                  className="text-xs text-[#F97316] hover:underline cursor-pointer"
                >
                  Clear all
                </button>
              </div>

              <div className="space-y-5">
                <div>
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Sort by</h3>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
                  >
                    <option value="rating">Highest Rated</option>
                    <option value="reviews">Most Reviewed</option>
                    <option value="distance">Nearest First</option>
                  </select>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Minimum Rating</h3>
                  <select
                    value={minRating}
                    onChange={(e) => setMinRating(e.target.value)}
                    className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] cursor-pointer"
                  >
                    <option value="">Any rating</option>
                    <option value="4.5">4.5+ stars</option>
                    <option value="4">4+ stars</option>
                    <option value="3.5">3.5+ stars</option>
                  </select>
                </div>

                <div className="border-t border-gray-100 pt-4">
                  <h3 className="text-sm font-semibold text-slate-700 mb-3">Garage Type</h3>
                  <div className="space-y-2">
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={verifiedOnly}
                        onChange={(e) => setVerifiedOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#1E3A5F] cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5 text-sm text-slate-700">
                        <Shield className="h-3.5 w-3.5 text-blue-500" />
                        Verified only
                      </div>
                    </label>
                    <label className="flex items-center gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={mobileOnly}
                        onChange={(e) => setMobileOnly(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-[#1E3A5F] cursor-pointer"
                      />
                      <div className="flex items-center gap-1.5 text-sm text-slate-700">
                        <Car className="h-3.5 w-3.5 text-purple-500" />
                        Mobile mechanic
                      </div>
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </aside>

          {/* Results */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-slate-600">
                <span className="font-bold text-slate-900">{filteredGarages.length}</span> garages found
                {location && <span className="text-slate-500"> near <strong>{location}</strong></span>}
              </p>
            </div>

            {filteredGarages.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Search className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">No garages found</h3>
                <p className="text-slate-500 text-sm">Try adjusting your filters or searching a different location.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredGarages.map((garage) => (
                  <GarageCard key={garage.id} garage={garage} />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
