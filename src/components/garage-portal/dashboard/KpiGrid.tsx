import { CalendarCheck, CalendarPlus, Globe, PoundSterling, Store, UserX } from "lucide-react"
import { StatTile } from "@/components/ui/stat-tile"
import { formatCurrency } from "@/lib/utils"
import type { ChannelKpis } from "@/lib/portal/kpi"

interface KpiGridProps {
  marketplace: ChannelKpis | null
  widget: ChannelKpis | null
  noShowRate: number | null
  loading: boolean
}

const money = (n: number) => formatCurrency(n).replace(/\.00$/, "")

export function KpiGrid({ marketplace, widget, noShowRate, loading }: KpiGridProps) {
  const FIV = "Final invoice value: the amount invoiced on completed bookings in this period (your final invoice value if you entered one, otherwise the booked price)."
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile loading={loading} icon={Store} tone="blue" value={marketplace?.created ?? 0} label="Marketplace Bookings Created"
        hint="Bookings that arrived through Quote My Garage (searches, quotes and job posts) and were created in this period." />
      <StatTile loading={loading} icon={CalendarCheck} tone="green" value={marketplace?.attended ?? 0} label="Marketplace Bookings Attended"
        hint="Marketplace bookings scheduled in this period where the customer attended (completed or in progress)." />
      <StatTile loading={loading} icon={PoundSterling} tone="purple" value={money(marketplace?.fiv ?? 0)} label="Marketplace FIV Total (Est.)" hint={FIV} />
      <StatTile loading={loading} icon={Globe} tone="orange" value={widget?.created ?? 0} label="Widget Bookings Created"
        hint="Bookings made through the booking widget on your own website and created in this period." />

      <StatTile loading={loading} icon={CalendarPlus} tone="green" value={widget?.attended ?? 0} label="Widget Bookings Attended"
        hint="Widget bookings scheduled in this period where the customer attended." />
      <StatTile loading={loading} icon={PoundSterling} tone="purple" value={money(widget?.fiv ?? 0)} label="Widget FIV Total (Est.)" hint={FIV} />
      <StatTile loading={loading} icon={UserX} tone="red" value={noShowRate === null ? "–" : `${noShowRate}%`} label="No Show Rate"
        hint="No-shows as a share of customers who were due: no-shows ÷ (attended + no-shows), across every booking source." />
    </div>
  )
}
