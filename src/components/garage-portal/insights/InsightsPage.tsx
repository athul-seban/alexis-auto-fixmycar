"use client"

import Link from "next/link"
import { ArrowLeft } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { NativeSelect } from "@/components/ui/form-controls"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { formatCurrency, getServiceLabel } from "@/lib/utils"
import { parseCivilRange, presetRange } from "@/lib/portal/date-range"
import { formatCivilDate } from "@/lib/portal/tz"
import { sourceLabel } from "@/lib/portal/labels"
import type { Breakdown, Funnel, Granularity, SeriesPoint } from "@/lib/portal/insights"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { RangePicker } from "@/components/garage-portal/dashboard/RangePicker"
import { BarChart, DonutChart, FunnelBars, LineAreaChart } from "@/components/garage-portal/insights/charts"

interface Insights {
  range: { from: string; to: string }
  granularity: Granularity
  series: SeriesPoint[]
  totals: { created: number; attended: number; noShow: number; revenue: number }
  bySource: Breakdown[]
  byChannel: Breakdown[]
  byService: Breakdown[]
  funnel: Funnel
}

function bucketLabel(bucket: string, g: Granularity): string {
  const d = new Date(`${bucket}T12:00:00Z`)
  if (g === "month") return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit", timeZone: "UTC" })
  return d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-base font-bold text-slate-900 dark:text-white">{title}</h2>
      {subtitle && <p className="mb-4 mt-0.5 text-xs text-slate-500 dark:text-slate-400">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </Panel>
  )
}

export function InsightsPage() {
  const { searchParams, setParams } = useUrlParams()
  const parsed = parseCivilRange(searchParams.get("from"), searchParams.get("to"))
  const custom = !!(searchParams.get("from") && searchParams.get("to") && parsed.ok)
  const range = custom && parsed.ok ? parsed.range : presetRange("3m")
  const granularity = searchParams.get("granularity") ?? ""

  const query = new URLSearchParams({ from: range.from, to: range.to })
  if (granularity) query.set("granularity", granularity)
  const { data, error, loading } = useApi<Insights>(`/api/garage/insights?${query}`)

  return (
    <>
      <Link href="/garage-dashboard" className="mb-3 inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
        <ArrowLeft className="h-4 w-4" /> Dashboard
      </Link>
      <PageHeader title="Insights" description={`Booking trends from ${formatCivilDate(range.from)} to ${formatCivilDate(range.to)}.`} />

      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <RangePicker range={range} onChange={(r) => setParams({ from: r.from, to: r.to })} />
        <div className="w-44">
          <NativeSelect aria-label="Group by" value={granularity || "auto"} onChange={(e) => setParams({ granularity: e.target.value === "auto" ? null : e.target.value })}>
            <option value="auto">Group: automatic</option>
            <option value="day">By day</option>
            <option value="week">By week</option>
            <option value="month">By month</option>
          </NativeSelect>
        </div>
      </div>

      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="grid gap-6 lg:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-72 rounded-xl" />)}</div>
      ) : (
        <div className={loading ? "opacity-60 transition-opacity" : ""}>
          <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {[
              ["Bookings created", String(data.totals.created)],
              ["Attended", String(data.totals.attended)],
              ["No-shows", String(data.totals.noShow)],
              ["Final invoice value", formatCurrency(data.totals.revenue).replace(/\.00$/, "")],
            ].map(([label, value]) => (
              <Panel key={label} className="p-4">
                <p className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
              </Panel>
            ))}
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Bookings over time" subtitle="Created (when the booking was made) vs attended (when the customer came in).">
              <BarChart aLabel="Created" bLabel="Attended" data={data.series.map((p) => ({ label: bucketLabel(p.bucket, data.granularity), a: p.created, b: p.attended }))} />
            </Card>
            <Card title="Final invoice value" subtitle="Value of completed jobs, by the date they were done.">
              <LineAreaChart name="Final invoice value over time" format={(n) => formatCurrency(n).replace(/\.00$/, "")} data={data.series.map((p) => ({ label: bucketLabel(p.bucket, data.granularity), value: p.revenue }))} />
            </Card>
            <Card title="Where bookings come from">
              <DonutChart centerLabel="bookings" slices={data.bySource.map((b) => ({ label: sourceLabel(b.key), value: b.count }))} />
            </Card>
            <Card title="Most booked services">
              <DonutChart centerLabel="bookings" slices={data.byService.map((b) => ({ label: getServiceLabel(b.key), value: b.count }))} />
            </Card>
            <Card title="Quote funnel" subtitle={data.funnel.winRate === null ? "Quote requests and job leads you've priced." : `You win ${data.funnel.winRate}% of the quotes you send.`}>
              <FunnelBars steps={[{ label: "Requests answered or received", value: data.funnel.requests }, { label: "Quotes sent", value: data.funnel.quoted }, { label: "Booked", value: data.funnel.booked }]} />
            </Card>
            <Card title="No-show rate" subtitle="No-shows as a share of customers who were due.">
              <LineAreaChart name="No-show rate over time" format={(n) => `${n}%`} data={data.series.map((p) => ({ label: bucketLabel(p.bucket, data.granularity), value: p.noShowRate ?? 0 }))} />
            </Card>
          </div>
        </div>
      )}
    </>
  )
}
