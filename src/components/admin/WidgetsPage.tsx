"use client"

import { ShieldAlert, ShieldCheck } from "lucide-react"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { timeAgo } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface WidgetRow {
  id: string
  name: string
  slug: string
  bookings7d: number
  bookings24h: number
  lastHour: number
  cancelled7d: number
  lastBookingAt: string | null
}
interface Flag {
  kind: "ip" | "email"
  garage: string
  count: number
  lastAt: string
}
interface WidgetsResponse {
  garages: WidgetRow[]
  flags: Flag[]
  totals: { enabledGarages: number; bookings7d: number; bookings24h: number }
}

const muted = "text-slate-500 dark:text-slate-400"

const GARAGE_COLUMNS: DataColumn<WidgetRow>[] = [
  { id: "name", header: "Garage", mobile: "title", className: "font-medium text-slate-900 dark:text-white", cell: (g) => g.name },
  { id: "7d", header: "Last 7 days", cell: (g) => g.bookings7d },
  { id: "24h", header: "Last 24 hours", cell: (g) => g.bookings24h },
  { id: "1h", header: "Last hour", cell: (g) => g.lastHour },
  { id: "cancelled", header: "Cancelled (7d)", className: muted, cell: (g) => g.cancelled7d },
  { id: "last", header: "Latest booking", className: muted, cell: (g) => (g.lastBookingAt ? timeAgo(g.lastBookingAt) : "—") },
]

const FLAG_COLUMNS: DataColumn<Flag>[] = [
  { id: "kind", header: "Repeated", mobile: "title", className: "font-medium text-slate-900 dark:text-white", cell: (f) => (f.kind === "ip" ? "Same network address" : "Same email address") },
  { id: "garage", header: "Garage", cell: (f) => f.garage },
  { id: "count", header: "Bookings (24h)", cell: (f) => f.count },
  { id: "last", header: "Latest", className: muted, cell: (f) => timeAgo(f.lastAt) },
]

const emptyNote = (text: string) => <p className="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400">{text}</p>

export function AdminWidgetsPage() {
  const { data, loading, error } = useApi<WidgetsResponse>("/api/admin/widgets")

  return (
    <>
      <PageHeader title="Widgets" description="Garages running the embeddable booking widget, and visitors who book repeatedly." />
      {error && !data && (
        <p role="alert" className="mb-4 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatTile label="Garages with widget on" value={data?.totals.enabledGarages} loading={!data} icon={ShieldCheck} tone="blue" />
        <StatTile label="Widget bookings (7 days)" value={data?.totals.bookings7d} loading={!data} icon={ShieldCheck} tone="green" />
        <StatTile
          label="Repeat-visitor flags"
          value={data?.flags.length}
          loading={!data}
          icon={ShieldAlert}
          tone={data && data.flags.length > 0 ? "red" : "green"}
          hint="Three or more widget bookings from the same network address or email at one garage within 24 hours. The widget already blocks more than 3 an hour."
        />
      </div>

      <Panel className="mb-6 p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Repeat visitors</h2>
        <div className="-mx-4 border-t border-slate-100 dark:border-white/10 sm:-mx-6">
          <DataTable
            caption="Repeat widget visitors"
            columns={FLAG_COLUMNS}
            rows={data?.flags ?? []}
            rowKey={(f) => `${f.kind}-${f.garage}-${f.lastAt}`}
            loading={loading}
            empty={emptyNote("No unusual activity in the last 24 hours.")}
          />
        </div>
      </Panel>

      <Panel className="p-4 sm:p-6">
        <h2 className="mb-2 text-lg font-bold text-slate-900 dark:text-white">Garages</h2>
        <div className="-mx-4 border-t border-slate-100 dark:border-white/10 sm:-mx-6">
          <DataTable
            caption="Garages with the booking widget enabled"
            columns={GARAGE_COLUMNS}
            rows={data?.garages ?? []}
            rowKey={(g) => g.id}
            loading={loading}
            empty={emptyNote("No approved garage has the widget switched on.")}
          />
        </div>
      </Panel>
    </>
  )
}
