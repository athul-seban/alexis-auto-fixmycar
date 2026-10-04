"use client"

import Link from "next/link"
import { ArrowDownRight, ArrowUpRight, ClipboardCheck, CreditCard, PoundSterling, Users, Wrench } from "lucide-react"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { cn, formatCurrency, timeAgo } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

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
  depositsCollected: number
}

interface Overview {
  activity: { type: string; message: string; createdAt: string }[]
}

function Growth({ pct }: { pct: number }) {
  const up = pct >= 0
  const Icon = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-xs font-semibold", up ? "text-green-700 dark:text-green-400" : "text-red-700 dark:text-red-400")}>
      <Icon className="h-3.5 w-3.5" />
      {Math.abs(pct)}% <span className="hidden font-normal text-slate-400 sm:inline">vs previous 30 days</span>
    </span>
  )
}

export function AdminOverviewPage() {
  const stats = useApi<Stats>("/api/admin/stats")
  const overview = useApi<Overview>("/api/admin/overview")
  const s = stats.data

  const tiles = [
    { label: "Users", value: s?.totalUsers, growth: s?.userGrowth, icon: Users, tone: "blue" as const, href: "/admin/users" },
    { label: "Garages", value: s?.totalGarages, growth: s?.garageGrowth, icon: Wrench, tone: "purple" as const, href: "/admin/garages?status=APPROVED" },
    { label: "Bookings", value: s?.totalBookings, growth: s?.bookingGrowth, icon: ClipboardCheck, tone: "orange" as const, href: "/admin/bookings" },
    { label: "Completed revenue", value: s ? formatCurrency(s.revenue) : undefined, growth: s?.revenueGrowth, icon: PoundSterling, tone: "green" as const, href: "/admin/analytics" },
    { label: "Deposits collected", value: s ? formatCurrency(s.depositsCollected) : undefined, growth: undefined, icon: CreditCard, tone: "blue" as const, href: "/admin/bookings" },
  ]

  return (
    <>
      <PageHeader title="Overview" description="How the marketplace is doing and what needs your attention." />

      {stats.error && !s && (
        <p role="alert" className="mb-4 text-sm text-red-700 dark:text-red-400">
          {stats.error}
        </p>
      )}

      {s && s.pendingApprovals > 0 && (
        <Link
          href="/admin/garages"
          className="mb-6 flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200"
        >
          <span>
            <strong>
              {s.pendingApprovals} garage{s.pendingApprovals === 1 ? "" : "s"}
            </strong>{" "}
            waiting for approval
          </span>
          <span className="font-semibold underline">Review →</span>
        </Link>
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

      <Panel className="p-4 sm:p-6">
        <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Recent activity</h2>
        {overview.data?.activity.length ? (
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {overview.data.activity.map((a, i) => (
              <li key={i} className="flex items-start justify-between gap-4 py-3 text-sm">
                <span className="min-w-0 break-words text-slate-700 dark:text-slate-300">{a.message}</span>
                <time dateTime={a.createdAt} className="flex-shrink-0 text-xs text-slate-400">
                  {timeAgo(a.createdAt)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">{overview.loading ? "Loading…" : "Nothing yet."}</p>
        )}
      </Panel>
    </>
  )
}
