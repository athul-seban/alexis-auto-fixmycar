"use client"

import { useEffect, useState } from "react"
import { Inbox } from "lucide-react"
import { EmptyState } from "@/components/ui/empty-state"
import { Pagination } from "@/components/ui/pagination"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import type { EnquiriesResult, EnquiryKind, EnquiryRow, EnquiryStage } from "@/lib/portal/enquiries"
import { EnquiryCard } from "@/components/garage-portal/enquiries/EnquiryCard"
import { EstimateBookingDialog } from "@/components/garage-portal/enquiries/EstimateBookingDialog"
import type { TechnicianOption } from "@/components/garage-portal/bookings/types"

interface EnquiryListProps {
  stage: EnquiryStage
  kind?: EnquiryKind
  q?: string
  page: number
  pageSize: number
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
  technicians: TechnicianOption[]
  highlightKey?: string | null
  /** Tell the parent counts changed (tab badges). */
  onData?: (result: EnquiriesResult) => void
  /** Called after a booking is made, so the parent can navigate/refresh. */
  onBooked?: (bookingId: string) => void
  emptyTitle?: string
  emptyDescription?: string
}

export function EnquiryList({
  stage, kind, q, page, pageSize, onPageChange, onPageSizeChange, technicians, highlightKey, onData, onBooked, emptyTitle, emptyDescription,
}: EnquiryListProps) {
  const { toast } = useToast()
  const params = new URLSearchParams({ stage, page: String(page), pageSize: String(pageSize) })
  if (kind) params.set("kind", kind)
  if (q) params.set("q", q)

  const { data, loading, error, reload } = useApi<EnquiriesResult>(`/api/garage/enquiries?${params}`)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [booking, setBooking] = useState<EnquiryRow | null>(null)

  useEffect(() => {
    if (data) onData?.(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data])

  // Deep link: scroll the targeted enquiry into view once it has rendered.
  useEffect(() => {
    if (!highlightKey || !data) return
    document.getElementById(`enq-${highlightKey}`)?.scrollIntoView({ behavior: "smooth", block: "center" })
  }, [highlightKey, data])

  const work = async (row: EnquiryRow, patch: { contacted?: boolean; ignored?: boolean }) => {
    setBusyKey(row.key)
    const res = await sendJson(`/api/garage/enquiries/${row.kind.toLowerCase()}/${row.id}`, "PATCH", patch)
    setBusyKey(null)
    if (!res.ok) return toast(res.error ?? "Couldn't update that enquiry", "error")
    reload()
  }

  if (error && !data) {
    return (
      <div className="py-10 text-center">
        <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        <Button size="sm" variant="secondary" onClick={reload}>Try again</Button>
      </div>
    )
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 w-full rounded-xl" />)}
      </div>
    )
  }

  return (
    <>
      {data.enquiries.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white dark:border-white/10 dark:bg-slate-800">
          <EmptyState icon={Inbox} title={emptyTitle ?? "Nothing here"} description={emptyDescription ?? "Customer requests will show up here."} />
        </div>
      ) : (
        <div className={loading ? "space-y-4 opacity-60 transition-opacity" : "space-y-4"}>
          {data.enquiries.map((row) => (
            <EnquiryCard
              key={row.key}
              enquiry={row}
              highlighted={row.key === highlightKey}
              busy={busyKey === row.key}
              onWork={(patch) => work(row, patch)}
              onBook={() => setBooking(row)}
              onQuoted={() => { toast("Quote sent"); reload() }}
            />
          ))}
        </div>
      )}

      {data.total > pageSize && (
        <Pagination className="mt-5" page={page} pageSize={pageSize} total={data.total} pageSizes={[10, 25, 50]} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      )}

      <EstimateBookingDialog
        enquiry={booking}
        technicians={technicians}
        onOpenChange={(open) => !open && setBooking(null)}
        onCreated={(b) => {
          reload()
          onBooked?.(b.id)
        }}
      />
    </>
  )
}
