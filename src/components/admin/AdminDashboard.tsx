"use client"

import { useState } from "react"
import Link from "next/link"
import {
  LayoutDashboard, Building2, Users, Calendar, TrendingUp,
  CheckCircle, XCircle, Clock, AlertCircle, Search, Eye,
  LogOut, Wrench, Shield, MoreHorizontal, ChevronUp, ChevronDown
} from "lucide-react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { formatCurrency, formatDateShort, getStatusColor } from "@/lib/utils"

interface User {
  name?: string | null
  email?: string | null
}

const mockStats = {
  totalUsers: 12548,
  userGrowth: 12.5,
  totalGarages: 15420,
  garageGrowth: 8.2,
  totalBookings: 98234,
  bookingGrowth: 23.1,
  revenue: 248900,
  revenueGrowth: 18.7,
  pendingApprovals: 24,
}

const mockPendingGarages = [
  { id: "1", name: "TechAuto Services", city: "Glasgow", postcode: "G1 1AA", email: "info@techauto.com", services: ["MOT", "FULL_SERVICE", "BRAKES"], submittedAt: new Date("2024-02-08"), phone: "0141 123 4567" },
  { id: "2", name: "Midlands Mobile Mechanic", city: "Coventry", postcode: "CV1 1AA", email: "info@midlandsmobile.com", services: ["DIAGNOSTICS", "BATTERY", "TYRES"], submittedAt: new Date("2024-02-09"), phone: "024 7612 3456" },
  { id: "3", name: "North Star Garage", city: "Newcastle", postcode: "NE1 1AA", email: "info@northstar.com", services: ["MOT", "CAMBELT", "CLUTCH"], submittedAt: new Date("2024-02-10"), phone: "0191 234 5678" },
]

const mockRecentBookings = [
  { id: "1", serviceType: "MOT", status: "CONFIRMED", totalPrice: 54.99, scheduledAt: new Date("2024-02-15"), garage: "Premier Auto", customer: "Sarah M." },
  { id: "2", serviceType: "FULL_SERVICE", status: "COMPLETED", totalPrice: 189.99, scheduledAt: new Date("2024-02-01"), garage: "QuickFix Mobile", customer: "James P." },
  { id: "3", serviceType: "BRAKES", status: "PENDING", totalPrice: 120.00, scheduledAt: new Date("2024-02-22"), garage: "Elite Car Care", customer: "Emma T." },
  { id: "4", serviceType: "CAMBELT", status: "CANCELLED", totalPrice: 350.00, scheduledAt: new Date("2024-02-05"), garage: "Citygate Garage", customer: "David C." },
]

const mockUsers = [
  { id: "1", name: "Sarah Mitchell", email: "sarah@example.com", role: "OWNER", bookings: 8, joinedAt: new Date("2023-06-15") },
  { id: "2", name: "James Patel", email: "james@example.com", role: "OWNER", bookings: 12, joinedAt: new Date("2023-08-22") },
  { id: "3", name: "Premier Auto", email: "info@premier.com", role: "GARAGE", bookings: 342, joinedAt: new Date("2023-01-10") },
]

const navItems = [
  { icon: LayoutDashboard, label: "Overview", id: "overview" },
  { icon: Building2, label: "Garages", id: "garages" },
  { icon: Users, label: "Users", id: "users" },
  { icon: Calendar, label: "Bookings", id: "bookings" },
  { icon: TrendingUp, label: "Analytics", id: "analytics" },
]

interface Props {
  user: User
}

export function AdminDashboard({ user }: Props) {
  const [activeSection, setActiveSection] = useState("overview")
  const [garageAction, setGarageAction] = useState<Record<string, string>>({})

  const handleApprove = (id: string) => setGarageAction((p) => ({ ...p, [id]: "approved" }))
  const handleReject = (id: string) => setGarageAction((p) => ({ ...p, [id]: "rejected" }))

  return (
    <div className="flex h-screen overflow-hidden">
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
              {item.id === "garages" && mockStats.pendingApprovals > 0 && (
                <span className="ml-auto bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full">
                  {mockStats.pendingApprovals}
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
                  { label: "Total Users", value: mockStats.totalUsers.toLocaleString(), change: mockStats.userGrowth, icon: Users, color: "text-blue-400" },
                  { label: "Total Garages", value: mockStats.totalGarages.toLocaleString(), change: mockStats.garageGrowth, icon: Building2, color: "text-orange-400" },
                  { label: "Total Bookings", value: mockStats.totalBookings.toLocaleString(), change: mockStats.bookingGrowth, icon: Calendar, color: "text-green-400" },
                  { label: "Total Revenue", value: formatCurrency(mockStats.revenue), change: mockStats.revenueGrowth, icon: TrendingUp, color: "text-purple-400" },
                ].map((stat) => (
                  <div key={stat.label} className="bg-slate-900 rounded-xl border border-slate-800 p-5">
                    <div className="flex items-center justify-between mb-4">
                      <stat.icon className={`h-5 w-5 ${stat.color}`} />
                      <div className={`flex items-center gap-1 text-xs font-medium ${stat.change >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {stat.change >= 0 ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                        {Math.abs(stat.change)}%
                      </div>
                    </div>
                    <div className="text-2xl font-bold text-white">{stat.value}</div>
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
                      {mockPendingGarages.filter(g => !garageAction[g.id]).length}
                    </span>
                  </h2>
                  <button
                    onClick={() => setActiveSection("garages")}
                    className="text-sm text-slate-400 hover:text-white transition-colors cursor-pointer"
                  >
                    View all →
                  </button>
                </div>
                <div className="space-y-3">
                  {mockPendingGarages.slice(0, 3).map((garage) => {
                    const action = garageAction[garage.id]
                    return (
                      <div key={garage.id} className="flex items-center justify-between p-4 bg-slate-800 rounded-xl">
                        <div className="flex items-center gap-4">
                          <div className="w-10 h-10 bg-[#1E3A5F] rounded-lg flex items-center justify-center text-white font-bold text-sm">
                            {garage.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                          </div>
                          <div>
                            <div className="text-white font-semibold text-sm">{garage.name}</div>
                            <div className="text-slate-400 text-xs">{garage.city} · {formatDateShort(garage.submittedAt)}</div>
                          </div>
                        </div>
                        {action ? (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${action === "approved" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                            {action === "approved" ? "✓ Approved" : "✗ Rejected"}
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleApprove(garage.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <CheckCircle className="h-3.5 w-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleReject(garage.id)}
                              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <XCircle className="h-3.5 w-3.5" />
                              Reject
                            </button>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* Recent Bookings */}
              <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
                <h2 className="text-lg font-bold text-white mb-5">Recent Bookings</h2>
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
                      {mockRecentBookings.map((b) => (
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
              </div>
            </div>
          )}

          {activeSection === "garages" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg font-bold text-white">Garage Management</h2>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                  <input
                    placeholder="Search garages..."
                    className="h-9 pl-9 pr-4 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316] placeholder:text-slate-500"
                  />
                </div>
              </div>
              <div className="space-y-3">
                {mockPendingGarages.map((garage) => {
                  const action = garageAction[garage.id]
                  return (
                    <div key={garage.id} className="flex items-center justify-between p-4 bg-slate-800 rounded-xl">
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-[#1E3A5F] rounded-xl flex items-center justify-center text-white font-bold">
                          {garage.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                        </div>
                        <div>
                          <div className="text-white font-semibold">{garage.name}</div>
                          <div className="text-slate-400 text-sm">{garage.city}, {garage.postcode} · {garage.email}</div>
                          <div className="flex gap-1.5 mt-1.5">
                            {garage.services.map((s) => (
                              <span key={s} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-md">{s}</span>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right text-xs text-slate-400">
                          <div>Submitted</div>
                          <div>{formatDateShort(garage.submittedAt)}</div>
                        </div>
                        {action ? (
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${action === "approved" ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"}`}>
                            {action === "approved" ? "✓ Approved" : "✗ Rejected"}
                          </span>
                        ) : (
                          <div className="flex gap-2">
                            <button onClick={() => handleApprove(garage.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                              <CheckCircle className="h-3.5 w-3.5" /> Approve
                            </button>
                            <button onClick={() => handleReject(garage.id)} className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 hover:bg-red-500/30 rounded-lg text-xs font-semibold cursor-pointer transition-colors">
                              <XCircle className="h-3.5 w-3.5" /> Reject
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeSection === "users" && (
            <div className="bg-slate-900 rounded-xl border border-slate-800 p-6">
              <h2 className="text-lg font-bold text-white mb-5">User Management</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-slate-800">
                      {["Name", "Email", "Role", "Bookings", "Joined", "Actions"].map((h) => (
                        <th key={h} className="text-left text-xs font-semibold text-slate-400 uppercase tracking-wider pb-3 pr-4">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800">
                    {mockUsers.map((u) => (
                      <tr key={u.id} className="hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 pr-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-[#1E3A5F] flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                              {u.name.split(" ").map((w) => w[0]).join("").slice(0, 2)}
                            </div>
                            <span className="text-sm text-white font-medium">{u.name}</span>
                          </div>
                        </td>
                        <td className="py-3 pr-4 text-sm text-slate-400">{u.email}</td>
                        <td className="py-3 pr-4">
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${u.role === "GARAGE" ? "bg-orange-500/20 text-orange-400" : "bg-blue-500/20 text-blue-400"}`}>
                            {u.role}
                          </span>
                        </td>
                        <td className="py-3 pr-4 text-sm text-slate-300">{u.bookings}</td>
                        <td className="py-3 pr-4 text-sm text-slate-400">{formatDateShort(u.joinedAt)}</td>
                        <td className="py-3">
                          <button className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white transition-colors cursor-pointer">
                            <Eye className="h-4 w-4" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {(activeSection === "bookings" || activeSection === "analytics") && (
            <div className="text-center py-20 text-slate-500">
              <TrendingUp className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <h3 className="text-lg font-semibold text-slate-300 mb-1">
                {activeSection === "analytics" ? "Analytics" : "Bookings"} Coming Soon
              </h3>
              <p className="text-sm">This section will be available in the next update.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
