"use client"

import { useState } from "react"
import { Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import type { DataColumn } from "@/components/ui/data-table"
import { NativeSelect } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn, formatCurrency, formatDate, getServiceLabel, timeAgo } from "@/lib/utils"
import { SOURCE_OPTIONS, sourceLabel } from "@/lib/portal/labels"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ResourceList } from "@/components/admin/ResourceList"

const muted = "text-slate-500 dark:text-slate-400"
const bold = "font-medium text-slate-900 dark:text-white"

// ───────────────────────── Bookings ─────────────────────────

interface AdminBooking {
  id: string
  serviceType: string
  status: string
  totalPrice: number
  scheduledAt: string
  garage: string
  customer: string
  source: string
  reference: string | null
}

const BOOKING_COLUMNS: DataColumn<AdminBooking>[] = [
  { id: "customer", header: "Customer", mobile: "title", className: bold, cell: (b) => b.customer },
  { id: "ref", header: "Reference", className: muted, cell: (b) => b.reference ?? "—" },
  { id: "garage", header: "Garage", cell: (b) => b.garage },
  { id: "service", header: "Service", className: muted, cell: (b) => getServiceLabel(b.serviceType) },
  { id: "source", header: "Source", className: muted, cell: (b) => sourceLabel(b.source) },
  { id: "when", header: "Scheduled", className: muted, cell: (b) => formatDate(b.scheduledAt) },
  { id: "price", header: "Price", cell: (b) => formatCurrency(b.totalPrice) },
  { id: "status", header: "Status", mobile: "badge", cell: (b) => <StatusPill status={b.status} /> },
]

export function AdminBookingsPage() {
  return (
    <ResourceList<AdminBooking>
      title="Bookings"
      description="Every booking across the marketplace, booking widgets and garages' own diaries."
      caption="All bookings"
      endpoint="/api/admin/bookings"
      itemsKey="bookings"
      columns={BOOKING_COLUMNS}
      rowKey={(b) => b.id}
      tabs={{
        param: "status",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All" },
          { value: "PENDING", label: "Pending", countKey: "PENDING" },
          { value: "CONFIRMED", label: "Confirmed", countKey: "CONFIRMED" },
          { value: "IN_PROGRESS", label: "In progress", countKey: "IN_PROGRESS" },
          { value: "COMPLETED", label: "Completed", countKey: "COMPLETED" },
          { value: "CANCELLED", label: "Cancelled", countKey: "CANCELLED" },
          { value: "NO_SHOW", label: "No-show", countKey: "NO_SHOW" },
        ],
      }}
      searchPlaceholder="Search customer, reg or reference…"
      extraParams={["source"]}
      filters={(params, setParams) => (
        <div className="w-full sm:w-44">
          <NativeSelect aria-label="Filter by source" value={params.get("source") ?? ""} onChange={(e) => setParams({ source: e.target.value || null }, { resetPage: true })}>
            <option value="">All sources</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      )}
      emptyTitle="No bookings yet"
    />
  )
}

// ───────────────────────── Quotes ─────────────────────────

interface AdminQuote {
  id: string
  serviceType: string
  status: string
  price: number | null
  createdAt: string
  customer: string
  garage: string
  vehicle: string
}

const QUOTE_COLUMNS: DataColumn<AdminQuote>[] = [
  { id: "customer", header: "Customer", mobile: "title", className: bold, cell: (q) => q.customer },
  { id: "garage", header: "Garage", cell: (q) => q.garage },
  { id: "vehicle", header: "Vehicle", className: muted, cell: (q) => q.vehicle },
  { id: "service", header: "Service", className: muted, cell: (q) => getServiceLabel(q.serviceType) },
  { id: "price", header: "Quote", cell: (q) => (q.price === null ? "—" : formatCurrency(q.price)) },
  { id: "created", header: "Requested", className: muted, cell: (q) => formatDate(q.createdAt) },
  { id: "status", header: "Status", mobile: "badge", cell: (q) => <StatusPill status={q.status} /> },
]

export function AdminQuotesPage() {
  return (
    <ResourceList<AdminQuote>
      title="Quotes"
      description="Quote requests from signed-in customers and the garages' responses."
      caption="All quotes"
      endpoint="/api/admin/quotes"
      itemsKey="quotes"
      columns={QUOTE_COLUMNS}
      rowKey={(q) => q.id}
      tabs={{
        param: "status",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All" },
          { value: "PENDING", label: "Pending", countKey: "PENDING" },
          { value: "SENT", label: "Sent", countKey: "SENT" },
          { value: "ACCEPTED", label: "Accepted", countKey: "ACCEPTED" },
          { value: "REJECTED", label: "Rejected", countKey: "REJECTED" },
          { value: "EXPIRED", label: "Expired", countKey: "EXPIRED" },
        ],
      }}
      searchPlaceholder="Search customer, garage or registration…"
      emptyTitle="No quotes yet"
    />
  )
}

// ───────────────────────── Enquiries (guest job requests) ─────────────────────────

interface AdminEnquiry {
  id: string
  status: string
  guestName: string
  guestEmail: string
  serviceType: string
  registration: string
  make: string
  model: string
  city: string
  postcode: string
  createdAt: string
  responseCount: number
  lowestPrice: number | null
  acceptedGarage: string | null
}

const ENQUIRY_COLUMNS: DataColumn<AdminEnquiry>[] = [
  {
    id: "guest",
    header: "Customer",
    mobile: "title",
    cell: (e) => (
      <span>
        <span className={bold}>{e.guestName}</span>
        <span className={cn("block text-xs font-normal", muted)}>{e.guestEmail}</span>
      </span>
    ),
  },
  { id: "vehicle", header: "Vehicle", className: muted, cell: (e) => `${e.registration} · ${e.make} ${e.model}` },
  { id: "service", header: "Service", className: muted, cell: (e) => getServiceLabel(e.serviceType) },
  { id: "where", header: "Location", className: muted, cell: (e) => `${e.city} ${e.postcode}` },
  { id: "responses", header: "Quotes", cell: (e) => (e.responseCount ? `${e.responseCount} from ${formatCurrency(e.lowestPrice ?? 0)}` : "None yet") },
  { id: "garage", header: "Booked with", className: muted, cell: (e) => e.acceptedGarage ?? "—" },
  { id: "created", header: "Posted", className: muted, cell: (e) => timeAgo(e.createdAt) },
  { id: "status", header: "Status", mobile: "badge", cell: (e) => <StatusPill status={e.status} /> },
]

export function AdminEnquiriesPage() {
  return (
    <ResourceList<AdminEnquiry>
      title="Enquiries"
      description="Job requests posted by visitors without an account."
      caption="All job requests"
      endpoint="/api/admin/enquiries"
      itemsKey="enquiries"
      columns={ENQUIRY_COLUMNS}
      rowKey={(e) => e.id}
      tabs={{
        param: "status",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All" },
          { value: "OPEN", label: "Open", countKey: "OPEN" },
          { value: "QUOTED", label: "Quoted", countKey: "QUOTED" },
          { value: "BOOKED", label: "Booked", countKey: "BOOKED" },
          { value: "CANCELLED", label: "Cancelled", countKey: "CANCELLED" },
        ],
      }}
      searchPlaceholder="Search name, email, location or reg…"
      emptyTitle="No job requests yet"
    />
  )
}

// ───────────────────────── Vehicles ─────────────────────────

interface AdminVehicle {
  id: string
  registration: string
  make: string
  model: string
  year: number
  mileage: number | null
  motDueDate: string | null
  serviceDueDate: string | null
  owner: { name: string | null; email: string }
  bookingCount: number
  quoteCount: number
}

const dueCell = (iso: string | null) => (iso ? formatDate(iso) : "—")

const VEHICLE_COLUMNS: DataColumn<AdminVehicle>[] = [
  { id: "reg", header: "Registration", mobile: "title", cell: (v) => <span className="plate-number">{v.registration}</span> },
  { id: "vehicle", header: "Vehicle", cell: (v) => `${v.make} ${v.model} (${v.year})` },
  { id: "owner", header: "Owner", className: muted, cell: (v) => v.owner.name ?? v.owner.email },
  { id: "mot", header: "MOT due", className: muted, cell: (v) => dueCell(v.motDueDate) },
  { id: "service", header: "Service due", className: muted, cell: (v) => dueCell(v.serviceDueDate) },
  { id: "activity", header: "Activity", className: muted, cell: (v) => `${v.bookingCount} bookings · ${v.quoteCount} quotes` },
]

export function AdminVehiclesPage() {
  return (
    <ResourceList<AdminVehicle>
      title="Vehicles"
      description="Vehicles saved by customers, including upcoming MOT and service dates."
      caption="All vehicles"
      endpoint="/api/admin/vehicles"
      itemsKey="vehicles"
      columns={VEHICLE_COLUMNS}
      rowKey={(v) => v.id}
      searchPlaceholder="Search reg, make, model or owner…"
      extraParams={["dueSoon"]}
      filters={(params, setParams) => (
        <label className="flex h-10 cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={params.get("dueSoon") === "true"}
            onChange={(e) => setParams({ dueSoon: e.target.checked ? "true" : null }, { resetPage: true })}
            className="h-4 w-4 cursor-pointer accent-[#1E3A5F]"
          />
          Due in 30 days
        </label>
      )}
      emptyTitle="No vehicles yet"
    />
  )
}

// ───────────────────────── Messages ─────────────────────────

interface AdminThread {
  key: string
  quoteId: string | null
  bookingId: string | null
  garageName: string
  lastBody: string
  lastSenderRole: string
  lastAt: string
  messageCount: number
}

interface ThreadMessage {
  id: string
  body: string
  createdAt: string
  sender: { id: string; name: string | null; email: string; role: string }
}

function ThreadDialog({ thread, onClose }: { thread: AdminThread | null; onClose: () => void }) {
  const qs = thread ? (thread.quoteId ? `quoteId=${thread.quoteId}` : `bookingId=${thread.bookingId}`) : null
  const { data, loading } = useApi<{ messages: ThreadMessage[] }>(qs ? `/api/admin/messages?${qs}` : null)
  return (
    <Dialog open={thread !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Conversation with {thread?.garageName}</DialogTitle>
          <DialogDescription>Read-only view for moderation.</DialogDescription>
        </DialogHeader>
        {loading && !data ? (
          <p className={cn("py-6 text-center text-sm", muted)}>Loading…</p>
        ) : (
          <ul className="max-h-[50dvh] space-y-3 overflow-y-auto pr-1">
            {data?.messages.map((m) => (
              <li key={m.id} className="rounded-lg bg-slate-50 p-3 text-sm dark:bg-slate-900">
                <div className="mb-1 flex items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <span className="font-semibold">
                    {m.sender.name ?? m.sender.email} · {m.sender.role.toLowerCase()}
                  </span>
                  <span>{timeAgo(m.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap break-words text-slate-800 dark:text-slate-200">{m.body}</p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  )
}

const THREAD_COLUMNS: DataColumn<AdminThread>[] = [
  { id: "garage", header: "Garage", mobile: "title", className: bold, cell: (t) => t.garageName },
  { id: "kind", header: "About", className: muted, cell: (t) => (t.quoteId ? "Quote" : "Booking") },
  { id: "last", header: "Latest message", className: "max-w-sm truncate", cell: (t) => t.lastBody },
  { id: "count", header: "Messages", className: muted, cell: (t) => t.messageCount },
  { id: "at", header: "Last activity", className: muted, cell: (t) => timeAgo(t.lastAt) },
]

export function AdminMessagesPage() {
  const [open, setOpen] = useState<AdminThread | null>(null)
  return (
    <ResourceList<AdminThread>
      title="Messages"
      description="Conversations between customers and garages."
      caption="Message threads"
      endpoint="/api/admin/messages"
      itemsKey="threads"
      columns={THREAD_COLUMNS}
      rowKey={(t) => t.key}
      searchPlaceholder="Search garage or message…"
      onRowClick={setOpen}
      rowLabel={(t) => `Open conversation with ${t.garageName}`}
      emptyTitle="No conversations yet"
    >
      {() => <ThreadDialog thread={open} onClose={() => setOpen(null)} />}
    </ResourceList>
  )
}

// ───────────────────────── Reviews ─────────────────────────

interface AdminReview {
  id: string
  rating: number
  title: string | null
  comment: string
  createdAt: string
  garage: string
  customer: string
}

function Stars({ rating }: { rating: number }) {
  return (
    <span className="whitespace-nowrap text-amber-500" role="img" aria-label={`${rating} out of 5`}>
      {"★".repeat(rating)}
      <span className="text-slate-300 dark:text-slate-600">{"★".repeat(5 - rating)}</span>
    </span>
  )
}

export function AdminReviewsPage() {
  const { toast } = useToast()
  const [target, setTarget] = useState<AdminReview | null>(null)
  const [busy, setBusy] = useState(false)

  const columns: DataColumn<AdminReview>[] = [
    { id: "rating", header: "Rating", mobile: "title", cell: (r) => <Stars rating={r.rating} /> },
    { id: "garage", header: "Garage", className: bold, cell: (r) => r.garage },
    { id: "customer", header: "Customer", className: muted, cell: (r) => r.customer },
    {
      id: "comment",
      header: "Review",
      className: "max-w-md",
      cell: (r) => (
        <span className="line-clamp-2 whitespace-normal">
          {r.title && <strong>{r.title}. </strong>}
          {r.comment}
        </span>
      ),
    },
    { id: "when", header: "Posted", className: muted, cell: (r) => timeAgo(r.createdAt) },
    {
      id: "actions",
      header: "",
      mobile: "actions",
      cell: (r) => (
        <Button size="sm" variant="secondary" className="gap-1.5 text-red-700 dark:text-red-400" onClick={() => setTarget(r)} aria-label={`Delete review by ${r.customer}`}>
          <Trash2 className="h-3.5 w-3.5" /> Delete
        </Button>
      ),
    },
  ]

  return (
    <ResourceList<AdminReview>
      title="Reviews"
      description="Moderate customer reviews. Deleting a review also adjusts the garage's rating."
      caption="All reviews"
      endpoint="/api/admin/reviews"
      itemsKey="reviews"
      columns={columns}
      rowKey={(r) => r.id}
      tabs={{
        param: "rating",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All" },
          ...[5, 4, 3, 2, 1].map((n) => ({ value: String(n), label: `${n}★` })),
        ],
      }}
      searchPlaceholder="Search review, garage or customer…"
      emptyTitle="No reviews yet"
    >
      {({ reload }) => (
        <ConfirmDialog
          open={target !== null}
          onOpenChange={(o) => !o && setTarget(null)}
          title="Delete this review?"
          description="The review is removed permanently and the garage's average rating is recalculated."
          confirmLabel="Delete review"
          destructive
          loading={busy}
          onConfirm={async () => {
            if (!target) return
            setBusy(true)
            const res = await sendJson("/api/admin/reviews", "DELETE", { reviewId: target.id })
            setBusy(false)
            if (!res.ok) return toast(res.error ?? "Couldn't delete the review", "error")
            toast("Review deleted")
            setTarget(null)
            reload()
          }}
        />
      )}
    </ResourceList>
  )
}
