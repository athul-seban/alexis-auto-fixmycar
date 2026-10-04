"use client"

import Link from "next/link"
import { AlertTriangle, ArrowRight, Inbox } from "lucide-react"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { parseCivilRange, presetRange } from "@/lib/portal/date-range"
import type { ChannelKpis } from "@/lib/portal/kpi"
import { garageLinks } from "@/lib/portal/links"
import { todayLondon } from "@/lib/portal/tz"
import { Panel } from "@/components/garage-portal/shared/PageHeader"
import { GreetingHeader, greetingFor, type OverviewGarage } from "@/components/garage-portal/dashboard/GreetingHeader"
import { KpiGrid } from "@/components/garage-portal/dashboard/KpiGrid"
import { RangePicker } from "@/components/garage-portal/dashboard/RangePicker"

interface Overview {
  garage: OverviewGarage
  range: { from: string; to: string }
  today: { dueToday: number; createdToday: number; needsOutcome: number }
  marketplace: ChannelKpis
  widget: ChannelKpis
  direct: ChannelKpis
  noShowRate: number | null
  pendingEnquiries: number
}

export function DashboardPage() {
  const { searchParams, setParams } = useUrlParams()

  // The range lives in the URL (?from=&to=) so it's shareable; invalid values fall back to 14 days.
  const parsed = parseCivilRange(searchParams.get("from"), searchParams.get("to"))
  const range = parsed.ok ? parsed.range : presetRange("14d")
  const hasCustom = searchParams.get("from") && searchParams.get("to") && parsed.ok

  const query = hasCustom ? new URLSearchParams({ from: range.from, to: range.to }).toString() : ""
  const { data, loading, error } = useApi<Overview>(`/api/garage/overview${query ? `?${query}` : ""}`)

  // Rendered from API data only, so the server-rendered HTML never depends on the visitor's clock.
  const greeting = data ? greetingFor(new Date()) : "Welcome"
  const todayDate = todayLondon()

  return (
    <>
      <GreetingHeader
        garage={data?.garage ?? null}
        greeting={greeting}
        dueToday={data?.today.dueToday ?? null}
        createdToday={data?.today.createdToday ?? null}
        todayDate={todayDate}
      />

      {data && data.today.needsOutcome > 0 && (
        <Link
          href={`${garageLinks.bookings}?outcome=pending`}
          className="mb-4 flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200 dark:hover:bg-amber-500/20"
        >
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">
            <strong>{data.today.needsOutcome} past booking{data.today.needsOutcome === 1 ? "" : "s"}</strong> still need an outcome — record whether the customer attended.
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      {data && data.pendingEnquiries > 0 && (
        <Link
          href={garageLinks.enquiries}
          className="mb-4 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 transition-colors hover:bg-blue-100 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 dark:hover:bg-blue-500/20"
        >
          <Inbox className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">
            <strong>{data.pendingEnquiries} new enquir{data.pendingEnquiries === 1 ? "y" : "ies"}</strong> waiting for your quote.
          </span>
          <ArrowRight className="h-4 w-4" />
        </Link>
      )}

      <section aria-labelledby="perf-heading" className="mt-8">
        <div className="mb-5 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 id="perf-heading" className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">Performance Overview</h2>
            <p className="mt-1 max-w-xl text-slate-500 dark:text-slate-400">
              Bookings, attendance and final invoice value from Quote My Garage and your website widget.
            </p>
          </div>
          <RangePicker range={range} onChange={(r) => setParams({ from: r.from, to: r.to })} />
        </div>

        {error && !data ? (
          <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
        ) : (
          <KpiGrid loading={loading && !data} marketplace={data?.marketplace ?? null} widget={data?.widget ?? null} noShowRate={data?.noShowRate ?? null} />
        )}

        {data && data.direct.created + data.direct.attended > 0 && (
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Bookings you add yourself ({data.direct.created} created, {data.direct.attended} attended) aren&apos;t in the marketplace or widget figures above — see Insights.
          </p>
        )}

        <Link href={garageLinks.dashboard + "/insights"} className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-slate-700 hover:text-[#1E3A5F] dark:text-slate-300 dark:hover:text-white">
          Full insights and booking trends
          <ArrowRight className="h-4 w-4" />
        </Link>
      </section>
    </>
  )
}
