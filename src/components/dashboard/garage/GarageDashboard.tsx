"use client"

import { useState, useEffect, useCallback } from "react"
import {
  Car, MessageSquare, Star, CheckCircle, Clock,
  Eye, Send, XCircle, Phone, MapPin, Briefcase, AlertCircle, Loader2
} from "lucide-react"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { RespondToJobForm } from "@/components/dashboard/garage/RespondToJobForm"
import { GarageAnalytics } from "@/components/dashboard/garage/GarageAnalytics"
import { GarageProfileEditor } from "@/components/dashboard/garage/GarageProfileEditor"
import { MessageThread } from "@/components/shared/MessageThread"
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

interface QuoteItem {
  id: string
  serviceType: string
  description: string
  status: string
  price: number | null
  createdAt: string
  vehicle: { registration: string; make: string; model: string; year: number }
  owner: { id: string; name: string | null; phone: string | null }
}

interface BookingItem {
  id: string
  serviceType: string
  status: string
  scheduledAt: string
  totalPrice: number
  vehicle: { registration: string; make: string; model: string }
  owner: { id: string; name: string | null }
}

interface User {
  id: string
  name?: string | null
  email?: string | null
}

interface Props {
  user: User
}

export function GarageDashboard({ user }: Props) {
  const [activeTab, setActiveTab] = useState<"quotes" | "jobs" | "bookings" | "analytics" | "profile">("quotes")
  const [jobRequests, setJobRequests] = useState<JobRequestItem[]>([])
  const [quotes, setQuotes] = useState<QuoteItem[]>([])
  const [bookings, setBookings] = useState<BookingItem[]>([])
  const [loading, setLoading] = useState(true)
  const [expandedThread, setExpandedThread] = useState<string | null>(null)
  const [garageSlug, setGarageSlug] = useState<string | null>(null)

  const loadAll = useCallback(() => {
    setLoading(true)
    Promise.all([
      fetch("/api/job-requests").then((r) => r.json()),
      fetch("/api/quotes").then((r) => r.json()),
      fetch("/api/bookings").then((r) => r.json()),
      fetch("/api/garage/me").then((r) => r.json()),
    ])
      .then(([j, q, b, g]) => {
        setJobRequests(j.jobRequests ?? [])
        setQuotes(q.quotes ?? [])
        setBookings(b.bookings ?? [])
        setGarageSlug(g.garage?.slug ?? null)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadAll()
  }, [loadAll])

  const updateBookingStatus = async (bookingId: string, status: string) => {
    const res = await fetch("/api/bookings", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingId, status }),
    })
    if (res.ok) {
      setBookings((prev) => prev.map((b) => (b.id === bookingId ? { ...b, status } : b)))
    }
  }

  const newLeadCount = jobRequests.filter((j) => !j.hasResponded).length
  const pendingQuoteCount = quotes.filter((q) => q.status === "PENDING").length
  const activeBookingCount = bookings.filter((b) => !["COMPLETED", "CANCELLED"].includes(b.status)).length

  const stats = [
    { label: "Quote Requests", value: String(pendingQuoteCount), icon: MessageSquare, color: "text-blue-500 dark:text-blue-400", bg: "bg-blue-50 dark:bg-blue-500/10" },
    { label: "New Job Leads", value: String(newLeadCount), icon: Briefcase, color: "text-purple-500 dark:text-purple-400", bg: "bg-purple-50 dark:bg-purple-500/10" },
    { label: "Active Bookings", value: String(activeBookingCount), icon: Car, color: "text-orange-500 dark:text-orange-400", bg: "bg-orange-50 dark:bg-orange-500/10" },
    { label: "Avg Rating", value: "—", icon: Star, color: "text-yellow-500 dark:text-yellow-400", bg: "bg-yellow-50 dark:bg-yellow-500/10" },
  ]

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Garage Dashboard</h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Manage quotes, bookings and your profile</p>
        </div>
        {garageSlug && (
          <Link href={`/garage/${garageSlug}`}>
            <Button variant="outline" className="gap-2">
              <Eye className="h-4 w-4" />
              View My Profile
            </Button>
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-4">
            <div className={`w-10 h-10 ${stat.bg} rounded-xl flex items-center justify-center mb-3`}>
              <stat.icon className={`h-5 w-5 ${stat.color}`} />
            </div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white">{stat.value}</div>
            <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-white dark:bg-slate-800 rounded-xl p-1 border border-gray-200 dark:border-white/10 mb-6 w-fit flex-wrap">
        {(["quotes", "jobs", "bookings", "analytics", "profile"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 text-sm font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
              activeTab === tab ? "bg-[#1E3A5F] text-white" : "text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5"
            }`}
          >
            {tab === "quotes"
              ? `Quote Requests (${pendingQuoteCount})`
              : tab === "jobs"
              ? `Job Requests (${newLeadCount})`
              : tab === "analytics"
              ? "Analytics"
              : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" /></div>
      ) : (
        <>
          {activeTab === "quotes" && (
            <div className="space-y-4">
              {quotes.length === 0 ? (
                <EmptyState icon={MessageSquare} title="No quote requests yet" subtitle="Owner-submitted quote requests will show up here." />
              ) : (
                quotes.map((quote) => (
                  <div key={quote.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-slate-900 dark:text-white">{getServiceLabel(quote.serviceType)}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(quote.status)}`}>
                            {quote.status}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{formatDateShort(quote.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{quote.description}</p>
                        <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1.5">
                            <div className="plate-number text-xs">{quote.vehicle.registration}</div>
                            <span>{quote.vehicle.year} {quote.vehicle.make} {quote.vehicle.model}</span>
                          </div>
                          {quote.owner.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3.5 w-3.5" />
                              <span>{quote.owner.phone}</span>
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 sm:items-end">
                        {quote.status === "PENDING" ? (
                          <SendQuoteForm
                            quoteId={quote.id}
                            onSent={(updated) =>
                              setQuotes((prev) => prev.map((q) => (q.id === quote.id ? { ...q, ...updated } : q)))
                            }
                          />
                        ) : (
                          <div className="text-right">
                            <div className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(quote.price ?? 0)}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500">Quote sent</div>
                          </div>
                        )}
                        <button
                          onClick={() => setExpandedThread(expandedThread === quote.id ? null : quote.id)}
                          className="text-slate-400 dark:text-slate-500 hover:text-[#1E3A5F] dark:hover:text-white transition-colors"
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
                ))
              )}
            </div>
          )}

          {activeTab === "jobs" && (
            <div className="space-y-4">
              {jobRequests.length === 0 ? (
                <EmptyState icon={Briefcase} title="No job requests yet" subtitle="Guest-posted jobs matching your services and location will show up here." />
              ) : (
                jobRequests.map((job) => (
                  <div key={job.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
                    <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-bold text-slate-900 dark:text-white">{getServiceLabel(job.serviceType)}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(job.status)}`}>
                            {job.status}
                          </span>
                          <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{formatDateShort(job.createdAt)}</span>
                        </div>
                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{job.description}</p>
                        <div className="flex flex-wrap gap-3 text-sm text-slate-500 dark:text-slate-400">
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
                            <div className="text-lg font-bold text-green-600 dark:text-green-400">{formatCurrency(job.myResponse?.price ?? 0)}</div>
                            <div className="text-xs text-slate-400 dark:text-slate-500">Quote sent</div>
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
              {bookings.length === 0 ? (
                <EmptyState icon={Car} title="No bookings yet" subtitle="Confirmed bookings will appear here." />
              ) : (
                bookings.map((booking) => (
                  <div key={booking.id} className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-5">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-bold text-slate-900 dark:text-white">{getServiceLabel(booking.serviceType)}</h3>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(booking.status)}`}>
                            {booking.status}
                          </span>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                          {booking.vehicle.registration} · {booking.vehicle.make} {booking.vehicle.model}
                        </p>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 dark:text-slate-400">
                          <div className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {formatDateShort(booking.scheduledAt)}
                          </div>
                          <span>Customer: {booking.owner.name ?? "Guest"}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-slate-900 dark:text-white">{formatCurrency(booking.totalPrice)}</span>
                        <button
                          onClick={() => setExpandedThread(expandedThread === booking.id ? null : booking.id)}
                          className="text-slate-400 dark:text-slate-500 hover:text-[#1E3A5F] dark:hover:text-white transition-colors"
                        >
                          <MessageSquare className="h-4 w-4" />
                        </button>
                        {booking.status === "PENDING" && (
                          <Button size="sm" variant="primary" onClick={() => updateBookingStatus(booking.id, "CONFIRMED")}>
                            Confirm
                          </Button>
                        )}
                        {booking.status === "CONFIRMED" && (
                          <Button size="sm" variant="primary" className="gap-1.5" onClick={() => updateBookingStatus(booking.id, "IN_PROGRESS")}>
                            Start Job
                          </Button>
                        )}
                        {booking.status === "IN_PROGRESS" && (
                          <Button size="sm" variant="primary" className="gap-1.5" onClick={() => updateBookingStatus(booking.id, "COMPLETED")}>
                            <CheckCircle className="h-3.5 w-3.5" />
                            Mark Complete
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

          {activeTab === "analytics" && <GarageAnalytics />}

          {activeTab === "profile" && <GarageProfileEditor />}
        </>
      )}
    </div>
  )
}

function EmptyState({ icon: Icon, title, subtitle }: { icon: any; title: string; subtitle: string }) {
  return (
    <div className="text-center py-16 bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10">
      <Icon className="h-12 w-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
      <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-1">{title}</h3>
      <p className="text-slate-500 dark:text-slate-400 text-sm">{subtitle}</p>
    </div>
  )
}

function SendQuoteForm({ quoteId, onSent }: { quoteId: string; onSent: (updated: { status: string; price: number }) => void }) {
  const [open, setOpen] = useState(false)
  const [price, setPrice] = useState("")
  const [laborCost, setLaborCost] = useState("")
  const [partsCost, setPartsCost] = useState("")
  const [notes, setNotes] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  if (!open) {
    return (
      <Button size="sm" className="gap-1.5" onClick={() => setOpen(true)}>
        <Send className="h-3.5 w-3.5" />
        Send Quote
      </Button>
    )
  }

  const handleSend = async () => {
    setLoading(true)
    setError("")
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "respond",
          quoteId,
          price: parseFloat(price),
          laborCost: laborCost ? parseFloat(laborCost) : undefined,
          partsCost: partsCost ? parseFloat(partsCost) : undefined,
          notes: notes || undefined,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send quote")
      onSent(data.quote)
    } catch (err: any) {
      setError(err.message ?? "Failed to send quote")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col gap-2 w-56">
      {error && (
        <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
          <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
          {error}
        </div>
      )}
      <input
        type="number"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Total price (£)"
        className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
      <div className="grid grid-cols-2 gap-2">
        <input
          type="number"
          value={laborCost}
          onChange={(e) => setLaborCost(e.target.value)}
          placeholder="Labour (£)"
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />
        <input
          type="number"
          value={partsCost}
          onChange={(e) => setPartsCost(e.target.value)}
          placeholder="Parts (£)"
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
        />
      </div>
      <textarea
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes to customer (optional)"
        rows={2}
        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:placeholder:text-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
      />
      <div className="flex gap-2">
        <Button size="sm" className="flex-1 gap-1" loading={loading} disabled={!price} onClick={handleSend}>
          <Send className="h-3 w-3" />
          Send
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={loading}>
          <XCircle className="h-4 w-4 text-red-400 dark:text-red-500" />
        </Button>
      </div>
    </div>
  )
}
