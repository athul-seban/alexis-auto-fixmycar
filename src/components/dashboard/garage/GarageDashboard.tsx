"use client"

import { useState, useEffect } from "react"
import {
  BarChart3, Car, MessageSquare, Star, CheckCircle, Clock,
  TrendingUp, Eye, Send, XCircle, ChevronRight, Phone, MapPin, Briefcase
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RespondToJobForm } from "@/components/dashboard/garage/RespondToJobForm"
import { formatCurrency, formatDateShort, getServiceLabel, getStatusColor } from "@/lib/utils"

interface JobRequestItem {
  id: string
  serviceType: string
  description: string
  registration: string
  make: string
  model: string
  year: number
  city: string
  postcode: string
  guestName: string
  guestPhone: string
  status: string
  createdAt: string
  hasResponded: boolean
  myResponse: { price: number } | null
}

interface User {
  name?: string | null
  email?: string | null
}

const mockQuoteRequests = [
  {
    id: "1", serviceType: "MOT", description: "Need MOT test for Ford Focus 2019",
    status: "PENDING", createdAt: new Date("2024-02-10"),
    vehicle: { registration: "AB12 CDE", make: "Ford", model: "Focus", year: 2019 },
    owner: { name: "Sarah M.", phone: "07700 900001" },
  },
  {
    id: "2", serviceType: "BRAKES", description: "Brake pads and discs replacement needed, car pulling to one side",
    status: "PENDING", createdAt: new Date("2024-02-09"),
    vehicle: { registration: "XY56 JKL", make: "BMW", model: "3 Series", year: 2021 },
    owner: { name: "James P.", phone: "07700 900002" },
  },
  {
    id: "3", serviceType: "FULL_SERVICE", description: "Full service due, oil, filters, spark plugs",
    status: "SENT", price: 189.99, createdAt: new Date("2024-02-08"),
    vehicle: { registration: "MN34 OPQ", make: "Toyota", model: "Yaris", year: 2018 },
    owner: { name: "Emma T.", phone: "07700 900003" },
  },
]

const mockBookings = [
  {
    id: "1", serviceType: "MOT", status: "CONFIRMED", scheduledAt: new Date("2024-02-15"),
    totalPrice: 54.99, vehicle: { registration: "CD34 EFG", make: "Nissan", model: "Qashqai" },
    owner: { name: "David C." },
  },
  {
    id: "2", serviceType: "FULL_SERVICE", status: "COMPLETED", scheduledAt: new Date("2024-02-01"),
    totalPrice: 189.99, vehicle: { registration: "GH45 IJK", make: "Honda", model: "Civic" },
    owner: { name: "Sophie W." },
  },
]

interface Props {
  user: User
}

export function GarageDashboard({ user }: Props) {
  const [activeTab, setActiveTab] = useState<"quotes" | "jobs" | "bookings" | "profile">("quotes")
  const [jobRequests, setJobRequests] = useState<JobRequestItem[]>([])
  const [jobsLoading, setJobsLoading] = useState(true)

  useEffect(() => {
    fetch("/api/job-requests")
      .then((res) => res.json())
      .then((data) => setJobRequests(data.jobRequests ?? []))
      .catch(() => setJobRequests([]))
      .finally(() => setJobsLoading(false))
  }, [])

  const newLeadCount = jobRequests.filter((j) => !j.hasResponded).length

  const stats = [
    { label: "Quote Requests", value: "8", icon: MessageSquare, color: "text-blue-500", bg: "bg-blue-50", change: "+3 today" },
    { label: "New Job Leads", value: String(newLeadCount), icon: Briefcase, color: "text-purple-500", bg: "bg-purple-50", change: "Posted by guests" },
    { label: "Active Bookings", value: "12", icon: Car, color: "text-orange-500", bg: "bg-orange-50", change: "4 this week" },
    { label: "Avg Rating", value: "4.8★", icon: Star, color: "text-yellow-500", bg: "bg-yellow-50", change: "342 reviews" },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Garage Dashboard</h1>
          <p className="text-slate-500 text-sm mt-0.5">Manage quotes, bookings and your profile</p>
        </div>
        <Button variant="outline" className="gap-2">
          <Eye className="h-4 w-4" />
          View My Profile
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-4">
            <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mb-3`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900">{stat.value}</div>
            <div className="text-sm text-slate-500 mt-0.5">{stat.label}</div>
            <div className="text-xs text-slate-400 mt-1">{stat.change}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 border border-gray-200 mb-6 w-fit flex-wrap">
        {(["quotes", "jobs", "bookings", "profile"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
              activeTab === tab ? "bg-[#1E3A5F] text-white" : "text-slate-600 hover:bg-slate-50"
            }`}
          >
            {tab === "quotes"
              ? `Quote Requests (${mockQuoteRequests.filter((q) => q.status === "PENDING").length})`
              : tab === "jobs"
              ? `Job Requests (${newLeadCount})`
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "quotes" && (
        <div className="space-y-4">
          {mockQuoteRequests.map((quote) => (
            <div key={quote.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h3 className="font-bold text-slate-900">{getServiceLabel(quote.serviceType)}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(quote.status)}`}>
                      {quote.status}
                    </span>
                    <span className="text-xs text-slate-400 ml-auto">{formatDateShort(quote.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mb-3">{quote.description}</p>
                  <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <div className="plate-number text-xs">{quote.vehicle.registration}</div>
                      <span>{quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Phone className="h-3.5 w-3.5" />
                      <span>{quote.owner.phone}</span>
                    </div>
                  </div>
                </div>
                {quote.status === "PENDING" ? (
                  <div className="flex flex-col gap-2 sm:items-end">
                    <SendQuoteForm quoteId={quote.id} />
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="text-lg font-bold text-green-600">{formatCurrency((quote as any).price ?? 0)}</div>
                      <div className="text-xs text-slate-400">Quote sent</div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "jobs" && (
        <div className="space-y-4">
          {jobsLoading ? (
            [1, 2].map((i) => <div key={i} className="h-32 bg-white rounded-xl border border-gray-200 animate-pulse" />)
          ) : jobRequests.length === 0 ? (
            <div className="text-center py-16 bg-white rounded-xl border border-gray-200">
              <Briefcase className="h-12 w-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-lg font-semibold text-slate-900 mb-1">No job requests yet</h3>
              <p className="text-slate-500 text-sm">Guest-posted jobs matching your services and location will show up here.</p>
            </div>
          ) : (
            jobRequests.map((job) => (
              <div key={job.id} className="bg-white rounded-xl border border-gray-200 p-5">
                <div className="flex flex-col sm:flex-row gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="font-bold text-slate-900">{getServiceLabel(job.serviceType)}</h3>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(job.status)}`}>
                        {job.status}
                      </span>
                      <span className="text-xs text-slate-400 ml-auto">{formatDateShort(job.createdAt)}</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-3">{job.description}</p>
                    <div className="flex flex-wrap gap-3 text-sm text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <div className="plate-number text-xs">{job.registration}</div>
                        <span>{job.year} {job.make} {job.model}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{job.city}, {job.postcode}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Phone className="h-3.5 w-3.5" />
                        <span>{job.guestName} · {job.guestPhone}</span>
                      </div>
                    </div>
                  </div>
                  {job.hasResponded ? (
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <div className="text-lg font-bold text-green-600">{formatCurrency(job.myResponse?.price ?? 0)}</div>
                        <div className="text-xs text-slate-400">Quote sent</div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-2 sm:items-end">
                      <RespondToJobForm
                        jobRequestId={job.id}
                        onSent={(jobResponse) =>
                          setJobRequests((prev) =>
                            prev.map((j) => (j.id === job.id ? { ...j, hasResponded: true, myResponse: jobResponse } : j))
                          )
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === "bookings" && (
        <div className="space-y-4">
          {mockBookings.map((booking) => (
            <div key={booking.id} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="font-bold text-slate-900">{getServiceLabel(booking.serviceType)}</h3>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                      {booking.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {booking.vehicle.registration} · {booking.vehicle.make} {booking.vehicle.model}
                  </p>
                  <div className="flex items-center gap-4 mt-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {formatDateShort(booking.scheduledAt)}
                    </div>
                    <span>Customer: {booking.owner.name}</span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-lg font-bold text-slate-900">{formatCurrency(booking.totalPrice)}</span>
                  {booking.status === "CONFIRMED" && (
                    <Button size="sm" variant="primary" className="gap-1.5">
                      <CheckCircle className="h-3.5 w-3.5" />
                      Mark Complete
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === "profile" && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <h2 className="text-xl font-bold text-slate-900 mb-4">Garage Profile Settings</h2>
          <p className="text-slate-500 text-sm mb-6">Manage your public profile visible to customers.</p>
          <div className="space-y-4">
            {["Garage name", "Phone number", "Address", "Opening hours", "Services offered", "Description", "Photos"].map((field) => (
              <div key={field} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg">
                <span className="text-sm font-medium text-slate-700">{field}</span>
                <Button size="sm" variant="ghost" className="text-[#1E3A5F]">Edit</Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function SendQuoteForm({ quoteId }: { quoteId: string }) {
  const [price, setPrice] = useState("")
  const [notes, setNotes] = useState("")
  const [open, setOpen] = useState(false)

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" />
        Send Quote
      </Button>
    )
  }

  return (
    <div className="flex flex-col gap-2 w-48">
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Price (£)"
        className="h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 gap-1">
          <Send className="h-3 w-3" />
          Send
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
          <XCircle className="h-4 w-4 text-red-400" />
        </Button>
      </div>
    </div>
  )
}
