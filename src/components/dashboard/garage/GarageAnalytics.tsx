"use client"

import { useState, useEffect } from "react"
import { Loader2 } from "lucide-react"
import { formatCurrency, getServiceLabel } from "@/lib/utils"

interface MonthlyPoint {
  month: string
  bookings: number
  revenue: number
}

interface AnalyticsData {
  monthly: MonthlyPoint[]
  serviceBreakdown: { serviceType: string; count: number }[]
  quoteResponseRate: number | null
  jobAcceptRate: number | null
  totals: { totalBookings: number; totalReviews: number; averageRating: number }
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number)
  return new Date(year, month - 1, 1).toLocaleDateString("en-GB", { month: "short" })
}

export function GarageAnalytics() {
  const [data, setData] = useState<AnalyticsData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch("/api/garage/analytics")
      .then((res) => res.json())
      .then(setData)
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300" /></div>
  }

  if (!data) return <p className="text-sm text-slate-500">Failed to load analytics.</p>

  const maxBookings = Math.max(1, ...data.monthly.map((m) => m.bookings))
  const topServices = [...data.serviceBreakdown].sort((a, b) => b.count - a.count).slice(0, 6)
  const maxServiceCount = Math.max(1, ...topServices.map((s) => s.count))

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatBox label="Total Bookings" value={data.totals.totalBookings.toLocaleString()} />
        <StatBox label="Avg Rating" value={`${data.totals.averageRating.toFixed(1)}★`} />
        <StatBox label="Quote Response Rate" value={data.quoteResponseRate != null ? `${data.quoteResponseRate}%` : "—"} />
        <StatBox label="Job Lead Win Rate" value={data.jobAcceptRate != null ? `${data.jobAcceptRate}%` : "—"} />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-slate-900 mb-4">Bookings — Last 6 Months</h3>
        <div className="flex items-end gap-3 h-40">
          {data.monthly.map((m) => (
            <div key={m.month} className="flex-1 flex flex-col items-center gap-2">
              <div className="w-full flex-1 flex items-end">
                <div
                  className="w-full bg-[#1E3A5F] rounded-t-md transition-all"
                  style={{ height: `${(m.bookings / maxBookings) * 100}%`, minHeight: m.bookings > 0 ? "4px" : "0" }}
                  title={`${m.bookings} bookings, ${formatCurrency(m.revenue)} revenue`}
                />
              </div>
              <span className="text-xs text-slate-500">{monthLabel(m.month)}</span>
              <span className="text-xs font-semibold text-slate-700">{m.bookings}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <h3 className="font-bold text-slate-900 mb-4">Top Services</h3>
        {topServices.length === 0 ? (
          <p className="text-sm text-slate-400">No bookings yet.</p>
        ) : (
          <div className="space-y-3">
            {topServices.map((s) => (
              <div key={s.serviceType} className="flex items-center gap-3">
                <span className="text-sm text-slate-600 w-32 flex-shrink-0 truncate">{getServiceLabel(s.serviceType)}</span>
                <div className="flex-1 bg-slate-100 rounded-full h-2.5">
                  <div className="bg-[#F97316] h-2.5 rounded-full" style={{ width: `${(s.count / maxServiceCount) * 100}%` }} />
                </div>
                <span className="text-xs text-slate-500 w-6 text-right">{s.count}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </div>
  )
}
