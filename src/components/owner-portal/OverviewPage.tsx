"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertCircle, ArrowRight, Calendar, Car, CheckCircle2, Circle, MessageSquare, Phone, Plus, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatDate, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { isActiveStatus, isDueSoon, type OwnerBooking, type OwnerQuote, type OwnerVehicle } from "@/components/owner-portal/types"

const DAY_MS = 86_400_000

interface Extras {
  unreadMessages: number
  spentThisYear: number
  completedThisYear: number
  totals: { vehicles: number; quotes: number; bookings: number }
}

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

function GettingStarted({ totals }: { totals: Extras["totals"] }) {
  const steps = [
    { done: totals.vehicles > 0, label: "Add your vehicle", hint: "Get MOT and service reminders automatically.", href: "/dashboard/vehicles", cta: "Add vehicle" },
    { done: totals.quotes + totals.bookings > 0, label: "Compare garages and get quotes", hint: "Tell garages what you need and they quote you.", href: "/search", cta: "Find garages" },
    { done: totals.bookings > 0, label: "Book your first service", hint: "Accept a quote or book straight from a garage's page.", href: "/search", cta: "Book a service" },
  ]
  return (
    <Panel className="mb-6 p-4 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Get started</h2>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Three steps to get the most out of Quote My Garage.</p>
      <ol className="space-y-3">
        {steps.map((s, i) => (
          <li key={s.label} className="flex items-start gap-3">
            {s.done ? <CheckCircle2 aria-label="Done" className="mt-0.5 h-5 w-5 flex-shrink-0 text-green-700 dark:text-green-400" /> : <Circle aria-label={`Step ${i + 1}`} className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-500" />}
            <div className="min-w-0 flex-1">
              <p className={s.done ? "text-sm font-medium text-slate-500 line-through dark:text-slate-400" : "text-sm font-semibold text-slate-900 dark:text-white"}>{s.label}</p>
              {!s.done && <p className="text-xs text-slate-500 dark:text-slate-400">{s.hint}</p>}
            </div>
            {!s.done && (
              <Button asChild variant="outline" size="sm">
                <Link href={s.href}>{s.cta}</Link>
              </Button>
            )}
          </li>
        ))}
      </ol>
    </Panel>
  )
}

export function OwnerOverviewPage({ firstName }: { firstName: string }) {
  const bookings = useApi<{ bookings: OwnerBooking[] }>("/api/bookings")
  const quotes = useApi<{ quotes: OwnerQuote[] }>("/api/quotes")
  const vehicles = useApi<{ vehicles: OwnerVehicle[] }>("/api/vehicles")
  const extras = useApi<Extras>("/api/overview")
  const [now] = useState(() => Date.now())

  const b = bookings.data?.bookings ?? []
  const q = quotes.data?.quotes ?? []
  const v = vehicles.data?.vehicles ?? []
  const x = extras.data

  const upcoming = b.filter((y) => isActiveStatus(y.status)).sort((p, r) => p.scheduledAt.localeCompare(r.scheduledAt))
  const next = upcoming.find((y) => y.timeConfirmed && new Date(y.scheduledAt).getTime() >= now - DAY_MS) ?? upcoming[0]
  const rest = upcoming.filter((y) => y.id !== next?.id)
  const awaitingReply = q.filter((y) => y.status === "SENT")
  const toReview = b.filter((y) => y.status === "COMPLETED" && !y.review)
  const toAgree = upcoming.filter((y) => !y.timeConfirmed)
  const recentQuotes = [...q].sort((p, r) => r.createdAt.localeCompare(p.createdAt)).slice(0, 4)

  const reminders: Reminder[] = v
    .flatMap((vehicle): Reminder[] => [
      ...(isDueSoon(vehicle.motDueDate, now) ? [{ vehicle, kind: "MOT" as const, days: Math.ceil((new Date(vehicle.motDueDate!).getTime() - now) / DAY_MS) }] : []),
      ...(isDueSoon(vehicle.serviceDueDate, now) ? [{ vehicle, kind: "Service" as const, days: Math.ceil((new Date(vehicle.serviceDueDate!).getTime() - now) / DAY_MS) }] : []),
    ])
    .sort((p, r) => p.days - r.days)

  const loading = bookings.loading || quotes.loading || vehicles.loading
  const failed = [bookings.error && "bookings", quotes.error && "quotes", vehicles.error && "vehicles"].filter(Boolean) as string[]
  // A failed list shows "–" rather than a misleading 0.
  const count = (err: string | null | undefined, n: number) => (err ? "–" : n)

  const actions: { text: string; href: string }[] = [
    ...(awaitingReply.length ? [{ text: `${awaitingReply.length} quote${awaitingReply.length === 1 ? " is" : "s are"} waiting for your decision`, href: "/dashboard/quotes" }] : []),
    ...(toAgree.length ? [{ text: `${toAgree.length} booking${toAgree.length === 1 ? " still needs" : "s still need"} a time agreed with the garage`, href: "/dashboard/bookings" }] : []),
    ...(reminders.some((r) => r.days < 0) ? [{ text: "A MOT or service is overdue", href: "/dashboard/vehicles" }] : []),
    ...(x && x.unreadMessages > 0 ? [{ text: `${x.unreadMessages} unread message${x.unreadMessages === 1 ? "" : "s"} from garages`, href: "/dashboard/messages" }] : []),
    ...(toReview.length ? [{ text: `Tell others how ${toReview.length === 1 ? "a recent job" : `${toReview.length} recent jobs`} went`, href: "/dashboard/reviews" }] : []),
  ]

  const brandNew = !loading && !failed.length && x && x.totals.bookings === 0 && x.totals.quotes === 0

  return (
    <>
      <PageHeader
        title={`Welcome back, ${firstName}`}
        description="Your bookings, quotes and vehicles in one place."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/dashboard/vehicles">
                <Car className="h-4 w-4" /> Add vehicle
              </Link>
            </Button>
            <Button asChild variant="default" className="gap-2">
              <Link href="/search">
                <Plus className="h-4 w-4" /> Book a service
              </Link>
            </Button>
          </div>
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
              <li key={a.text}>
                <Link href={a.href} className="underline underline-offset-2 hover:no-underline">
                  {a.text}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {brandNew && <GettingStarted totals={x.totals} />}

      <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile label="Active bookings" value={count(bookings.error, upcoming.length)} icon={Calendar} tone="blue" href="/dashboard/bookings" loading={bookings.loading} />
        <StatTile label="Quotes to review" value={count(quotes.error, awaitingReply.length)} icon={CheckCircle2} tone="orange" href="/dashboard/quotes" loading={quotes.loading} />
        <StatTile label="Unread messages" value={count(extras.error, x?.unreadMessages ?? 0)} icon={MessageSquare} tone="purple" href="/dashboard/messages" loading={extras.loading} />
        <StatTile label="MOT / service due" value={count(vehicles.error, reminders.length)} icon={AlertCircle} tone="red" href="/dashboard/vehicles" loading={vehicles.loading} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Your next appointment" href="/dashboard/bookings">
          {!next ? (
            <p className={EMPTY}>{loading ? "Loading…" : "Nothing booked. Compare garages and book your next service."}</p>
          ) : (
            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xl font-bold text-slate-900 dark:text-white">{next.timeConfirmed ? formatDate(next.scheduledAt) : "Time to be agreed"}</p>
                  <p className="font-medium text-slate-700 dark:text-slate-200">{getServiceLabel(next.serviceType)}</p>
                </div>
                <StatusPill status={next.status} />
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                <Link href={`/garage/${next.garage.slug}`} className="font-medium text-slate-700 hover:underline dark:text-slate-200">
                  {next.garage.name}
                </Link>
                , {next.garage.city}
                {next.vehicle ? ` · ${next.vehicle.make} ${next.vehicle.model} (${next.vehicle.registration})` : ""}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {next.garage.phone && (
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${next.garage.phone.replace(/\s+/g, "")}`}>
                      <Phone className="mr-1.5 h-4 w-4" /> Call garage
                    </a>
                  </Button>
                )}
                <Button asChild variant="outline" size="sm">
                  <Link href="/dashboard/messages">
                    <MessageSquare className="mr-1.5 h-4 w-4" /> Message
                  </Link>
                </Button>
              </div>
              {rest.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 border-t border-slate-100 dark:divide-white/10 dark:border-white/10">
                  {rest.slice(0, 3).map((y) => (
                    <li key={y.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-sm">
                      <span className="text-slate-700 dark:text-slate-200">
                        {getServiceLabel(y.serviceType)} · {y.garage.name}
                      </span>
                      <span className="text-slate-500 dark:text-slate-400">{y.timeConfirmed ? formatDate(y.scheduledAt) : "time to be agreed"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </Card>

        <Card title="Vehicle reminders" href="/dashboard/vehicles" linkLabel="My vehicles">
          {reminders.length === 0 ? (
            <p className={EMPTY}>{loading ? "Loading…" : v.length ? "Nothing due in the next 30 days." : "Add a vehicle to get MOT and service reminders."}</p>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {reminders.slice(0, 5).map((r) => (
                <li key={`${r.vehicle.id}-${r.kind}`} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900 dark:text-white">
                      {r.vehicle.make} {r.vehicle.model} · {r.vehicle.registration}
                    </p>
                    <p className="text-sm">
                      <span className="text-slate-500 dark:text-slate-400">{r.kind} </span>
                      <span className={r.days < 0 ? "font-semibold text-red-700 dark:text-red-400" : "font-medium text-amber-800 dark:text-amber-300"}>{dueLabel(r.days)}</span>
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href={`/search?service=${r.kind === "MOT" ? "MOT" : "FULL_SERVICE"}&reg=${encodeURIComponent(r.vehicle.registration)}`}>Get quotes</Link>
                  </Button>
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
              {recentQuotes.map((y) => (
                <li key={y.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{getServiceLabel(y.serviceType)}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {y.garage.name} · {y.price !== null ? formatCurrency(y.price) : "awaiting price"}
                    </p>
                  </div>
                  <StatusPill status={y.status} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={toReview.length ? "Leave a review" : "This year"} href={toReview.length ? "/dashboard/reviews" : "/dashboard/bookings?tab=past"} linkLabel={toReview.length ? undefined : "Past jobs"}>
          {toReview.length > 0 ? (
            <ul className="divide-y divide-slate-100 dark:divide-white/10">
              {toReview.slice(0, 3).map((y) => (
                <li key={y.id} className="flex items-center justify-between gap-4 py-3">
                  <div className="min-w-0">
                    <p className="font-medium text-slate-900 dark:text-white">{y.garage.name}</p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{getServiceLabel(y.serviceType)}</p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/dashboard/reviews">
                      <Star className="mr-1.5 h-4 w-4" /> Review
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : x && x.completedThisYear > 0 ? (
            <p className="text-sm text-slate-600 dark:text-slate-300">
              You&apos;ve had <strong className="text-slate-900 dark:text-white">{x.completedThisYear}</strong> job{x.completedThisYear === 1 ? "" : "s"} completed, totalling{" "}
              <strong className="text-slate-900 dark:text-white">{formatCurrency(x.spentThisYear)}</strong>.
            </p>
          ) : (
            <p className={EMPTY}>{loading || extras.loading ? "Loading…" : "Completed jobs and your spend will show here."}</p>
          )}
        </Card>
      </div>
    </>
  )
}
