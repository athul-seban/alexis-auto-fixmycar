"use client"

import { useState, useEffect, useCallback } from "react"
import {
  LayoutDashboard, Building2, Users, Calendar, TrendingUp,
  CheckCircle, XCircle, AlertCircle, Search,
  LogOut, Wrench, ChevronUp, ChevronDown, Ban, RotateCcw,
  ChevronLeft, ChevronRight, X,
} from "lucide-react"
import { signOut } from "next-auth/react"
import { formatCurrency, formatDateShort, getStatusColor } from "@/lib/utils"

interface User {
  name?: string | null
  email?: string | null
}

interface Stats {
  totalUsers: number
  userGrowth: number
  totalGarages: number
  garageGrowth: number
  totalBookings: number
  bookingGrowth: number
  revenue: number
  revenueGrowth: number
  pendingApprovals: number
}

interface GarageRow {
  id: string
  name: string
  city: string
  postcode: string
  email: string
  phone: string
  services: string
  status: string
  createdAt: string
  user: { name: string | null; email: string; phone: string | null }
}

interface UserRow {
  id: string
  name: string | null
  email: string
  role: string
  bookings: number
  joinedAt: string
}

interface BookingRow {
  id: string
  serviceType: string
  status: string
  totalPrice: number
  scheduledAt: string
  garage: string
  customer: string
}

interface Toast {
  message: string
  type: "success" | "error"
}

const navItems = [
  { icon: LayoutDashboard, label: "Overview", id: "overview" },
  { icon: Building2, label: "Garages", id: "garages" },
  { icon: Users, label: "Users", id: "users" },
  { icon: Calendar, label: "Bookings", id: "bookings" },
  { icon: TrendingUp, label: "Analytics", id: "analytics" },
]

const GARAGE_STATUS_TABS = ["PENDING", "APPROVED", "SUSPENDED"] as const
const BOOKING_STATUS_TABS = ["", "PENDING", "CONFIRMED", "IN_PROGRESS", "COMPLETED", "CANCELLED"] as const
const PAGE_SIZE = 8

function parseServices(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-5 pt-4 border-t border-slate-800">
      <span className="text-xs text-slate-500">Page {page} of {totalPages}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors"
        >
          Next <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  )
}

interface Props {
  user: User
}

export function AdminDashboard({ user }: Props) {
  const [activeSection, setActiveSection] = useState("overview")
  const [toast, setToast] = useState<Toast | null>(null)

  const showToast = useCallback((message: string, type: Toast["type"] = "success") => {
    setToast({ message, type })
    setTimeout(() => setToast(null), type === "error" ? 5000 : 3000)
  }, [])

  const [stats, setStats] = useState<Stats | null>(null)
  const [pendingPreview, setPendingPreview] = useState<GarageRow[]>([])
  const [recentBookings, setRecentBookings] = useState<BookingRow[]>([])

  const [garageStatus, setGarageStatus] = useState<(typeof GARAGE_STATUS_TABS)[number]>("PENDING")
  const [garages, setGarages] = useState<GarageRow[]>([])
  const [garagesLoading, setGaragesLoading] = useState(false)
  const [garageSearch, setGarageSearch] = useState("")
  const [garagePage, setGaragePage] = useState(1)
  const [garageTotalPages, setGarageTotalPages] = useState(1)
  const [garageCounts, setGarageCounts] = useState({ PENDING: 0, APPROVED: 0, SUSPENDED: 0 })
  const [garageActionPending, setGarageActionPending] = useState<string | null>(null)

  const [users, setUsers] = useState<UserRow[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [userSearch, setUserSearch] = useState("")
  const [userRole, setUserRole] = useState<"" | "OWNER" | "GARAGE" | "ADMIN">("")
  const [userPage, setUserPage] = useState(1)
  const [userTotalPages, setUserTotalPages] = useState(1)

  const [bookings, setBookings] = useState<BookingRow[]>([])
  const [bookingsLoading, setBookingsLoading] = useState(false)
  const [bookingStatus, setBookingStatus] = useState<(typeof BOOKING_STATUS_TABS)[number]>("")
  const [bookingFrom, setBookingFrom] = useState("")
  const [bookingTo, setBookingTo] = useState("")
  const [bookingPage, setBookingPage] = useState(1)
  const [bookingTotalPages, setBookingTotalPages] = useState(1)
  const [bookingCounts, setBookingCounts] = useState<Record<string, number>>({})

  const refreshStats = useCallback(() => {
    fetch("/api/admin/stats")
      .then((res) => res.json())
      .then((data) => setStats(data))
      .catch(() => {})
  }, [])

  useEffect(() => {
    refreshStats()
    fetch("/api/admin/garages?status=PENDING&pageSize=3")
      .then((res) => res.json())
      .then((data) => setPendingPreview(data.garages ?? []))
      .catch(() => {})
    fetch("/api/admin/bookings?pageSize=4")
      .then((res) => res.json())
      .then((data) => setRecentBookings(data.bookings ?? []))
      .catch(() => {})
  }, [refreshStats])

  // Garages: reset to page 1 whenever the status tab or search term changes
  useEffect(() => { setGaragePage(1) }, [garageStatus, garageSearch])

  const fetchGarages = useCallback(() => {
    const params = new URLSearchParams({ status: garageStatus, page: String(garagePage), pageSize: String(PAGE_SIZE) })
    if (garageSearch.trim()) params.set("q", garageSearch.trim())
    return fetch(`/api/admin/garages?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setGarages(data.garages ?? [])
        setGarageTotalPages(data.totalPages ?? 1)
        if (data.counts) setGarageCounts(data.counts)
      })
      .catch(() => setGarages([]))
  }, [garageStatus, garageSearch, garagePage])

  useEffect(() => {
    if (activeSection !== "garages") return
    setGaragesLoading(true)
    const timeout = setTimeout(() => {
      fetchGarages().finally(() => setGaragesLoading(false))
    }, 250)
    return () => clearTimeout(timeout)
  }, [activeSection, fetchGarages])

  // Users: reset to page 1 whenever role or search changes
  useEffect(() => { setUserPage(1) }, [userRole, userSearch])

  useEffect(() => {
    if (activeSection !== "users") return
    setUsersLoading(true)
    const timeout = setTimeout(() => {
      const params = new URLSearchParams({ page: String(userPage), pageSize: String(PAGE_SIZE) })
      if (userSearch.trim()) params.set("q", userSearch.trim())
      if (userRole) params.set("role", userRole)
      fetch(`/api/admin/users?${params.toString()}`)
        .then((res) => res.json())
        .then((data) => {
          setUsers(data.users ?? [])
          setUserTotalPages(data.totalPages ?? 1)
        })
        .catch(() => setUsers([]))
        .finally(() => setUsersLoading(false))
    }, 250)
    return () => clearTimeout(timeout)
  }, [activeSection, userSearch, userRole, userPage])

  // Bookings: reset to page 1 whenever status or date filters change
  useEffect(() => { setBookingPage(1) }, [bookingStatus, bookingFrom, bookingTo])

  useEffect(() => {
    if (activeSection !== "bookings") return
    setBookingsLoading(true)
    const params = new URLSearchParams({ page: String(bookingPage), pageSize: String(PAGE_SIZE) })
    if (bookingStatus) params.set("status", bookingStatus)
    if (bookingFrom) params.set("from", bookingFrom)
    if (bookingTo) params.set("to", bookingTo)
    fetch(`/api/admin/bookings?${params.toString()}`)
      .then((res) => res.json())
      .then((data) => {
        setBookings(data.bookings ?? [])
        setBookingTotalPages(data.totalPages ?? 1)
        if (data.counts) setBookingCounts(data.counts)
      })
      .catch(() => setBookings([]))
      .finally(() => setBookingsLoading(false))
  }, [activeSection, bookingStatus, bookingFrom, bookingTo, bookingPage])

  async function handleGarageAction(garageId: string, action: "approve" | "reject" | "suspend") {
    setGarageActionPending(garageId)
    try {
      const res = await fetch("/api/admin/garages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ garageId, action }),
      })
      if (!res.ok) throw new Error("Action failed")
      setPendingPreview((prev) => prev.filter((g) => g.id !== garageId))
      await fetchGarages()
      refreshStats()
      showToast(
        action === "approve" ? "Garage approved" : action === "reject" ? "Garage rejected" : "Garage suspended"
      )
    } catch {
      showToast("Something went wrong. Please try again.", "error")
    } finally {
      setGarageActionPending(null)
    }
  }

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Toast */}
      {toast && (
        <div
          className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ${
            toast.type === "success" ? "bg-green-600 text-white" : "bg-red-600 text-white"
          }`}
        >
          {toast.type === "success" ? <CheckCircle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
          {toast.message}
          <button onClick={() => setToast(null)} className="cursor-pointer opacity-80 hover:opacity-100">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Sidebar */}
      <aside className="w-64 bg-slate-900 flex-shrink-0 flex flex-col">
        <div className="p-5 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-[#F97316] rounded-lg flex items-center justify-center">
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold">Quote My Garage</div>
              <div className="text-slate-400 text-xs">Admin Panel</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveSection(item.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                activeSection === item.id
                  ? "bg-[#F97316] text-white"
                  : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
              {item.id === "garages" && !!stats?.pendingApprovals && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {stats.pendingApprovals}
                </span>
              )}
            </button>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-[#1E3A5F] rounded-full flex items-center justify-center text-white text-sm font-bold">
              A
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user.name ?? "Admin"}</div>
              <div className="text-slate-400 text-xs truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white text-sm transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto bg-slate-950">
        <div className="p-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-white capitalize">{activeSection}</h1>
            <p className="text-slate-400 text-sm mt-0.5">
              {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
            </p>
          </div>

          {activeSection === "overview" && (
            <div>
              {/* Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {[
                  { label: "Total Users", value: stats?.totalUsers, change: stats?.userGrowth, icon: Users, color: "text-blue-400" },
                  { label: "Total Garages", value: stats?.totalGarages, change: stats?.garageGrowth, icon: Building2, color: "text-orange-400" },
                  { label: "Total Bookings", value: stats?.totalBookings, change: stats?.bookingGrowth, icon: Calendar, color: "text-green-400" },
                  { label: "Revenue (completed)", value: stats ? formatCurrency(stats.revenue) : undefined, change: stats?.revenueGrowth, icon: TrendingUp, color: "text-purple-400" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      {stat.change !== undefined && (
                        <div className={`flex items-center gap-1 text-xs font-medium ${stat.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                          {stat.change >= 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          {Math.abs(stat.change)}%
                        </div>
                      )}
                    </div>
                    <div className="text-2xl font-bold text-white">
                      {stat.value ?? <span className="inline-block h-7 w-16 bg-slate-800 rounded animate-pulse" />}
                    </div>
                    <div className="text-sm text-slate-400 mt-0.5">{stat.label}</div>
                  </div>
                ))}
              </div>

              {/* Pending Approvals */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6 mb-6">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <AlertCircle className="h-5 w-5 text-orange-400" />
                    Pending Garage Approvals
                    <span className="bg-orange-500/20 text-orange-400 text-xs font-bold px-2 py-0.5 rounded-full">
                      {stats?.pendingApprovals ?? pendingPreview.length}
                    </span>
                  </h2>
                  <button
                    onClick={() => { setGarageStatus("PENDING"); setActiveSection("garages") }}
                    className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    View all →
                  </button>
                </div>
                {pendingPreview.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">No pending approvals.</p>
                ) : (
                  <div className="space-y-3">
                    {pendingPreview.map((garage) => (
                      <div key={garage.id} className="flex items-center justify-between p-4 bg-slate-800 rounded-xl">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                            {garage.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-white font-semibold text-sm">{garage.name}</div>
                            <div className="text-slate-400 text-xs">{garage.city} · {formatDateShort(garage.createdAt)}</div>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleGarageAction(garage.id, "approve")}
                            disabled={garageActionPending === garage.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <CheckCircle className="h-3.5 w-3.5" />
                            Approve
                          </button>
                          <button
                            onClick={() => handleGarageAction(garage.id, "reject")}
                            disabled={garageActionPending === garage.id}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="h-3.5 w-3.5" />
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Recent Bookings */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h2 className="text-lg font-bold text-white mb-5">Recent Bookings</h2>
                {recentBookings.length === 0 ? (
                  <p className="text-slate-500 text-sm text-center py-6">No bookings yet.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-slate-800">
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Service</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Garage</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Customer</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Date</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Amount</th>
                          <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {recentBookings.map((b) => (
                          <tr key={b.id} className="hover:bg-slate-800/50 transition-colors">
                            <td className="py-3 text-sm text-white font-medium">{b.serviceType.replace(/_/g, " ")}</td>
                            <td className="py-3 text-sm text-slate-300">{b.garage}</td>
                            <td className="py-3 text-sm text-slate-300">{b.customer}</td>
                            <td className="py-3 text-sm text-slate-400">{formatDateShort(b.scheduledAt)}</td>
                            <td className="py-3 text-sm text-white font-semibold">{formatCurrency(b.totalPrice)}</td>
                            <td className="py-3">
                              <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(b.status)}`}>
                                {b.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeSection === "garages" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {GARAGE_STATUS_TABS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setGarageStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        garageStatus === s ? "bg-[#F97316] text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {s.charAt(0) + s.slice(1).toLowerCase()} ({garageCounts[s] ?? 0})
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    value={garageSearch}
                    onChange={(e) => setGarageSearch(e.target.value)}
                    placeholder="Search garages..."
                    className="h-9 pl-9 pr-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] placeholder:text-slate-500"
                  />
                </div>
              </div>

              {garagesLoading ? (
                <p className="text-slate-500 text-sm text-center py-10">Loading…</p>
              ) : garages.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">No {garageStatus.toLowerCase()} garages.</p>
              ) : (
                <div className="space-y-3">
                  {garages.map((garage) => (
                    <div key={garage.id} className="flex items-center justify-between p-4 bg-slate-800 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#1E3A5F] rounded-xl flex items-center justify-center text-white font-bold">
                          {garage.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-white font-semibold">{garage.name}</div>
                          <div className="text-slate-400 text-sm">{garage.city}, {garage.postcode} · {garage.email}</div>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {parseServices(garage.services).map((s) => (
                              <span key={s} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-slate-400">
                          <div>Submitted</div>
                          <div>{formatDateShort(garage.createdAt)}</div>
                        </div>
                        <div className="flex gap-2">
                          {garageStatus === "PENDING" && (
                            <>
                              <button onClick={() => handleGarageAction(garage.id, "approve")} disabled={garageActionPending === garage.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50">
                                <CheckCircle className="h-3.5 w-3.5" /> Approve
                              </button>
                              <button onClick={() => handleGarageAction(garage.id, "reject")} disabled={garageActionPending === garage.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50">
                                <XCircle className="h-3.5 w-3.5" /> Reject
                              </button>
                            </>
                          )}
                          {garageStatus === "APPROVED" && (
                            <button onClick={() => handleGarageAction(garage.id, "suspend")} disabled={garageActionPending === garage.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50">
                              <Ban className="h-3.5 w-3.5" /> Suspend
                            </button>
                          )}
                          {garageStatus === "SUSPENDED" && (
                            <button onClick={() => handleGarageAction(garage.id, "approve")} disabled={garageActionPending === garage.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors disabled:opacity-50">
                              <RotateCcw className="h-3.5 w-3.5" /> Reactivate
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <Pagination page={garagePage} totalPages={garageTotalPages} onChange={setGaragePage} />
            </div>
          )}

          {activeSection === "users" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-white">User Management</h2>
                <div className="flex items-center gap-1.5">
                  {(["", "OWNER", "GARAGE", "ADMIN"] as const).map((r) => (
                    <button
                      key={r || "ALL"}
                      onClick={() => setUserRole(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        userRole === r ? "bg-[#F97316] text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {r === "" ? "All" : r.charAt(0) + r.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="h-9 pl-9 pr-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] placeholder:text-slate-500"
                  />
                </div>
              </div>
              {usersLoading ? (
                <p className="text-slate-500 text-sm text-center py-10">Loading…</p>
              ) : users.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">No users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800">
                        {["Name", "Email", "Role", "Bookings", "Joined"].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {(u.name ?? u.email).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-sm text-white font-medium">{u.name ?? "—"}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-sm text-slate-400">{u.email}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === "GARAGE" ? "bg-orange-500/20 text-orange-400" : u.role === "ADMIN" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-slate-300">{u.bookings}</td>
                          <td className="py-3 pr-4 text-sm text-slate-400">{formatDateShort(u.joinedAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={userPage} totalPages={userTotalPages} onChange={setUserPage} />
            </div>
          )}

          {activeSection === "bookings" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-white">All Bookings</h2>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BOOKING_STATUS_TABS.map((s) => (
                    <button
                      key={s || "ALL"}
                      onClick={() => setBookingStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        bookingStatus === s ? "bg-[#F97316] text-white" : "bg-slate-800 text-slate-400 hover:text-white"
                      }`}
                    >
                      {s === "" ? "All" : s.replace(/_/g, " ")} ({s === "" ? Object.values(bookingCounts).reduce((a, b) => a + b, 0) : bookingCounts[s] ?? 0})
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  From
                  <input
                    type="date"
                    value={bookingFrom}
                    onChange={(e) => setBookingFrom(e.target.value)}
                    className="h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-slate-400">
                  To
                  <input
                    type="date"
                    value={bookingTo}
                    onChange={(e) => setBookingTo(e.target.value)}
                    className="h-8 px-2 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-xs focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                  />
                </label>
                {(bookingFrom || bookingTo) && (
                  <button
                    onClick={() => { setBookingFrom(""); setBookingTo("") }}
                    className="text-xs text-slate-400 hover:text-white underline cursor-pointer"
                  >
                    Clear dates
                  </button>
                )}
              </div>
              {bookingsLoading ? (
                <p className="text-slate-500 text-sm text-center py-10">Loading…</p>
              ) : bookings.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-10">No bookings match these filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-slate-800">
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Service</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Garage</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Customer</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Date</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Amount</th>
                        <th className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {bookings.map((b) => (
                        <tr key={b.id} className="hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 text-sm text-white font-medium">{b.serviceType.replace(/_/g, " ")}</td>
                          <td className="py-3 text-sm text-slate-300">{b.garage}</td>
                          <td className="py-3 text-sm text-slate-300">{b.customer}</td>
                          <td className="py-3 text-sm text-slate-400">{formatDateShort(b.scheduledAt)}</td>
                          <td className="py-3 text-sm text-white font-semibold">{formatCurrency(b.totalPrice)}</td>
                          <td className="py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${getStatusColor(b.status)}`}>
                              {b.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <Pagination page={bookingPage} totalPages={bookingTotalPages} onChange={setBookingPage} />
            </div>
          )}

          {activeSection === "analytics" && (
            <div className="text-center py-20 text-slate-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold text-slate-300 mb-1">Analytics Coming Soon</h3>
              <p className="text-sm">This section will be available in a future update.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
