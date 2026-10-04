"use client"

import { CheckCircle2, Clock } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { formatCurrency, getServiceLabel } from "@/lib/utils"
import { sourceLabel } from "@/lib/portal/labels"
import { formatLondonDateTime, formatLondonDate } from "@/lib/portal/tz"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { VrmPlate } from "@/components/garage-portal/shared/VrmPlate"
import type { BookingRow } from "@/components/garage-portal/bookings/types"

type SortKey = "vrm" | "name" | "vehicle" | "source" | "type" | "status" | "booked" | "created" | "price"

interface BookingsTableProps {
  rows: BookingRow[]
  loading: boolean
  sort: SortKey
  dir: "asc" | "desc"
  onSort: (key: SortKey) => void
  onOpen: (id: string) => void
  selectedId?: string | null
  selected: ReadonlySet<string>
  onSelectedChange: (next: Set<string>) => void
}

const muted = "text-slate-500 dark:text-slate-400"
const dash = <span className="text-slate-400 dark:text-slate-500">—</span>

const COLUMNS: DataColumn<BookingRow, SortKey>[] = [
  { id: "vrm", header: "VRM", sortKey: "vrm", mobile: "title", cell: (r) => <VrmPlate vrm={r.vrm} /> },
  {
    id: "name",
    header: "Name",
    sortKey: "name",
    className: "font-medium text-slate-900 dark:text-white",
    cell: (r) => r.customerName ?? "—",
  },
  {
    id: "vehicle",
    header: "Make / Model",
    sortKey: "vehicle",
    className: `max-w-[14rem] truncate ${muted}`,
    cell: (r) => [r.vehicleMake, r.vehicleModel].filter(Boolean).join(" - ") || "—",
  },
  { id: "source", header: "Source", sortKey: "source", mobile: "hidden", className: muted, cell: (r) => sourceLabel(r.source) },
  {
    id: "technician",
    header: "Technician",
    cell: (r) =>
      r.technician ? (
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: r.technician.color }} />
          {r.technician.name}
        </span>
      ) : (
        dash
      ),
  },
  { id: "type", header: "Booking Type", sortKey: "type", className: muted, cell: (r) => getServiceLabel(r.serviceType) },
  { id: "status", header: "Status", sortKey: "status", mobile: "badge", cell: (r) => <StatusPill status={r.displayStatus} /> },
  {
    id: "booked",
    header: "Booked",
    sortKey: "booked",
    cell: (r) => (
      <>
        {formatLondonDateTime(r.scheduledAt)}
        {!r.timeConfirmed && (
          <span
            title="This is a placeholder time — agree the appointment with the customer"
            className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
          >
            <Clock className="h-3 w-3" />
            TBC
          </span>
        )}
      </>
    ),
  },
  {
    id: "price",
    header: "Price",
    sortKey: "price",
    cell: (r) => (
      <>
        {formatCurrency(r.finalInvoiceValue ?? r.totalPrice)}
        {r.finalInvoiceValue !== null && r.finalInvoiceValue !== r.totalPrice && (
          <span className="ml-1 text-[10px] text-slate-400" title={`Quoted ${formatCurrency(r.totalPrice)}`}>
            final
          </span>
        )}
      </>
    ),
  },
  { id: "created", header: "Created", sortKey: "created", mobile: "hidden", className: muted, cell: (r) => formatLondonDate(r.createdAt) },
  {
    id: "contacted",
    header: "Contacted",
    cell: (r) =>
      r.contactedAt ? (
        <span className="inline-flex items-center gap-1 text-green-600 dark:text-green-400" title={`Contacted ${formatLondonDate(r.contactedAt)}`}>
          <CheckCircle2 className="h-4 w-4" />
          <span className="sr-only">Contacted</span>
        </span>
      ) : (
        dash
      ),
  },
]

export function BookingsTable({ rows, loading, sort, dir, onSort, onOpen, selectedId, selected, onSelectedChange }: BookingsTableProps) {
  return (
    <DataTable
      caption="Bookings"
      columns={COLUMNS}
      rows={rows}
      rowKey={(r) => r.id}
      loading={loading}
      sort={sort}
      dir={dir}
      onSort={onSort}
      onRowClick={(r) => onOpen(r.id)}
      rowLabel={(r) => `Open booking ${r.reference ?? ""} for ${r.customerName ?? "customer"}`}
      selectedKey={selectedId}
      skeletonRows={6}
      selectable
      selected={selected}
      onSelectedChange={onSelectedChange}
    />
  )
}
