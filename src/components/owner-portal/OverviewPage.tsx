"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowRight, Calendar, CheckCircle, MessageSquare, Plus, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { formatDate, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { isActiveStatus, isDueSoon, type OwnerBooking, type OwnerQuote, type OwnerVehicle } from "@/components/owner-portal/types"

const DAY_MS = 86_400_000

interface Reminder {
  vehicle: OwnerVehicle
  kind: "MOT" | "Service"
  days: number
}

function dueLabel(days: number) {
  if (days < 0) return `${Math.abs(days)} day${days === -1 ? "" : "s"} overdue`
  if (days === 0) return "due today"
  return `in ${days} day${days === 1 ? "" : "s"}`
}

function Card({ title, href, linkLabel, children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-4 sm:p-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
        {href && (
          <Link href={href} className="inline-flex items-center gap-1 text-sm font-medium text-[#1E3A5F] hover:underline dark:text-blue-300">
            {linkLabel ?? "View all"} <ArrowRight aria-hidden className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
      {children}
    </Panel>
  )
}

const EMPTY = "text-sm text-slate-500 dark:text-slate-400"

export function OwnerOverviewPage({ firstName }: { firstName: string }) {
  const bookings = useApi<{ bookings: OwnerBooking[] }>("/api/bookings")
  const quotes = useApi<{ quotes: OwnerQuote[] }>("/api/quotes")
  const vehicles = useApi<{ vehicles: OwnerVehicle[] }>("/api/vehicles")
  const [now] = useState(() => Date.now())

  const b = bookings.data?.bookings ?? []
  const q = quotes.data?.quotes ?? []
  const v = vehicles.data?.vehicles ?? []

  const upcoming = b.filter((x) => isActiveStatus(x.status)).sort((x, y) => x.scheduledAt.localeCompare(y.scheduledAt))
  const awaitingReply = q.filter((x) => x.status === "SENT")
  const completed = b.filter((x) => x.status === "COMPLETED")
  const toReview = completed.filter((x) => !x.review)
  const recentQuotes = [...q].sort((x, y) => y.createdAt.localeCompare(x.createdAt)).slice(0, 4)

  const reminders: Reminder[] = v
    .flatMap((vehicle): Reminder[] => [
      ...(isDueSoon(vehicle.motDueDate, now) ? [{ vehicle, kind: "MOT" as const, days: Math.ceil((new Date(vehicle.motDueDate!).getTime() - now) / DAY_MS) }] : []),
      ...(isDueSoon(vehicle.serviceDueDate, now) ? [{ vehicle, kind: "Service" as const, days: Math.ceil((new Date(vehicle.serviceDueDate!).getTime() - now) / DAY_MS) }] : []),
    ])
    .sort((x, y) => x.days - y.days)

  const loading = bookings.loading || quotes.loading || vehicles.loading
  const failed = [bookings.error && "bookings", quotes.error && "quotes", vehicles.error && "vehicles"].filter(Boolean) as string[]
  // A failed list shows "–" rather than a misleading 0.
  const count = (err: string | null | undefined, n: number) => (err ? "–" : n)

  const actions: { text: string; href: string }[] = [
    ...(awaitingReply.length ? [{ text: `${awaitingReply.length} quote${awaitingReply.length === 1 ? " is" : "s are"} waiting for your decision`, href: "/dashboard/quotes" }] : []),
    ...(reminders.some((r) => r.days < 0) ? [{ text: "A MOT or service is overdue", href: "/dashboard/vehicles" }] : []),
    ...(toReview.length ? [{ text: `Tell others how ${toReview.length === 1 ? "a recent job" : `${toReview.length} recent jobs`} went`, href: "/dashboard/reviews" }] : []),
  ]

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

      {failed.length > 0 && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-500/30 dark:bg-red-500/10 dark:text-red-200">
          Couldn&apos;t load your {failed.join(", ")}. Refresh the page to try again.
        </p>
      )}

      {actions.length > 0 && (
        <div role="status" className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <p className="mb-1 font-semibold">Needs your attention</p>
          <ul className="space-y-1">
            {actions.map((a) => (
              <li key={a.href + a.text}>
                <Link href={a.href} className="underline underline-offset-2 hover:no-underline">
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Active bookings" value={count(bookings.error, upcoming.length)} icon={Calendar} tone="blue" href="/dashboard/bookings" loading={bookings.loading} />
        <StatTile label="Quotes to review" value={count(quotes.error, awaitingReply.length)} icon={MessageSquare} tone="orange" href="/dashboard/quotes" loading={quotes.loading} />
        <StatTile label="Completed jobs" value={count(bookings.error, completed.length)} icon={CheckCircle} tone="green" href="/dashboard/bookings?tab=past" loading={bookings.loading} />
        <StatTile label="MOT / service due" value={count(vehicles.error, reminders.length)} icon={AlertCircle} tone="red" href="/dashboard/vehicles" loading={vehicles.loading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Next up" href="/dashboard/bookings">
          {upcoming.length === 0 ? (
            <p className={EMPTY}>{loading ? "Loading…" : "No upcoming bookings. Find a garage and get a quote to book one."}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {upcoming.slice(0, 4).map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{getServiceLabel(x.serviceType)}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {x.vehicle ? `${x.vehicle.make} ${x.vehicle.model} · ` : ""}
                      <Link href={`/garages/${x.garage.slug}`} className="hover:underline">
                        {x.garage.name}
                      </Link>{" "}
                      · {x.timeConfirmed ? formatDate(x.scheduledAt) : "time to be agreed"}
                    </p>
                  </div>
                  <StatusPill status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Vehicle reminders" href="/dashboard/vehicles" linkLabel="My vehicles">
          {reminders.length === 0 ? (
            <p className={EMPTY}>{loading ? "Loading…" : v.length ? "Nothing due in the next 30 days." : "Add a vehicle to get MOT and service reminders."}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {reminders.slice(0, 5).map((r) => (
                <li key={`${r.vehicle.id}-${r.kind}`} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">
                      {r.vehicle.make} {r.vehicle.model} · {r.vehicle.registration}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{r.kind}</p>
                  </div>
                  <span className={r.days < 0 ? "text-sm font-semibold text-red-700 dark:text-red-400" : "text-sm font-medium text-amber-800 dark:text-amber-300"}>{dueLabel(r.days)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Recent quotes" href="/dashboard/quotes">
          {recentQuotes.length === 0 ? (
            <p className={EMPTY}>{loading ? "Loading…" : "No quotes yet."}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {recentQuotes.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{getServiceLabel(x.serviceType)}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {x.garage.name} · {x.price !== null ? `£${x.price}` : "awaiting price"}
                    </p>
                  </div>
                  <StatusPill status={x.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title="Leave a review" href="/dashboard/reviews">
          {toReview.length === 0 ? (
            <p className={EMPTY}>{loading ? "Loading…" : "You're all caught up."}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {toReview.slice(0, 3).map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{x.garage.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{getServiceLabel(x.serviceType)}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/reviews">
                      <Star className="mr-1.5 h-4 w-4" /> Review
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}
