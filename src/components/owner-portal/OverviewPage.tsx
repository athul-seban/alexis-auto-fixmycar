"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, Calendar, CheckCircle, MessageSquare, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { formatDate, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { isActiveStatus, isDueSoon, type OwnerBooking, type OwnerQuote, type OwnerVehicle } from "@/components/owner-portal/types"

export function OwnerOverviewPage({ firstName }: { firstName: string }) {
  const bookings = useApi<{ bookings: OwnerBooking[] }>("/api/bookings")
  const quotes = useApi<{ quotes: OwnerQuote[] }>("/api/quotes")
  const vehicles = useApi<{ vehicles: OwnerVehicle[] }>("/api/vehicles")
  const [now] = useState(() => Date.now())

  const b = bookings.data?.bookings ?? []
  const upcoming = b.filter((x) => isActiveStatus(x.status)).sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt))
  const waiting = (quotes.data?.quotes ?? []).filter((q) => q.status === "SENT").length
  const completed = b.filter((x) => x.status === "COMPLETED").length
  const due = (vehicles.data?.vehicles ?? []).filter((v) => isDueSoon(v.motDueDate, now) || isDueSoon(v.serviceDueDate, now)).length
  const loading = bookings.loading || quotes.loading || vehicles.loading

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your bookings, quotes and vehicles in one place."
        actions={
          <Button asChild variant="default" className="gap-2">
            <Link href="/search">
              <Plus className="h-4 w-4" /> Book a service
            </Link>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Active bookings" value={upcoming.length} icon={Calendar} tone="blue" href="/dashboard/bookings" loading={loading} />
        <StatTile label="Quotes to review" value={waiting} icon={MessageSquare} tone="orange" href="/dashboard/quotes" loading={loading} />
        <StatTile label="Completed jobs" value={completed} icon={CheckCircle} tone="green" href="/dashboard/bookings?tab=past" loading={loading} />
        <StatTile label="MOT / service due" value={due} icon={AlertCircle} tone="red" href="/dashboard/vehicles" loading={loading} />
      </div>

      <Panel className="p-4 sm:p-6">
        <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Next up</h2>
        {upcoming.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">{loading ? "Loading…" : "No upcoming bookings."}</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {upcoming.slice(0, 3).map((x) => (
              <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                <div className="min-w-0">
                  <p className="font-medium text-slate-900 dark:text-white">{getServiceLabel(x.serviceType)}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {x.garage.name} · {x.timeConfirmed ? formatDate(x.scheduledAt) : "time to be agreed"}
                  </p>
                </div>
                <StatusPill status={x.status} />
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </>
  )
}
