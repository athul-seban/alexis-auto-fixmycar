"use client"

import { useState } from "react"
import Link from "next/link"
import { FileX, MessageSquare } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { formatCurrency, formatDate, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ThreadDialog, type ThreadTarget } from "@/components/owner-portal/ThreadDialog"
import type { OwnerQuote } from "@/components/owner-portal/types"

const muted = "text-slate-500 dark:text-slate-400"

export function OwnerQuotesPage() {
  const { toast } = useToast()
  const { data, loading, error, reload } = useApi<{ quotes: OwnerQuote[] }>("/api/quotes")
  const [thread, setThread] = useState<ThreadTarget | null>(null)
  const [bookingId, setBookingId] = useState<string | null>(null)

  const quotes = data?.quotes ?? []
  const waiting = quotes.filter((q) => q.status === "SENT").length

  async function bookFrom(q: OwnerQuote) {
    setBookingId(q.id)
    // No scheduledAt: the garage agrees the actual appointment time with the customer.
    const res = await sendJson("/api/bookings", "POST", {
      vehicleId: q.vehicle.id,
      garageId: q.garage.id,
      quoteId: q.id,
      serviceType: q.serviceType,
      description: q.description,
      totalPrice: q.price,
    })
    setBookingId(null)
    if (!res.ok) return toast(res.error ?? "Couldn't book from this quote", "error")
    toast("Booked — the garage will confirm a time with you")
    reload()
  }

  const columns: DataColumn<OwnerQuote>[] = [
    {
      id: "service",
      header: "Service",
      mobile: "title",
      cell: (q) => (
        <span>
          <span className="font-medium text-slate-900 dark:text-white">{getServiceLabel(q.serviceType)}</span>
          <span className={`block text-xs font-normal ${muted}`}>
            {q.vehicle.registration} · {q.vehicle.make} {q.vehicle.model}
          </span>
        </span>
      ),
    },
    {
      id: "garage",
      header: "Garage",
      cell: (q) => (
        <Link href={`/garage/${q.garage.slug}`} className="relative z-10 underline-offset-2 hover:underline">
          {q.garage.name}, {q.garage.city}
        </Link>
      ),
    },
    { id: "asked", header: "Requested", className: muted, cell: (q) => formatDate(q.createdAt) },
    { id: "price", header: "Quote", cell: (q) => (q.price === null ? "Awaiting quote" : formatCurrency(q.price)) },
    { id: "status", header: "Status", mobile: "badge", cell: (q) => <StatusPill status={q.status} /> },
    {
      id: "actions",
      header: "",
      mobile: "actions",
      cell: (q) => (
        <>
          {q.status === "SENT" && q.price !== null && (
            <Button size="sm" variant="primary" loading={bookingId === q.id} onClick={() => bookFrom(q)}>
              Book now
            </Button>
          )}
          <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setThread({ kind: "quote", id: q.id, garageName: q.garage.name })} aria-label={`Message ${q.garage.name}`}>
            <MessageSquare className="h-3.5 w-3.5" /> Message
          </Button>
        </>
      ),
    },
  ]

  return (
    <>
      <PageHeader title="Quotes" description="Quote requests you've sent to garages and what they replied." />
      {waiting > 0 && (
        <p role="status" className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-4 text-sm text-orange-800 dark:border-orange-500/30 dark:bg-orange-500/10 dark:text-orange-300">
          You have <strong>{waiting} quote{waiting === 1 ? "" : "s"}</strong> waiting for your decision.
        </p>
      )}
      <Panel className="p-4 sm:p-6">
        <div className="-mx-4 sm:-mx-6">
          {error && !data ? (
            <p role="alert" className="p-6 text-center text-sm text-red-700 dark:text-red-400">
              {error}
            </p>
          ) : (
            <DataTable
              caption="Your quotes"
              columns={columns}
              rows={quotes}
              rowKey={(q) => q.id}
              loading={loading}
              empty={
                <EmptyState
                  icon={FileX}
                  title="No quotes yet"
                  description="Request a quote from any garage and their reply shows up here."
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
    </>
  )
}
