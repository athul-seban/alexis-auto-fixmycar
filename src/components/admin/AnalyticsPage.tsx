"use client"

import { useApi } from "@/hooks/use-api"
import { formatCurrency } from "@/lib/utils"
import { sourceLabel } from "@/lib/portal/labels"
import { DonutChart, FunnelBars, LineAreaChart } from "@/components/garage-portal/insights/charts"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { Skeleton } from "@/components/ui/skeleton"

interface Overview {
  revenueTrend: { date: string; revenue: number }[]
  serviceBreakdown: { serviceType: string; label: string; count: number }[]
  bySource: { source: string; count: number; value: number }[]
  topCities: { city: string; garages: number; bookings: number; revenue: number }[]
  enquiries: { total: number; counts: Record<string, number>; conversionRate: number }
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Panel className="p-4 sm:p-6">
      <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      {children}
    </Panel>
  )
}

export function AdminAnalyticsPage() {
  const { data, error } = useApi<Overview>("/api/admin/overview")

  if (error && !data) {
    return (
      <p role="alert" className="text-sm text-red-700 dark:text-red-400">
        {error}
      </p>
    )
  }

  return (
    <>
      <PageHeader title="Analytics" description="Revenue, demand and where bookings come from." />
      {!data ? (
        <Skeleton className="h-80 w-full" />
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <Card title="Completed revenue — last 30 days">
              <LineAreaChart name="Revenue" format={formatCurrency} data={data.revenueTrend.map((d) => ({ label: d.date.slice(5), value: d.revenue }))} />
            </Card>
          </div>
          <Card title="Bookings by source">
            <DonutChart centerLabel="bookings" slices={data.bySource.map((s) => ({ label: sourceLabel(s.source), value: s.count }))} />
          </Card>
          <Card title="Bookings by service">
            <DonutChart centerLabel="bookings" slices={data.serviceBreakdown.slice(0, 6).map((s) => ({ label: s.label, value: s.count }))} />
          </Card>
          <Card title="Job request funnel">
            <FunnelBars
              steps={[
                { label: "Posted", value: data.enquiries.total },
                { label: "Quoted", value: (data.enquiries.counts.QUOTED ?? 0) + (data.enquiries.counts.BOOKED ?? 0) },
                { label: "Booked", value: data.enquiries.counts.BOOKED ?? 0 },
              ]}
            />
            <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{data.enquiries.conversionRate}% of job requests end in a booking.</p>
          </Card>
          <Card title="Top cities">
            <ul className="divide-y divide-slate-100 text-sm dark:divide-white/10">
              {data.topCities.map((c) => (
                <li key={c.city} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 py-2.5">
                  <span className="font-medium text-slate-900 dark:text-white">{c.city}</span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {c.garages} garages · {c.bookings} bookings · {formatCurrency(c.revenue)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  )
}
