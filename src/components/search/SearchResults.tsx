"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Search, MapPin, Car, Shield, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { GarageCard } from "@/components/search/GarageCard"
import type { GarageListItem } from "@/types"

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

// A postcode-shaped query (e.g. "SW1A", "M1") starts with 1-2 letters then a digit.
const POSTCODE_PATTERN = /^[A-Za-z]{1,2}\d/

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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [garages, setGarages] = useState<GarageListItem[]>([])
  const [total, setTotal] = useState(0)

  useEffect(() => {
    const controller = new AbortController()

    async function fetchGarages() {
      setLoading(true)
      setError("")
      try {
        const params = new URLSearchParams()
        if (location) {
          if (POSTCODE_PATTERN.test(location.trim())) params.set("postcode", location.trim())
          else params.set("city", location.trim())
        }
        if (serviceType) params.set("service", serviceType)
        if (mobileOnly) params.set("mobile", "true")
        if (verifiedOnly) params.set("verified", "true")
        if (minRating) params.set("minRating", minRating)
        if (sortBy) params.set("sort", sortBy)

        const res = await fetch(`/api/garages?${params.toString()}`, { signal: controller.signal })
        const data = await res.json()
        if (!res.ok) throw new Error(data.error ?? "Failed to load garages")
        setGarages(data.garages)
        setTotal(data.total)
      } catch (err: any) {
        if (err.name !== "AbortError") setError(err.message ?? "Failed to load garages")
      } finally {
        setLoading(false)
      }
    }

    fetchGarages()
    return () => controller.abort()
  }, [location, serviceType, mobileOnly, verifiedOnly, minRating, sortBy])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    const params = new URLSearchParams()
    if (location) params.set("location", location)
    if (registration) params.set("reg", registration)
    if (serviceType) params.set("service", serviceType)
    if (mobileOnly) params.set("mobile", "true")
    router.push(`/search?${params.toString()}`)
  }

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
                    <option value="bookings">Most Booked</option>
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
                <span className="font-bold text-slate-900">{total}</span> garages found
                {location && <span className="text-slate-500"> near <strong>{location}</strong></span>}
              </p>
            </div>

            {loading ? (
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-40 bg-white rounded-xl border border-gray-200 animate-pulse" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <AlertCircle className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">Something went wrong</h3>
                <p className="text-slate-500 text-sm mb-4">{error}</p>
                <Button variant="outline" onClick={() => setSortBy((s) => s)}>Retry</Button>
              </div>
            ) : garages.length === 0 ? (
              <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
                <Search className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                <h3 className="text-lg font-semibold text-slate-900 mb-1">No garages found</h3>
                <p className="text-slate-500 text-sm">Try adjusting your filters or searching a different location.</p>
              </div>
            ) : (
              <div className="space-y-4">
                {garages.map((garage) => (
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
