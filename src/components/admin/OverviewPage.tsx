"use client"

import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, ClipboardCheck, CreditCard, PoundSterling, Sparkles, Users, Wrench } from "lucide-react"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { cn, formatCurrency, timeAgo } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { DonutChart, LineAreaChart } from "@/components/garage-portal/insights/charts"

interface Stats {
  totalUsers: number
  userGrowth: number | null
  totalGarages: number
  garageGrowth: number | null
  totalBookings: number
  bookingGrowth: number | null
  revenue: number
  revenueGrowth: number | null
  pendingApprovals: number
  depositsCollected: number
}

interface Overview {
  attention: { pendingGarages: number; pendingDocuments: number; openDisputes: number; openEnquiries: number }
  revenueTrend: { date: string; revenue: number }[]
  serviceBreakdown: { serviceType: string; label: string; count: number }[]
  topCities: { city: string; garages: number; bookings: number; revenue: number }[]
  activity: { type: string; message: string; createdAt: string }[]
}

function Growth({ pct }: { pct: number | null }) {
  if (pct === null) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-blue-800 dark:text-blue-300">
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        New <span className="hidden font-normal text-slate-500 sm:inline">nothing in previous 30 days</span>
      </span>
    )
  }
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(pct)}% <span className="hidden font-normal text-slate-500 sm:inline">vs previous 30 days</span>
    </span>
  )
}

const shortDate = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })
const money = (n: number) => formatCurrency(n).replace(/\.00$/, "")

export function AdminOverviewPage() {
  const stats = useApi<Stats>("/api/admin/stats")
  const overview = useApi<Overview>("/api/admin/overview")
  const s = stats.data
  const o = overview.data

  const tiles = [
    { label: "Users", value: s?.totalUsers, growth: s?.userGrowth, icon: Users, tone: "blue" as const, href: "/admin/users" },
    { label: "Garages", value: s?.totalGarages, growth: s?.garageGrowth, icon: Wrench, tone: "purple" as const, href: "/admin/garages?status=APPROVED" },
    { label: "Bookings", value: s?.totalBookings, growth: s?.bookingGrowth, icon: ClipboardCheck, tone: "orange" as const, href: "/admin/bookings" },
    { label: "Completed revenue", value: s ? formatCurrency(s.revenue) : undefined, growth: s?.revenueGrowth, icon: PoundSterling, tone: "green" as const, href: "/admin/analytics" },
    { label: "Deposits collected", value: s ? formatCurrency(s.depositsCollected) : undefined, growth: undefined, icon: CreditCard, tone: "blue" as const, href: "/admin/bookings" },
  ]

  const queue = o
    ? [
        { n: o.attention.pendingGarages, one: "garage waiting for approval", many: "garages waiting for approval", href: "/admin/garages?status=PENDING" },
        { n: o.attention.pendingDocuments, one: "verification document to check", many: "verification documents to check", href: "/admin/documents" },
        { n: o.attention.openDisputes, one: "review dispute to decide", many: "review disputes to decide", href: "/admin/reviews" },
        { n: o.attention.openEnquiries, one: "open guest enquiry", many: "open guest enquiries", href: "/admin/enquiries" },
      ].filter((q) => q.n > 0)
    : []

  return (
    <>
      <PageHeader title="Overview" description="How the marketplace is doing and what needs your attention." />

      {stats.error && !s && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          {stats.error}
        </p>
      )}
      {overview.error && !o && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          Couldn&apos;t load the activity and charts: {overview.error}
        </p>
      )}

      {queue.length > 0 && (
        <section aria-label="Needs attention" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="mb-2 font-semibold">Needs your attention</p>
          <ul className="grid gap-1 sm:grid-cols-2">
            {queue.map((q) => (
              <li key={q.href}>
                <Link href={q.href} className="underline underline-offset-2 hover:no-underline">
                  <strong>{q.n}</strong> {q.n === 1 ? q.one : q.many} →
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mb-6 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-5">
        {tiles.map((t) => (
          <StatTile
            key={t.label}
            label={t.label}
            icon={t.icon}
            tone={t.tone}
            href={t.href}
            loading={!s}
            value={
              <>
                {typeof t.value === "number" ? t.value.toLocaleString("en-GB") : t.value}
                {t.growth !== undefined && (
                  <div className="mt-1 text-sm font-normal">
                    <Growth pct={t.growth} />
                  </div>
                )}
              </>
            }
          />
        ))}
      </div>

      {o && (
        <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Panel className="p-4 sm:p-6 lg:col-span-2">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Completed revenue, last 30 days</h2>
              <Link href="/admin/analytics" className="text-sm font-medium text-[#1E3A5F] hover:underline dark:text-blue-300">
                Full analytics →
              </Link>
            </div>
            <LineAreaChart name="Completed revenue per day" format={money} data={o.revenueTrend.map((p) => ({ label: shortDate(p.date), value: p.revenue }))} />
          </Panel>

          <Panel className="p-4 sm:p-6">
            <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Bookings by service</h2>
            {o.serviceBreakdown.length ? (
              <DonutChart centerLabel="bookings" slices={o.serviceBreakdown.slice(0, 7).map((b) => ({ label: b.label, value: b.count }))} />
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">No bookings yet.</p>
            )}
          </Panel>
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Panel className="p-4 sm:p-6 lg:col-span-2">
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Recent activity</h2>
          {o?.activity.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {o.activity.map((a, i) => (
                <li key={i} className="flex items-start justify-between gap-4 py-3 text-sm">
                  <span className="min-w-0 break-words text-slate-700 dark:text-slate-300">{a.message}</span>
                  <time dateTime={a.createdAt} className="flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">
                    {timeAgo(a.createdAt)}
                  </time>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{overview.loading ? "Loading…" : "Nothing yet."}</p>
          )}
        </Panel>

        <Panel className="p-4 sm:p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Top cities</h2>
          {o?.topCities.length ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {o.topCities.map((c) => (
                <li key={c.city} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">{c.city}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {c.garages} garage{c.garages === 1 ? "" : "s"} · {c.bookings} booking{c.bookings === 1 ? "" : "s"}
                    </p>
                  </div>
                  <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{money(c.revenue)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">{overview.loading ? "Loading…" : "No garages yet."}</p>
          )}
        </Panel>
      </div>
    </>
  )
}
