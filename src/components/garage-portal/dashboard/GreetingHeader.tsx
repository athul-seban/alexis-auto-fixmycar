import Link from "next/link"
import { CheckCircle2, Clock, Eye, ShieldAlert, Wrench } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { londonParts } from "@/lib/portal/tz"
import { garageLinks } from "@/lib/portal/links"
import { Panel } from "@/components/garage-portal/shared/PageHeader"

export interface OverviewGarage {
  name: string
  logo: string | null
  slug: string
  status: string
}

export function greetingFor(now: Date): string {
  const hour = londonParts(now).hour
  return hour < 12 ? "Morning," : hour < 18 ? "Afternoon," : "Evening,"
}

const LISTING = {
  APPROVED: { label: "Active Listing", icon: CheckCircle2, cls: "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" },
  PENDING: { label: "Awaiting approval", icon: Clock, cls: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300" },
  SUSPENDED: { label: "Suspended", icon: ShieldAlert, cls: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300" },
} as const

function CountPill({ label, value, href }: { label: string; value: number | null; href: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 px-4 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5"
    >
      <span className="flex items-center gap-2">
        <CheckCircle2 className="h-4 w-4 text-slate-500 dark:text-slate-400" />
        {label}
      </span>
      <span className="min-w-6 rounded-full bg-slate-100 px-2 py-0.5 text-center text-xs font-bold text-slate-700 dark:bg-white/10 dark:text-slate-200">
        {value ?? "–"}
      </span>
    </Link>
  )
}

interface GreetingHeaderProps {
  garage: OverviewGarage | null
  greeting: string
  dueToday: number | null
  createdToday: number | null
  todayDate: string
}

export function GreetingHeader({ garage, greeting, dueToday, createdToday, todayDate }: GreetingHeaderProps) {
  // No chip until the garage has loaded — never guess "pending" for a live garage.
  const status = garage ? (LISTING[garage.status as keyof typeof LISTING] ?? LISTING.PENDING) : null
  const live = garage?.status === "APPROVED"

  return (
    <Panel className="mb-8 p-5 sm:p-6">
      <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-4">
          {garage?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={garage.logo} alt="" className="h-20 w-20 flex-shrink-0 rounded-full border border-gray-200 object-cover dark:border-white/10" />
          ) : (
            <div className="flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-full" style={{ background: "linear-gradient(135deg, #1E3A5F, #2D5A8E)" }}>
              <Wrench className="h-9 w-9 text-white" />
            </div>
          )}
          <div className="min-w-0">
            <p className="text-sm text-slate-500 dark:text-slate-400">{greeting}</p>
            <h2 className="truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{garage?.name ?? "Welcome"}</h2>
            {status ? (
              <span className={cn("mt-1.5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold", status.cls)}>
                <status.icon className="h-3.5 w-3.5" />
                {status.label}
              </span>
            ) : (
              <Skeleton className="mt-1.5 h-6 w-28 rounded-full" />
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="grid gap-2 sm:grid-cols-2">
            <CountPill label="Bookings Due Today" value={dueToday} href={`${garageLinks.bookings}?tab=today`} />
            <CountPill label="Bookings Created Today" value={createdToday} href={`${garageLinks.bookings}?createdFrom=${todayDate}&createdTo=${todayDate}`} />
          </div>
          {live ? (
            <Button asChild variant="white" className="gap-2 border border-gray-200 dark:border-white/10">
              <Link href={`/garage/${garage!.slug}`} target="_blank" rel="noopener noreferrer">
                <Eye className="h-4 w-4" /> View Listing
              </Link>
            </Button>
          ) : (
            <Button variant="white" className="gap-2 border border-gray-200 dark:border-white/10" disabled title="Your listing isn't public yet">
              <Eye className="h-4 w-4" /> View Listing
            </Button>
          )}
        </div>
      </div>
    </Panel>
  )
}
