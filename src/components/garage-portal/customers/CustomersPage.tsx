"use client"

import { Suspense } from "react"
import { Download, Users } from "lucide-react"
import { Button } from "@/components/ui/button"
import { DataTable, type DataColumn } from "@/components/ui/data-table"
import { EmptyState } from "@/components/ui/empty-state"
import { ParamSearch } from "@/components/ui/param-search"
import { Pagination } from "@/components/ui/pagination"
import { StatTile } from "@/components/ui/stat-tile"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { formatCurrency } from "@/lib/utils"
import { formatPhone } from "@/lib/portal/phone"
import { formatLondonDate } from "@/lib/portal/tz"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { CustomerDrawer } from "@/components/garage-portal/customers/CustomerDrawer"
import type { CustomerRow } from "@/components/garage-portal/customers/types"

type SortKey = "name" | "bookings" | "spend" | "lastVisit"

interface ListResponse {
  customers: CustomerRow[]
  total: number
  summary: { customers: number; repeat: number; spend: number }
}

const muted = "text-slate-500 dark:text-slate-400"
const dash = <span className="text-slate-400 dark:text-slate-500">—</span>

const COLUMNS: DataColumn<CustomerRow, SortKey>[] = [
  {
    id: "name",
    header: "Customer",
    sortKey: "name",
    mobile: "title",
    cell: (c) => (
      <span>
        <span className="font-medium text-slate-900 dark:text-white">{c.name}</span>
        <span className={`block text-xs font-normal ${muted}`}>{c.email ?? (c.phone ? formatPhone(c.phone) : "No contact details")}</span>
      </span>
    ),
  },
  { id: "vehicles", header: "Vehicles", className: muted, cell: (c) => (c.vehicles.length ? c.vehicles.map((v) => v.vrm).join(", ") : dash) },
  { id: "bookings", header: "Bookings", sortKey: "bookings", cell: (c) => c.bookings },
  { id: "spend", header: "Spend", sortKey: "spend", mobile: "badge", cell: (c) => formatCurrency(c.spend) },
  { id: "last", header: "Last visit", sortKey: "lastVisit", className: muted, cell: (c) => (c.lastVisit ? formatLondonDate(c.lastVisit) : dash) },
  { id: "next", header: "Next booking", className: muted, cell: (c) => (c.nextBooking ? formatLondonDate(c.nextBooking) : dash) },
]

function CustomersInner() {
  const { searchParams, setParams } = useUrlParams()
  const sort = (searchParams.get("sort") ?? "lastVisit") as SortKey
  const dir = (searchParams.get("dir") as "asc" | "desc" | null) ?? (sort === "name" ? "asc" : "desc")
  const page = Number(searchParams.get("page") ?? 1) || 1
  const pageSize = Number(searchParams.get("pageSize") ?? 25) || 25
  const openKey = searchParams.get("customer")
  const q = searchParams.get("q")

  const api = new URLSearchParams({ sort, dir, page: String(page), pageSize: String(pageSize) })
  if (q) api.set("q", q)
  const { data, loading, error, reload } = useApi<ListResponse>(`/api/garage/customers?${api.toString()}`)

  const csv = new URLSearchParams({ sort, dir, format: "csv" })
  if (q) csv.set("q", q)

  const onSort = (key: SortKey) => {
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : key === "name" ? "asc" : "desc"
    setParams({ sort: key, dir: nextDir }, { resetPage: true })
  }

  return (
    <>
      <PageHeader
        title="Customers"
        description="Everyone who has booked with you, built from your bookings."
        actions={
          <Button asChild variant="white" className="gap-2 border border-slate-200 dark:border-white/10">
            <a href={`/api/garage/customers?${csv.toString()}`} download>
              <Download className="h-4 w-4" /> Export CSV
            </a>
          </Button>
        }
      />

      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3 sm:gap-4">
        <StatTile label="Customers" value={data?.summary.customers} icon={Users} tone="blue" loading={!data} />
        <StatTile label="Repeat customers" value={data?.summary.repeat} icon={Users} tone="purple" loading={!data} hint="Customers with two or more completed jobs." />
        <StatTile label="Lifetime spend" value={data ? formatCurrency(data.summary.spend) : undefined} icon={Users} tone="green" loading={!data} hint="Completed jobs: final invoice value if set, otherwise the quoted price." />
      </div>

      <Panel className="p-4 sm:p-6">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className={`text-sm ${muted}`} aria-live="polite">{data ? `${data.total} customer${data.total === 1 ? "" : "s"}` : "Loading…"}</p>
          <ParamSearch params={searchParams} setParams={setParams} placeholder="Search name, email, phone or reg…" label="Search customers" />
        </div>
        <div className="-mx-4 border-t border-slate-100 dark:border-white/10 sm:-mx-6">
          {error && !data ? (
            <p role="alert" className="p-6 text-center text-sm text-red-700 dark:text-red-400">{error}</p>
          ) : (
            <DataTable
              caption="Customers"
              columns={COLUMNS}
              rows={data?.customers ?? []}
              rowKey={(c) => c.key}
              loading={loading}
              sort={sort}
              dir={dir}
              onSort={onSort}
              onRowClick={(c) => setParams({ customer: c.key })}
              rowLabel={(c) => `Open ${c.name}`}
              selectedKey={openKey}
              empty={<EmptyState icon={Users} title={q ? "Nobody matches" : "No customers yet"} description={q ? "Try a different name, email, phone number or registration." : "Customers appear here as bookings come in."} />}
            />
          )}
        </div>
        {data && data.total > 0 && (
          <Pagination className="mt-4" page={page} pageSize={pageSize} total={data.total} onPageChange={(p) => setParams({ page: p <= 1 ? null : p })} onPageSizeChange={(s) => setParams({ pageSize: s === 25 ? null : s }, { resetPage: true })} />
        )}
      </Panel>

      <CustomerDrawer customerKey={openKey} onClose={() => setParams({ customer: null })} onChanged={reload} />
    </>
  )
}

export function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <CustomersInner />
    </Suspense>
  )
}
