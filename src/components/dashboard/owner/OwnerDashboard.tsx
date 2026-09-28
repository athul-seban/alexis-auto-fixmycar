"use client"

import { useState, useEffect, useCallback } from "react"
import Link from "next/link"
import {
  Car, Calendar, MessageSquare, Star, Plus, Clock,
  CheckCircle, ChevronRight, AlertCircle, MapPin, X, Loader2, History, ChevronDown
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { MessageThread } from "@/components/shared/MessageThread"
import { formatCurrency, formatDateShort, getServiceLabel, getStatusColor } from "@/lib/utils"

interface User {
  id: string
  name?: string | null
  email?: string | null
  image?: string | null
}

interface VehicleItem {
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

interface BookingItem {
  id: string
  serviceType: string
  status: string
  scheduledAt: string
  totalPrice: number
  vehicle: { id: string; registration: string; make: string; model: string }
  garage: { id: string; name: string; city: string; phone: string }
  review: { id: string } | null
}

interface QuoteItem {
  id: string
  serviceType: string
  status: string
  description: string
  price: number | null
  createdAt: string
  vehicle: { id: string; registration: string; make: string; model: string }
  garage: { id: string; name: string; slug: string; city: string; averageRating: number; isVerified: boolean }
}

function isDueSoon(dateStr: string | null): boolean {
  if (!dateStr) return false
  const days = (new Date(dateStr).getTime() - Date.now()) / 86400000
  return days <= 30
}

interface Props {
  user: User
}

export function OwnerDashboard({ user }: Props) {
  const [activeTab, setActiveTab] = useState<"bookings" | "quotes" | "vehicles">("bookings")
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [quotes, setQuotes] = useState<QuoteItem[]>([])
  const [vehicles, setVehicles] = useState<VehicleItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [reviewBookingId, setReviewBookingId] = useState<string | null>(null)
  const [showAddVehicle, setShowAddVehicle] = useState(false)

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch("/api/bookings").then((r) => r.json()),
      fetch("/api/quotes").then((r) => r.json()),
      fetch("/api/vehicles").then((r) => r.json()),
    ])
      .then(([b, q, v]) => {
        setBookings(b.bookings ?? [])
        setQuotes(q.quotes ?? [])
        setVehicles(v.vehicles ?? [])
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const cancelBooking = async (bookingId: string) => {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status: "CANCELLED" }),
    })
    if (res.ok) {
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status: "CANCELLED" } : b)))
    }
  }

  const activeBookingsCount = bookings.filter((b) => !["COMPLETED", "CANCELLED"].includes(b.status)).length
  const pendingQuotesCount = quotes.filter((q) => q.status === "SENT").length
  const completedCount = bookings.filter((b) => b.status === "COMPLETED").length
  const dueSoonCount = vehicles.filter((v) => isDueSoon(v.motDueDate) || isDueSoon(v.serviceDueDate)).length

  const stats = [
    { label: "Active Bookings", value: String(activeBookingsCount), icon: Calendar, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
    { label: "Pending Quotes", value: String(pendingQuotesCount), icon: MessageSquare, color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10" },
    { label: "Completed Jobs", value: String(completedCount), icon: CheckCircle, color: "text-green-500 dark:text-green-400", bg: "bg-green-50 dark:bg-green-500/10" },
    { label: "Due Soon", value: String(dueSoonCount), icon: AlertCircle, color: "text-red-500 dark:text-red-400", bg: "bg-red-50 dark:bg-red-500/10" },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            Welcome back, {user.name?.split(" ")[0] ?? "there"}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Manage your bookings and quotes</p>
        </div>
        <Link href="/search">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Book New Service
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl p-1 border border-gray-200 dark:border-white/10 mb-6 w-fit">
        {(["bookings", "quotes", "vehicles"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
              activeTab === tab ? "bg-[#1E3A5F] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" /></div>
      ) : (
        <>
          {activeTab === "bookings" && (
            <div className="space-y-4">
              {bookings.length === 0 ? (
                <EmptyState icon={Calendar} title="No bookings yet" subtitle="Search for garages to book a service" />
              ) : (
                bookings.map((booking) => (
                  <div key={booking.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5 hover:shadow-sm dark:hover:bg-slate-800/80 transition-shadow">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-start gap-4">
                        <div className="w-12 h-12 rounded-xl bg-[#1E3A5F] flex items-center justify-center text-white font-bold flex-shrink-0">
                          <Car className="h-6 w-6" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 dark:text-white">{getServiceLabel(booking.serviceType)}</h3>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                              {booking.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                            {booking.vehicle.registration} · {booking.vehicle.make} {booking.vehicle.model}
                          </p>
                          <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {booking.garage.name}, {booking.garage.city}
                            </div>
                            <div className="flex items-center gap-1">
                              <Clock className="h-3 w-3" />
                              {formatDateShort(booking.scheduledAt)}
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(booking.totalPrice)}</span>
                        <button
                          onClick={() => setExpandedThread(expandedThread === booking.id ? null : booking.id)}
                          className="text-slate-400 dark:text-slate-500 hover:text-[#1E3A5F] dark:hover:text-white transition-colors"
                          aria-label="Toggle messages"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        {booking.status === "COMPLETED" && !booking.review && (
                          <Button size="sm" variant="outline" onClick={() => setReviewBookingId(booking.id)}>Leave Review</Button>
                        )}
                        {booking.status === "COMPLETED" && booking.review && (
                          <Badge>Reviewed</Badge>
                        )}
                        {["PENDING", "CONFIRMED"].includes(booking.status) && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-500/30 hover:bg-red-50 dark:hover:bg-red-500/10"
                            onClick={() => cancelBooking(booking.id)}
                          >
                            Cancel
                          </Button>
                        )}
                      </div>
                    </div>
                    {expandedThread === booking.id && (
                      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                        <MessageThread bookingId={booking.id} currentUserId={user.id} />
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {activeTab === "quotes" && (
            <div>
              {quotes.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No quotes yet" subtitle="Search for garages to request quotes" />
              ) : (
                <div className="space-y-3">
                  {pendingQuotesCount > 0 && (
                    <div className="bg-orange-50 dark:bg-orange-500/10 border border-orange-200 dark:border-orange-500/30 rounded-xl p-4 mb-1 flex items-center gap-3">
                      <AlertCircle className="h-5 w-5 text-orange-500 dark:text-orange-400 flex-shrink-0" />
                      <p className="text-sm text-orange-700 dark:text-orange-300">
                        You have <strong>{pendingQuotesCount} quotes</strong> waiting for your review.
                      </p>
                    </div>
                  )}
                  {quotes.map((quote) => (
                    <div key={quote.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <h3 className="font-bold text-slate-900 dark:text-white">{getServiceLabel(quote.serviceType)}</h3>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(quote.status)}`}>
                              {quote.status}
                            </span>
                          </div>
                          <p className="text-sm text-slate-500 dark:text-slate-400">{quote.garage.name} · {quote.garage.city}</p>
                          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">{formatDateShort(quote.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-3">
                          {quote.status === "SENT" && quote.price != null && (
                            <>
                              <div className="text-right">
                                <div className="text-xl font-bold text-slate-900 dark:text-white">{formatCurrency(quote.price)}</div>
                                <div className="text-xs text-slate-400 dark:text-slate-500">Quote price</div>
                              </div>
                              <BookFromQuoteButton quote={quote} onBooked={loadAll} />
                            </>
                          )}
                          <button
                            onClick={() => setExpandedThread(expandedThread === quote.id ? null : quote.id)}
                            className="text-slate-400 dark:text-slate-500 hover:text-[#1E3A5F] dark:hover:text-white transition-colors"
                            aria-label="Toggle messages"
                          >
                            <MessageSquare className="h-4 w-4" />
                          </button>
                        </div>
                      </div>
                      {expandedThread === quote.id && (
                        <div className="mt-4 pt-4 border-t border-slate-100 dark:border-white/10">
                          <MessageThread quoteId={quote.id} currentUserId={user.id} />
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === "vehicles" && (
            <div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                {vehicles.map((v) => (
                  <VehicleCard key={v.id} vehicle={v} />
                ))}
              </div>
              {vehicles.length === 0 && (
                <EmptyState icon={Car} title="No vehicles yet" subtitle="Add a vehicle to start requesting quotes" />
              )}
              <Button variant="outline" className="gap-2" onClick={() => setShowAddVehicle(true)}>
                <Plus className="h-4 w-4" />
                Add Vehicle
              </Button>
            </div>
          )}
        </>
      )}

      {reviewBookingId && (
        <ReviewModal
          bookingId={reviewBookingId}
          onClose={() => setReviewBookingId(null)}
          onSubmitted={() => {
            setReviewBookingId(null)
            loadAll()
          }}
        />
      )}

      {showAddVehicle && (
        <AddVehicleModal
          onClose={() => setShowAddVehicle(false)}
          onAdded={(vehicle) => {
            setVehicles((prev) => [vehicle, ...prev])
            setShowAddVehicle(false)
          }}
        />
      )}
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return <span className="text-xs font-semibold px-2 py-1 rounded-full bg-green-100 dark:bg-green-500/20 text-green-800 dark:text-green-400">{children}</span>
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="text-center py-12 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10">
      <Icon className="h-10 w-10 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
      <h3 className="font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{subtitle}</p>
      <Link href="/search"><Button>Find Garages</Button></Link>
    </div>
  )
}

function VehicleCard({ vehicle }: { vehicle: VehicleItem }) {
  const [showHistory, setShowHistory] = useState(false)
  const motDue = isDueSoon(vehicle.motDueDate)
  const serviceDue = isDueSoon(vehicle.serviceDueDate)

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
      <div className="flex items-center gap-4">
        <div className="w-12 h-12 bg-[#1E3A5F] rounded-xl flex items-center justify-center flex-shrink-0">
          <Car className="h-6 w-6 text-white" />
        </div>
        <div className="flex-1">
          <div className="plate-number text-sm">{vehicle.registration}</div>
          <p className="font-semibold text-slate-900 dark:text-white mt-1">{vehicle.year} {vehicle.make} {vehicle.model}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{vehicle.fuel ?? "Fuel unknown"}{vehicle.mileage ? ` · ${vehicle.mileage.toLocaleString()} mi` : ""}</p>
        </div>
        <button onClick={() => setShowHistory((s) => !s)} className="text-slate-400 dark:text-slate-500 hover:text-[#1E3A5F] dark:hover:text-white" aria-label="Service history">
          <History className="h-4 w-4" />
        </button>
      </div>
      {(motDue || serviceDue) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {motDue && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-100 dark:bg-red-500/20 text-red-700 dark:text-red-400">
              MOT due {formatDateShort(vehicle.motDueDate!)}
            </span>
          )}
          {serviceDue && (
            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-orange-100 dark:bg-orange-500/20 text-orange-700 dark:text-orange-400">
              Service due {formatDateShort(vehicle.serviceDueDate!)}
            </span>
          )}
        </div>
      )}
      {showHistory && <VehicleHistory vehicleId={vehicle.id} />}
    </div>
  )
}

function VehicleHistory({ vehicleId }: { vehicleId: string }) {
  const [history, setHistory] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/vehicles/${vehicleId}/history`)
      .then((res) => res.json())
      .then((data) => setHistory(data.history ?? []))
      .finally(() => setLoading(false))
  }, [vehicleId])

  return (
    <div className="mt-3 pt-3 border-t border-slate-100 dark:border-white/10">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-2">Service History</p>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-slate-300 dark:text-slate-600" />
      ) : history.length === 0 ? (
        <p className="text-xs text-slate-400 dark:text-slate-500">No completed services yet.</p>
      ) : (
        <div className="space-y-2">
          {history.map((h) => (
            <div key={h.id} className="flex items-center justify-between text-xs">
              <span className="text-slate-600 dark:text-slate-300">{getServiceLabel(h.serviceType)} · {h.garage.name}</span>
              <span className="text-slate-400 dark:text-slate-500">{formatDateShort(h.completedAt ?? h.scheduledAt)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function BookFromQuoteButton({ quote, onBooked }: { quote: QuoteItem; onBooked: () => void }) {
  const [loading, setLoading] = useState(false)

  const handleBook = async () => {
    setLoading(true)
    try {
      const scheduledAt = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString()
      const res = await fetch("/api/bookings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicleId: quote.vehicle.id,
          garageId: quote.garage.id,
          quoteId: quote.id,
          serviceType: quote.serviceType,
          description: quote.description,
          scheduledAt,
          totalPrice: quote.price,
        }),
      })
      if (res.ok) onBooked()
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button size="sm" className="gap-1.5" loading={loading} onClick={handleBook}>
      Book Now
      <ChevronRight className="h-3.5 w-3.5" />
    </Button>
  )
}

function ReviewModal({ bookingId, onClose, onSubmitted }: { bookingId: string; onClose: () => void; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (comment.trim().length < 10) {
      setError("Please write at least 10 characters")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/reviews", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bookingId, rating, comment }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to submit review")
      onSubmitted()
    } catch (err: any) {
      setError(err.message ?? "Failed to submit review")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-sm p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Leave a Review</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-1 mb-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <button key={i} onClick={() => setRating(i)} className="cursor-pointer">
              <Star className={`h-7 w-7 ${i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 dark:text-slate-700"}`} />
            </button>
          ))}
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={4}
          placeholder="How was your experience?"
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none mb-4"
        />
        <Button className="w-full" loading={submitting} onClick={handleSubmit}>Submit Review</Button>
      </div>
    </div>
  )
}

function AddVehicleModal({ onClose, onAdded }: { onClose: () => void; onAdded: (vehicle: VehicleItem) => void }) {
  const [registration, setRegistration] = useState("")
  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [fuel, setFuel] = useState("")
  const [mileage, setMileage] = useState("")
  const [motDueDate, setMotDueDate] = useState("")
  const [serviceDueDate, setServiceDueDate] = useState("")
  const [error, setError] = useState("")
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async () => {
    if (!registration || !make || !model) {
      setError("Registration, make and model are required")
      return
    }
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch("/api/vehicles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          registration,
          make,
          model,
          year: parseInt(year, 10),
          fuel: fuel || undefined,
          mileage: mileage ? parseInt(mileage, 10) : undefined,
          motDueDate: motDueDate ? new Date(motDueDate).toISOString() : undefined,
          serviceDueDate: serviceDueDate ? new Date(serviceDueDate).toISOString() : undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to add vehicle")
      onAdded(data.vehicle)
    } catch (err: any) {
      setError(err.message ?? "Failed to add vehicle")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/40" onClick={onClose}>
      <div className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">Add Vehicle</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-white cursor-pointer"><X className="h-5 w-5" /></button>
        </div>
        {error && <p className="text-xs text-red-600 dark:text-red-400 mb-2">{error}</p>}
        <div className="space-y-3">
          <input value={registration} onChange={(e) => setRegistration(e.target.value.toUpperCase())} placeholder="Registration (e.g. AB12 CDE)" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          <div className="grid grid-cols-2 gap-2">
            <input value={make} onChange={(e) => setMake(e.target.value)} placeholder="Make" className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            <input value={model} onChange={(e) => setModel(e.target.value)} placeholder="Model" className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <input type="number" value={year} onChange={(e) => setYear(e.target.value)} placeholder="Year" className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
            <input value={fuel} onChange={(e) => setFuel(e.target.value)} placeholder="Fuel (optional)" className="h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <input type="number" value={mileage} onChange={(e) => setMileage(e.target.value)} placeholder="Mileage (optional)" className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">MOT Due Date (optional)</label>
            <input type="date" value={motDueDate} onChange={(e) => setMotDueDate(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">Next Service Due (optional)</label>
            <input type="date" value={serviceDueDate} onChange={(e) => setServiceDueDate(e.target.value)} className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]" />
          </div>
          <Button className="w-full" loading={submitting} onClick={handleSubmit}>Add Vehicle</Button>
        </div>
      </div>
    </div>
  )
}
