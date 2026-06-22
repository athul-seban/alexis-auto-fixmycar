"use client"

import { useState } from "react"
import Link from "next/link"
import {
  Car, Calendar, MessageSquare, Star, Plus, Search, Clock,
  CheckCircle, ChevronRight, AlertCircle, MapPin
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDateShort, getServiceLabel, getStatusColor } from "@/lib/utils"

interface User {
  name?: string | null
  email?: string | null
  image?: string | null
}

const mockBookings = [
  {
    id: "1", status: "CONFIRMED", serviceType: "MOT", scheduledAt: new Date("2024-02-15"),
    totalPrice: 54.99, vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
    garage: { name: "Premier Auto Services", city: "London", averageRating: 4.9 },
  },
  {
    id: "2", status: "COMPLETED", serviceType: "FULL_SERVICE", scheduledAt: new Date("2024-01-20"),
    totalPrice: 189.99, vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
    garage: { name: "QuickFix Mobile", city: "Manchester", averageRating: 4.8 },
  },
  {
    id: "3", status: "PENDING", serviceType: "BRAKES", scheduledAt: new Date("2024-02-22"),
    totalPrice: 120.00, vehicle: { registration: "XY22 FGH", make: "VW", model: "Golf" },
    garage: { name: "Elite Car Care", city: "Birmingham", averageRating: 4.7 },
  },
]

const mockQuotes = [
  {
    id: "1", status: "SENT", serviceType: "CAMBELT", price: 350.00,
    vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
    garage: { name: "Citygate Garage", city: "Leeds" },
    createdAt: new Date("2024-02-01"),
  },
  {
    id: "2", status: "SENT", serviceType: "CAMBELT", price: 299.00,
    vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus" },
    garage: { name: "Premier Auto Services", city: "London" },
    createdAt: new Date("2024-02-01"),
  },
]

interface Props {
  user: User
}

export function OwnerDashboard({ user }: Props) {
  const [activeTab, setActiveTab] = useState<"bookings" | "quotes" | "vehicles">("bookings")

  const stats = [
    { label: "Active Bookings", value: "2", icon: Calendar, color: "text-blue-500", bg: "bg-blue-50" },
    { label: "Pending Quotes", value: "2", icon: MessageSquare, color: "text-orange-500", bg: "bg-orange-50" },
    { label: "Completed Jobs", value: "12", icon: CheckCircle, color: "text-green-500", bg: "bg-green-50" },
    { label: "Total Saved", value: "£340", icon: Star, color: "text-purple-500", bg: "bg-purple-50" },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Welcome Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Welcome back, {user.name?.split(" ")[0] ?? "there"} 👋
          </h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage your bookings and quotes</p>
        </div>
        <Link href="/search">
          <Button className="gap-2">
            <Plus className="h-4 w-4" />
            Book New Service
          </Button>
        </Link>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center`}>
                <stat.icon className={`h-5 w-5 ${stat.color}`} />
              </div>
            </div>
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-6 w-fit">
        {(["bookings", "quotes", "vehicles"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
              activeTab === tab ? "bg-[#1E3A5F] text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === "bookings" && (
        <div className="space-y-4">
          {mockBookings.map((booking) => (
            <div key={booking.id} className="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-sm transition-shadow">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-xl bg-[#1E3A5F] flex items-center justify-center text-white font-bold flex-shrink-0">
                    <Car className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-slate-900">{getServiceLabel(booking.serviceType)}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                        {booking.status}
                      </span>
                    </div>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {booking.vehicle.registration} · {booking.vehicle.make} {booking.vehicle.model}
                    </p>
                    <div className="flex items-center gap-4 mt-1.5 text-xs text-slate-500">
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
                  <span className="text-lg font-bold text-slate-900">{formatCurrency(booking.totalPrice)}</span>
                  {booking.status === "COMPLETED" && (
                    <Button size="sm" variant="outline">Leave Review</Button>
                  )}
                  {booking.status === "CONFIRMED" && (
                    <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50">Cancel</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "quotes" && (
        <div>
          {mockQuotes.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
              <MessageSquare className="h-10 w-10 text-slate-300 mx-auto mb-3" />
              <h3 className="font-semibold text-slate-900 mb-1">No quotes yet</h3>
              <p className="text-slate-500 text-sm mb-4">Search for garages to request quotes</p>
              <Link href="/search"><Button>Find Garages</Button></Link>
            </div>
          ) : (
            <div>
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-4 flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-orange-500 flex-shrink-0" />
                <p className="text-sm text-orange-700">
                  You have <strong>{mockQuotes.length} quotes</strong> waiting for your review. Compare and book the best deal!
                </p>
              </div>
              <div className="space-y-3">
                {mockQuotes.map((quote) => (
                  <div key={quote.id} className="bg-white rounded-xl border border-gray-200 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <h3 className="font-bold text-slate-900">{getServiceLabel(quote.serviceType)}</h3>
                        <p className="text-sm text-slate-500">{quote.garage.name} · {quote.garage.city}</p>
                        <p className="text-xs text-slate-400 mt-1">{formatDateShort(quote.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="text-xl font-bold text-slate-900">{formatCurrency(quote.price ?? 0)}</div>
                          <div className="text-xs text-slate-400">Quote price</div>
                        </div>
                        <Button size="sm" className="gap-1.5">
                          Book Now
                          <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "vehicles" && (
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            {[
              { reg: "AB12 CDE", make: "Ford", model: "Focus", year: 2019, fuel: "Petrol" },
              { reg: "XY22 FGH", make: "VW", model: "Golf", year: 2022, fuel: "Petrol" },
            ].map((v) => (
              <div key={v.reg} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-[#1E3A5F] rounded-xl flex items-center justify-center flex-shrink-0">
                    <Car className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <div className="plate-number text-sm">{v.reg}</div>
                    <p className="font-semibold text-slate-900 mt-1">{v.year} {v.make} {v.model}</p>
                    <p className="text-xs text-slate-500">{v.fuel}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
          <Button variant="outline" className="gap-2">
            <Plus className="h-4 w-4" />
            Add Vehicle
          </Button>
        </div>
      )}
    </div>
  )
}
