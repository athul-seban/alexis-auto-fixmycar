"use client"

import { Printer } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, getServiceLabel } from "@/lib/utils"
import { sourceLabel } from "@/lib/portal/labels"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { formatPhone } from "@/lib/portal/phone"
import type { BookingDetail } from "@/components/garage-portal/bookings/types"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-b border-slate-300 pb-1.5">
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
      <dd className="min-h-5 text-sm text-slate-900">{children || "—"}</dd>
    </div>
  )
}

/** A one-page printable job card for the workshop: details up top, space to write below. */
export function JobSheet({ bookingId }: { bookingId: string }) {
  const { data, error } = useApi<{ booking: BookingDetail }>(`/api/garage/bookings/${bookingId}`)
  const b = data?.booking

  if (error && !b) return <p role="alert" className="text-sm text-red-600">{error}</p>
  if (!b) return <Skeleton className="h-96 w-full max-w-3xl" />

  const vehicle = [b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(" ")

  return (
    <div className="mx-auto max-w-3xl rounded-xl bg-white p-6 text-slate-900 print:max-w-none print:rounded-none print:p-0 sm:p-8">
      <div className="mb-6 flex items-start justify-between gap-4 print:mb-4">
        <div>
          <h1 className="text-2xl font-bold">Job sheet</h1>
          <p className="text-sm text-slate-500">{b.reference ?? "No reference"} · {sourceLabel(b.source)}</p>
        </div>
        <Button variant="primary" className="gap-2 print:hidden" onClick={() => window.print()}>
          <Printer className="h-4 w-4" /> Print
        </Button>
      </div>

      <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
        <Field label="Customer">{b.customerName}</Field>
        <Field label="Phone">{formatPhone(b.customerPhone)}</Field>
        <Field label="Registration">{b.vrm}</Field>
        <Field label="Vehicle">{vehicle}</Field>
        <Field label="Service">{getServiceLabel(b.serviceType)}</Field>
        <Field label="Booked for">{formatLondonDateTime(b.scheduledAt)}{b.durationMins ? ` (${b.durationMins} min)` : ""}</Field>
        <Field label="Technician">{b.technician?.name}</Field>
        <Field label="Quoted price">{formatCurrency(b.totalPrice)}</Field>
      </dl>

      {b.description && (
        <section className="mt-6">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Customer request</h2>
          <p className="whitespace-pre-wrap text-sm">{b.description}</p>
        </section>
      )}
      {b.notes && (
        <section className="mt-4">
          <h2 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Garage notes</h2>
          <p className="whitespace-pre-wrap text-sm">{b.notes}</p>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">Work carried out</h2>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-8 border-b border-slate-300" />
        ))}
      </section>

      <section className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
        {["Mileage in", "Final invoice (£)", "Completed by / date"].map((label) => (
          <div key={label}>
            <div className="h-8 border-b border-slate-400" />
            <p className="mt-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
          </div>
        ))}
      </section>
    </div>
  )
}
