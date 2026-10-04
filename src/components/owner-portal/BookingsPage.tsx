"use client"

import { Suspense, useState } from "react"
import Link from "next/link"
import { CalendarX, MessageSquare, Plus, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { formatCurrency, formatDate, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ReviewDialog } from "@/components/owner-portal/ReviewDialog"
import { ThreadDialog, type ThreadTarget } from "@/components/owner-portal/ThreadDialog"
import { isActiveStatus, type OwnerBooking } from "@/components/owner-portal/types"

type Tab = "upcoming" | "past" | "all"
const muted = "text-slate-500 dark:text-slate-400"

function BookingsInner() {
  const { toast } = useToast()
  const { searchParams, setParams } = useUrlParams()
  const tab = (searchParams.get("tab") ?? "upcoming") as Tab
  const { data, loading, error, reload } = useApi<{ bookings: OwnerBooking[] }>("/api/bookings")
  const [thread, setThread] = useState<ThreadTarget | null>(null)
  const [reviewing, setReviewing] = useState<OwnerBooking | null>(null)
  const [cancelling, setCancelling] = useState<OwnerBooking | null>(null)
  const [busy, setBusy] = useState(false)

  const all = data?.bookings ?? []
  const upcoming = all.filter((b) => isActiveStatus(b.status)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
  const past = all.filter((b) => !isActiveStatus(b.status))
  const rows = tab === "upcoming" ? upcoming : tab === "past" ? past : all

  const columns: DataColumn<OwnerBooking>[] = [
    {
      id: "service",
      header: "Service",
      mobile: "title",
      cell: (b) => (
        <span>
          <span className="font-medium text-slate-900 dark:text-white">{getServiceLabel(b.serviceType)}</span>
          <span className={`block text-xs font-normal ${muted}`}>
            {b.vehicle ? `${b.vehicle.registration} · ${b.vehicle.make} ${b.vehicle.model}` : "Vehicle details not saved"}
          </span>
        </span>
      ),
    },
    {
      id: "garage",
      header: "Garage",
      cell: (b) => (
        <Link href={`/garage/${b.garage.slug}`} className="relative z-10 underline-offset-2 hover:underline">
          {b.garage.name}, {b.garage.city}
        </Link>
      ),
    },
    {
      id: "when",
      header: "When",
      cell: (b) => (b.timeConfirmed ? formatDate(b.scheduledAt) : <span className="text-amber-600 dark:text-amber-400">Time to be agreed</span>),
    },
    { id: "ref", header: "Reference", className: muted, mobile: "hidden", cell: (b) => b.reference ?? "—" },
    { id: "price", header: "Price", cell: (b) => formatCurrency(b.totalPrice) },
    { id: "status", header: "Status", mobile: "badge", cell: (b) => <StatusPill status={b.status} /> },
    {
      id: "actions",
      header: "",
      mobile: "actions",
      cell: (b) => (
        <>
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setThread({ kind: "booking", id: b.id, garageName: b.garage.name })} aria-label={`Message ${b.garage.name}`}>
            <MessageSquare className="h-3.5 w-3.5" /> Message
          </Button>
          {b.status === "COMPLETED" && !b.review && (
            <Button size="sm" variant="outline" className="gap-1.5" onClick={() => setReviewing(b)}>
              <Star className="h-3.5 w-3.5" /> Review
            </Button>
          )}
          {["PENDING", "CONFIRMED"].includes(b.status) && (
            <Button size="sm" variant="secondary" className="text-red-600 dark:text-red-400" onClick={() => setCancelling(b)}>
              Cancel
            </Button>
          )}
        </>
      ),
    },
  ]

  async function cancel() {
    if (!cancelling) return
    setBusy(true)
    const res = await sendJson("/api/bookings", "PATCH", { bookingId: cancelling.id, status: "CANCELLED" })
    setBusy(false)
    if (!res.ok) return toast(res.error ?? "Couldn't cancel the booking", "error")
    toast("Booking cancelled")
    setCancelling(null)
    reload()
  }

  return (
    <>
      <PageHeader
        title="Bookings"
        description="Your upcoming and past garage visits."
        actions={
          <Button asChild variant="default" className="gap-2">
            <Link href="/search">
              <Plus className="h-4 w-4" /> Book a service
            </Link>
          </Button>
        }
      />
      <Panel className="p-4 sm:p-6">
        <Tabs value={tab} onValueChange={(v) => setParams({ tab: v === "upcoming" ? null : v })} className="mb-2">
          <TabsList aria-label="Booking filter">
            <TabsTrigger value="upcoming">Upcoming ({upcoming.length})</TabsTrigger>
            <TabsTrigger value="past">Past ({past.length})</TabsTrigger>
            <TabsTrigger value="all">All ({all.length})</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="-mx-4 sm:-mx-6">
          {error && !data ? (
            <p role="alert" className="p-6 text-center text-sm text-red-600 dark:text-red-400">
              {error}
            </p>
          ) : (
            <DataTable
              caption="Your bookings"
              columns={columns}
              rows={rows}
              rowKey={(b) => b.id}
              loading={loading}
              empty={
                <EmptyState
                  icon={CalendarX}
                  title={tab === "upcoming" ? "No upcoming bookings" : "Nothing here yet"}
                  description="Find a garage and book a service in a couple of minutes."
                  action={
                    <Button asChild variant="primary" size="sm">
                      <Link href="/search">Find garages</Link>
                    </Button>
                  }
                />
              }
            />
          )}
        </div>
      </Panel>

      <ThreadDialog target={thread} onClose={() => setThread(null)} />
      <ReviewDialog
        bookingId={reviewing?.id ?? null}
        garageName={reviewing?.garage.name}
        onClose={() => setReviewing(null)}
        onSubmitted={() => {
          setReviewing(null)
          reload()
        }}
      />
      <ConfirmDialog
        open={cancelling !== null}
        onOpenChange={(o) => !o && setCancelling(null)}
        title="Cancel this booking?"
        description={cancelling ? `${getServiceLabel(cancelling.serviceType)} at ${cancelling.garage.name}. The garage will be told straight away.` : ""}
        confirmLabel="Cancel booking"
        destructive
        loading={busy}
        onConfirm={cancel}
      />
    </>
  )
}

export function OwnerBookingsPage() {
  return (
    <Suspense fallback={null}>
      <BookingsInner />
    </Suspense>
  )
}
