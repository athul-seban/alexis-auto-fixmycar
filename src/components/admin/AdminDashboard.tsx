"use client"

import { useState, useEffect, useCallback } from "react"
import {
  LayoutDashboard, Building2, Users, Calendar, TrendingUp,
  CheckCircle, XCircle, AlertCircle, Search,
  LogOut, Wrench, ChevronUp, ChevronDown, Ban, RotateCcw,
  ChevronLeft, ChevronRight, X, Bell, Star, UserPlus, ClipboardCheck,
} from "lucide-react"
import { signOut } from "next-auth/react"
import { formatCurrency, formatDateShort, getStatusColor } from "@/lib/utils"
import { RevenueTrendChart } from "@/components/admin/RevenueTrendChart"
import { ServiceBreakdownChart } from "@/components/admin/ServiceBreakdownChart"

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

interface Overview {
  revenueTrend: { date: string; revenue: number }[]
  serviceBreakdown: { serviceType: string; label: string; count: number }[]
  topCities: { city: string; garages: number; bookings: number; revenue: number }[]
  activity: { type: "booking" | "garage" | "review"; message: string; createdAt: string }[]
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

const glass = { background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(12px)" }
const glassSoft = { background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.07)", backdropFilter: "blur(12px)" }

function parseServices(json: string): string[] {
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function activityIcon(type: Overview["activity"][number]["type"]) {
  if (type === "booking") return <Calendar className="h-4 w-4 text-blue-400" />
  if (type === "garage") return <UserPlus className="h-4 w-4 text-orange-400" />
  return <Star className="h-4 w-4 text-yellow-400" />
}

function timeAgo(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diffMs / 60000)
  if (mins < 1) return "just now"
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function Pagination({
  page, totalPages, onChange,
}: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-between mt-5 pt-4 border-t border-white/10">
      <span className="text-xs text-blue-200/60">Page {page} of {totalPages}</span>
      <div className="flex items-center gap-2">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page <= 1}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-blue-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors border border-white/10"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Prev
        </button>
        <button
          onClick={() => onChange(page + 1)}
          disabled={page >= totalPages}
          className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white/5 text-blue-100 hover:bg-white/10 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer transition-colors border border-white/10"
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
  const [overview, setOverview] = useState<Overview | null>(null)

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
    fetch("/api/admin/overview")
      .then((res) => res.json())
      .then((data) => setOverview(data))
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

  const firstName = (user.name ?? "Admin").split(" ")[0]

  return (
    <div
      className="flex h-screen overflow-hidden relative"
      style={{ background: "linear-gradient(135deg, #0a1628 0%, #0f1f3d 40%, #1E3A5F 100%)" }}
    >
      {/* Subtle grid + glow, matching site's GarageCTA treatment */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.8) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />
      <div className="absolute top-0 right-0 w-[500px] h-[400px] bg-orange-500/8 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[400px] h-[300px] bg-blue-500/8 rounded-full blur-[100px] pointer-events-none" />

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
      <aside className="w-64 flex-shrink-0 flex flex-col relative z-10" style={{ ...glassSoft, borderRadius: 0, borderTop: "none", borderBottom: "none", borderLeft: "none" }}>
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" }}
            >
              <Wrench className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="text-white font-extrabold text-sm tracking-tight">
                Quote<span className="text-[#F97316]">MyGarage</span>
              </div>
              <div className="text-blue-200/50 text-xs">Admin Panel</div>
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
                  : "text-blue-200/70 hover:bg-white/5 hover:text-white"
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

        <div className="p-4 border-t border-white/10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-8 h-8 bg-[#F97316] rounded-full flex items-center justify-center text-white text-sm font-bold">
              {firstName[0]?.toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-white text-sm font-medium truncate">{user.name ?? "Admin"}</div>
              <div className="text-blue-200/50 text-xs truncate">{user.email}</div>
            </div>
          </div>
          <button
            onClick={() => signOut({ callbackUrl: "/" })}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-blue-200/70 hover:bg-white/5 hover:text-white text-sm transition-colors cursor-pointer"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto relative z-10">
        {/* Top bar */}
        <div className="flex items-center justify-between gap-4 px-8 py-4 border-b border-white/10">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/40" />
            <input
              placeholder="Search garages, users, bookings..."
              className="w-full h-10 pl-9 pr-4 rounded-xl text-sm text-white placeholder:text-blue-200/40 focus:outline-none focus:ring-2 focus:ring-[#F97316]"
              style={glass}
            />
          </div>
          <div className="flex items-center gap-4 flex-shrink-0">
            <button
              onClick={() => { setGarageStatus("PENDING"); setActiveSection("garages") }}
              className="relative w-10 h-10 rounded-xl flex items-center justify-center text-blue-200/70 hover:text-white transition-colors cursor-pointer"
              style={glass}
              aria-label="Pending garage approvals"
            >
              <Bell className="h-4 w-4" />
              {!!stats?.pendingApprovals && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold w-4 h-4 rounded-full flex items-center justify-center">
                  {stats.pendingApprovals}
                </span>
              )}
            </button>
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#F97316] flex items-center justify-center text-white text-sm font-bold">
                {firstName[0]?.toUpperCase()}
              </div>
              <div className="hidden sm:block">
                <div className="text-white text-sm font-semibold leading-tight">{user.name ?? "Admin"}</div>
                <div className="text-blue-200/50 text-xs leading-tight">Administrator</div>
              </div>
            </div>
          </div>
        </div>

        <div className="p-8">
          {activeSection === "overview" ? (
            <div className="mb-8">
              <span className="inline-block text-[#F97316] font-bold text-xs uppercase tracking-[0.15em] mb-2">
                Welcome back
              </span>
              <h1 className="text-3xl font-extrabold text-white tracking-tight">{firstName}</h1>
              <p className="text-blue-200/60 text-sm mt-1">Here&apos;s what&apos;s happening on Quote My Garage today.</p>
            </div>
          ) : (
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-white capitalize">{activeSection}</h1>
              <p className="text-blue-200/60 text-sm mt-0.5">
                {new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
              </p>
            </div>
          )}

          {activeSection === "overview" && (
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <div className="xl:col-span-2 space-y-6">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[
                    { label: "Total Users", value: stats?.totalUsers, change: stats?.userGrowth, icon: Users, color: "#60A5FA" },
                    { label: "Total Garages", value: stats?.totalGarages, change: stats?.garageGrowth, icon: Building2, color: "#F97316" },
                    { label: "Total Bookings", value: stats?.totalBookings, change: stats?.bookingGrowth, icon: Calendar, color: "#34D399" },
                    { label: "Revenue", value: stats ? formatCurrency(stats.revenue) : undefined, change: stats?.revenueGrowth, icon: TrendingUp, color: "#A78BFA" },
                  ].map((stat) => (
                    <div key={stat.label} className="rounded-2xl p-5" style={glass}>
                      <div className="flex items-center justify-between mb-4">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: `${stat.color}22` }}>
                          <stat.icon className="h-4.5 w-4.5" style={{ color: stat.color }} />
                        </div>
                        {stat.change !== undefined && (
                          <div className={`flex items-center gap-1 text-xs font-medium ${stat.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                            {stat.change >= 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                            {Math.abs(stat.change)}%
                          </div>
                        )}
                      </div>
                      <div className="text-2xl font-bold text-white">
                        {stat.value ?? <span className="inline-block h-7 w-16 bg-white/10 rounded animate-pulse" />}
                      </div>
                      <div className="text-sm text-blue-200/60 mt-0.5">{stat.label}</div>
                    </div>
                  ))}
                </div>

                {/* Revenue trend */}
                <div className="rounded-2xl p-6" style={glass}>
                  <h2 className="text-white font-bold mb-1">Revenue (last 30 days)</h2>
                  <p className="text-blue-200/50 text-xs mb-4">Completed bookings only</p>
                  {overview ? (
                    <RevenueTrendChart data={overview.revenueTrend} />
                  ) : (
                    <div className="h-[220px] bg-white/5 rounded-lg animate-pulse" />
                  )}
                </div>

                {/* Service breakdown + Top cities */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="rounded-2xl p-6" style={glass}>
                    <h2 className="text-white font-bold mb-4">Bookings by Service</h2>
                    {overview ? (
                      <ServiceBreakdownChart data={overview.serviceBreakdown} />
                    ) : (
                      <div className="h-40 bg-white/5 rounded-lg animate-pulse" />
                    )}
                  </div>

                  <div className="rounded-2xl p-6" style={glass}>
                    <h2 className="text-white font-bold mb-4">Top Cities</h2>
                    {!overview || overview.topCities.length === 0 ? (
                      <p className="text-blue-200/50 text-sm text-center py-8">No garages yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {overview.topCities.map((c) => (
                          <div key={c.city} className="flex items-center justify-between text-sm">
                            <span className="text-white font-medium">{c.city}</span>
                            <div className="flex items-center gap-4 text-xs">
                              <span className="text-blue-200/60">{c.garages} garages</span>
                              <span className="text-blue-200/60">{c.bookings} bookings</span>
                              <span className="text-[#F97316] font-semibold w-16 text-right">{formatCurrency(c.revenue)}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* Pending Approvals */}
                <div className="rounded-2xl p-6" style={glass}>
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
                      className="text-sm text-blue-200/60 hover:text-white transition-colors cursor-pointer"
                    >
                      View all →
                    </button>
                  </div>
                  {pendingPreview.length === 0 ? (
                    <p className="text-blue-200/50 text-sm text-center py-6">No pending approvals.</p>
                  ) : (
                    <div className="space-y-3">
                      {pendingPreview.map((garage) => (
                        <div key={garage.id} className="flex items-center justify-between p-4 rounded-xl" style={glassSoft}>
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                              {garage.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                            </div>
                            <div>
                              <div className="text-white font-semibold text-sm">{garage.name}</div>
                              <div className="text-blue-200/50 text-xs">{garage.city} · {formatDateShort(garage.createdAt)}</div>
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
              </div>

              {/* Right column */}
              <div className="space-y-6">
                {/* Quick Actions */}
                <div className="rounded-2xl p-6" style={glass}>
                  <h2 className="text-white font-bold mb-4">Quick Actions</h2>
                  <div className="space-y-2">
                    {[
                      { label: "Review Pending Garages", icon: ClipboardCheck, onClick: () => { setGarageStatus("PENDING"); setActiveSection("garages") } },
                      { label: "View All Bookings", icon: Calendar, onClick: () => setActiveSection("bookings") },
                      { label: "View All Users", icon: Users, onClick: () => setActiveSection("users") },
                    ].map((action) => (
                      <button
                        key={action.label}
                        onClick={action.onClick}
                        className="w-full flex items-center gap-3 p-3 rounded-xl text-sm font-medium text-blue-100 hover:bg-white/5 transition-colors cursor-pointer"
                        style={glassSoft}
                      >
                        <div className="w-8 h-8 rounded-lg bg-[#F97316]/20 flex items-center justify-center flex-shrink-0">
                          <action.icon className="h-4 w-4 text-[#F97316]" />
                        </div>
                        {action.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Recent Activity */}
                <div className="rounded-2xl p-6" style={glass}>
                  <h2 className="text-white font-bold mb-4">Recent Activity</h2>
                  {!overview || overview.activity.length === 0 ? (
                    <p className="text-blue-200/50 text-sm text-center py-6">No activity yet.</p>
                  ) : (
                    <div className="space-y-4">
                      {overview.activity.map((a, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 mt-0.5">
                            {activityIcon(a.type)}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm text-blue-100 leading-snug">{a.message}</p>
                            <span className="text-xs text-blue-200/40">{timeAgo(a.createdAt)}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Latest Bookings */}
                <div className="rounded-2xl p-6" style={glass}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-white font-bold">Latest Bookings</h2>
                    <button onClick={() => setActiveSection("bookings")} className="text-xs text-blue-200/60 hover:text-white cursor-pointer">
                      View all →
                    </button>
                  </div>
                  {recentBookings.length === 0 ? (
                    <p className="text-blue-200/50 text-sm text-center py-6">No bookings yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {recentBookings.map((b) => (
                        <div key={b.id} className="flex items-center justify-between">
                          <div className="min-w-0">
                            <div className="text-sm text-white font-medium truncate">{b.garage}</div>
                            <div className="text-xs text-blue-200/50">{formatDateShort(b.scheduledAt)}</div>
                          </div>
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${getStatusColor(b.status)}`}>
                            {b.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeSection === "garages" && (
            <div className="rounded-2xl p-6" style={glass}>
              <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                <div className="flex items-center gap-1.5">
                  {GARAGE_STATUS_TABS.map((s) => (
                    <button
                      key={s}
                      onClick={() => setGarageStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        garageStatus === s ? "bg-[#F97316] text-white" : "bg-white/5 text-blue-200/60 hover:text-white"
                      }`}
                    >
                      {s.charAt(0) + s.slice(1).toLowerCase()} ({garageCounts[s] ?? 0})
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/40" />
                  <input
                    value={garageSearch}
                    onChange={(e) => setGarageSearch(e.target.value)}
                    placeholder="Search garages..."
                    className="h-9 pl-9 pr-4 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] placeholder:text-blue-200/40"
                    style={glassSoft}
                  />
                </div>
              </div>

              {garagesLoading ? (
                <p className="text-blue-200/50 text-sm text-center py-10">Loading…</p>
              ) : garages.length === 0 ? (
                <p className="text-blue-200/50 text-sm text-center py-10">No {garageStatus.toLowerCase()} garages.</p>
              ) : (
                <div className="space-y-3">
                  {garages.map((garage) => (
                    <div key={garage.id} className="flex items-center justify-between p-4 rounded-xl" style={glassSoft}>
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#1E3A5F] rounded-xl flex items-center justify-center text-white font-bold">
                          {garage.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-white font-semibold">{garage.name}</div>
                          <div className="text-blue-200/50 text-sm">{garage.city}, {garage.postcode} · {garage.email}</div>
                          <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {parseServices(garage.services).map((s) => (
                              <span key={s} className="text-xs bg-white/10 text-blue-100 px-2 py-0.5 rounded-md">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-blue-200/50">
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
            <div className="rounded-2xl p-6" style={glass}>
              <div className="flex items-center justify-between mb-5 gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-white">User Management</h2>
                <div className="flex items-center gap-1.5">
                  {(["", "OWNER", "GARAGE", "ADMIN"] as const).map((r) => (
                    <button
                      key={r || "ALL"}
                      onClick={() => setUserRole(r)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        userRole === r ? "bg-[#F97316] text-white" : "bg-white/5 text-blue-200/60 hover:text-white"
                      }`}
                    >
                      {r === "" ? "All" : r.charAt(0) + r.slice(1).toLowerCase()}
                    </button>
                  ))}
                </div>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-blue-200/40" />
                  <input
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search by name or email..."
                    className="h-9 pl-9 pr-4 rounded-lg text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] placeholder:text-blue-200/40"
                    style={glassSoft}
                  />
                </div>
              </div>
              {usersLoading ? (
                <p className="text-blue-200/50 text-sm text-center py-10">Loading…</p>
              ) : users.length === 0 ? (
                <p className="text-blue-200/50 text-sm text-center py-10">No users found.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        {["Name", "Email", "Role", "Bookings", "Joined"].map((h) => (
                          <th key={h} className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3 pr-4">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {users.map((u) => (
                        <tr key={u.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 pr-4">
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                                {(u.name ?? u.email).split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-sm text-white font-medium">{u.name ?? "—"}</span>
                            </div>
                          </td>
                          <td className="py-3 pr-4 text-sm text-blue-200/60">{u.email}</td>
                          <td className="py-3 pr-4">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === "GARAGE" ? "bg-orange-500/20 text-orange-400" : u.role === "ADMIN" ? "bg-purple-500/20 text-purple-400" : "bg-blue-500/20 text-blue-400"}`}>
                              {u.role}
                            </span>
                          </td>
                          <td className="py-3 pr-4 text-sm text-blue-100">{u.bookings}</td>
                          <td className="py-3 pr-4 text-sm text-blue-200/60">{formatDateShort(u.joinedAt)}</td>
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
            <div className="rounded-2xl p-6" style={glass}>
              <div className="flex items-center justify-between mb-4 gap-4 flex-wrap">
                <h2 className="text-lg font-bold text-white">All Bookings</h2>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {BOOKING_STATUS_TABS.map((s) => (
                    <button
                      key={s || "ALL"}
                      onClick={() => setBookingStatus(s)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                        bookingStatus === s ? "bg-[#F97316] text-white" : "bg-white/5 text-blue-200/60 hover:text-white"
                      }`}
                    >
                      {s === "" ? "All" : s.replace(/_/g, " ")} ({s === "" ? Object.values(bookingCounts).reduce((a, b) => a + b, 0) : bookingCounts[s] ?? 0})
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-3 mb-5 flex-wrap">
                <label className="flex items-center gap-2 text-xs text-blue-200/60">
                  From
                  <input
                    type="date"
                    value={bookingFrom}
                    onChange={(e) => setBookingFrom(e.target.value)}
                    className="h-8 px-2 rounded-lg text-blue-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                    style={glassSoft}
                  />
                </label>
                <label className="flex items-center gap-2 text-xs text-blue-200/60">
                  To
                  <input
                    type="date"
                    value={bookingTo}
                    onChange={(e) => setBookingTo(e.target.value)}
                    className="h-8 px-2 rounded-lg text-blue-100 text-xs focus:outline-none focus:ring-2 focus:ring-[#F97316]"
                    style={glassSoft}
                  />
                </label>
                {(bookingFrom || bookingTo) && (
                  <button
                    onClick={() => { setBookingFrom(""); setBookingTo("") }}
                    className="text-xs text-blue-200/60 hover:text-white underline cursor-pointer"
                  >
                    Clear dates
                  </button>
                )}
              </div>
              {bookingsLoading ? (
                <p className="text-blue-200/50 text-sm text-center py-10">Loading…</p>
              ) : bookings.length === 0 ? (
                <p className="text-blue-200/50 text-sm text-center py-10">No bookings match these filters.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-white/10">
                        <th className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3">Service</th>
                        <th className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3">Garage</th>
                        <th className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3">Customer</th>
                        <th className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3">Date</th>
                        <th className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3">Amount</th>
                        <th className="text-left text-xs font-semibold text-blue-200/50 uppercase tracking-wider pb-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {bookings.map((b) => (
                        <tr key={b.id} className="hover:bg-white/5 transition-colors">
                          <td className="py-3 text-sm text-white font-medium">{b.serviceType.replace(/_/g, " ")}</td>
                          <td className="py-3 text-sm text-blue-100">{b.garage}</td>
                          <td className="py-3 text-sm text-blue-100">{b.customer}</td>
                          <td className="py-3 text-sm text-blue-200/60">{formatDateShort(b.scheduledAt)}</td>
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
            <div className="rounded-2xl p-6 text-center py-20" style={glass}>
              <TrendingUp className="h-12 w-12 mx-auto mb-3 text-blue-200/30" />
              <h3 className="text-lg font-semibold text-white mb-1">Analytics Coming Soon</h3>
              <p className="text-sm text-blue-200/50">This section will be available in a future update.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
