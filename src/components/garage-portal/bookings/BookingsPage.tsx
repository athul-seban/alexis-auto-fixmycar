"use client"

import { useState } from "react"
import Link from "next/link"
import { CheckCheck, Download, Phone, Plus, SearchX, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { EmptyState } from "@/components/ui/empty-state"
import { Pagination } from "@/components/ui/pagination"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { sendJson, useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { defaultDir, type SortKey, type Tab } from "@/lib/portal/bookings-query"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { BookingDrawer } from "@/components/garage-portal/bookings/BookingDrawer"
import { BookingsFilters, CustomerSearch, FILTER_KEYS } from "@/components/garage-portal/bookings/BookingsFilters"
import { SavedViews } from "@/components/garage-portal/bookings/SavedViews"
import { BookingsTable } from "@/components/garage-portal/bookings/BookingsTable"
import { NewBookingDialog } from "@/components/garage-portal/bookings/NewBookingDialog"
import { EnquiryList } from "@/components/garage-portal/enquiries/EnquiryList"
import type { BookingsResponse, TechnicianOption } from "@/components/garage-portal/bookings/types"

const EMPTY_SET: ReadonlySet<string> = new Set()

type PageTab = Tab | "estimates"

const TAB_LABELS: { value: PageTab; label: string }[] = [
  { value: "all", label: "All" },
  { value: "estimates", label: "Estimates" },
  { value: "upcoming", label: "Upcoming" },
  { value: "today", label: "Today" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
]

// Query params forwarded to the API (everything except the open-drawer id).
const API_KEYS = ["tab", "sort", "dir", "page", "pageSize", ...FILTER_KEYS] as const

export function BookingsPage() {
  const { searchParams, setParams } = useUrlParams()
  const [newOpen, setNewOpen] = useState(false)
  const { toast } = useToast()
  // Selection belongs to one filtered page: it is dropped when the query (filters, page, sort) changes.
  const [selection, setSelection] = useState<{ query: string; ids: Set<string> }>({ query: "", ids: new Set() })
  const [cancelOpen, setCancelOpen] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)

  const pageTab = (searchParams.get("tab") ?? "all") as PageTab
  const estimates = pageTab === "estimates"
  const tab: Tab = estimates ? "all" : pageTab
  const sort = (searchParams.get("sort") ?? "booked") as SortKey
  const dir = (searchParams.get("dir") as "asc" | "desc" | null) ?? defaultDir(sort, tab)
  const page = Number(searchParams.get("page") ?? 1) || 1
  const pageSize = Number(searchParams.get("pageSize") ?? 25) || 25
  const openId = searchParams.get("booking")

  const apiParams = new URLSearchParams()
  for (const key of API_KEYS) {
    const v = searchParams.get(key)
    if (v) apiParams.set(key, v)
  }
  const query = apiParams.toString()
  const selected = selection.query === query ? selection.ids : EMPTY_SET
  const setSelected = (ids: Set<string>) => setSelection({ query, ids })

  // On the Estimates tab the list comes from the enquiries API; we still load page 1 of bookings for the tab counts.
  const { data, loading, error, reload } = useApi<BookingsResponse>(estimates ? "/api/garage/bookings?pageSize=10" : `/api/garage/bookings?${query}`)
  const { data: techData } = useApi<{ technicians: TechnicianOption[] }>("/api/garage/technicians")
  const technicians = techData?.technicians ?? []

  const rows = data?.bookings ?? []
  const total = data?.total ?? 0
  const filtersActive = FILTER_KEYS.some((k) => searchParams.get(k))

  async function bulk(action: "confirm" | "cancel" | "contacted") {
    setBulkBusy(true)
    const res = await sendJson<{ updated: string[]; failed: { id: string; reason: string }[] }>("/api/garage/bookings/bulk", "POST", { ids: [...selected], action })
    setBulkBusy(false)
    setCancelOpen(false)
    if (!res.ok || !res.data) return toast(res.error ?? "Bulk action failed", "error")
    const { updated, failed } = res.data
    toast(failed.length ? `${updated.length} updated, ${failed.length} skipped (${failed[0].reason})` : `${updated.length} booking${updated.length === 1 ? "" : "s"} updated`, failed.length && !updated.length ? "error" : "success")
    setSelected(new Set())
    reload()
  }

  const onSort = (key: SortKey) => {
    const nextDir = sort === key ? (dir === "asc" ? "desc" : "asc") : defaultDir(key, tab)
    setParams({ sort: key, dir: nextDir }, { resetPage: true })
  }

  const csvParams = new URLSearchParams(apiParams)
  csvParams.set("format", "csv")
  if (estimates) csvParams.delete("tab") // "estimates" isn't a bookings tab; export every booking instead
  csvParams.delete("page")
  csvParams.delete("pageSize")

  return (
    <>
      <PageHeader
        title="Bookings"
        description="All marketplace, widget and direct work booked into your garage."
        actions={
          <>
            <SavedViews params={searchParams} setParams={setParams} keys={["tab", ...FILTER_KEYS]} />
            <Button asChild variant="white" className="gap-2 border border-slate-200 dark:border-white/10">
              <a href={`/api/garage/bookings?${csvParams.toString()}`} download>
                <Download className="h-4 w-4" /> Export CSV
              </a>
            </Button>
            <Button variant="primary" className="gap-2" onClick={() => setNewOpen(true)}>
              <Plus className="h-4 w-4" /> New booking
            </Button>
          </>
        }
      />

      <Panel className="p-4 sm:p-6">
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">
            {estimates ? "Estimates" : `${TAB_LABELS.find((t) => t.value === tab)?.label ?? "All"} Bookings`}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400" aria-live="polite">
            {estimates
              ? "Quotes you've sent that are waiting for the customer to book."
              : data
                ? `${total} booking${total === 1 ? "" : "s"} found.`
                : "Loading bookings…"}
          </p>
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Tabs value={pageTab} onValueChange={(v) => setParams({ tab: v === "all" ? null : v, sort: null, dir: null }, { resetPage: true })} className="min-w-0">
            <TabsList>
              <Link
                href="/garage-dashboard/diary"
                className="-mb-px inline-flex items-center whitespace-nowrap border-b-2 border-transparent px-4 py-3 text-sm font-medium text-slate-500 transition-colors hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              >
                Diary
              </Link>
              {TAB_LABELS.map((t) => (
                <TabsTrigger key={t.value} value={t.value}>
                  {t.label}
                  {data && t.value !== "all" && data.counts[t.value] > 0 && (
                    <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{data.counts[t.value]}</span>
                  )}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
          <CustomerSearch params={searchParams} setParams={setParams} />
        </div>

        {estimates ? (
          <div className="mt-2">
            <EnquiryList
              stage="estimates"
              q={searchParams.get("q") || undefined}
              page={page}
              pageSize={pageSize}
              onPageChange={(p) => setParams({ page: p <= 1 ? null : p })}
              onPageSizeChange={(s) => setParams({ pageSize: s === 25 ? null : s }, { resetPage: true })}
              technicians={technicians}
              onBooked={(id) => setParams({ tab: null, booking: id })}
              emptyTitle="No estimates waiting"
              emptyDescription="Quotes you send to customers wait here until they book. You can also create the booking for them."
            />
          </div>
        ) : (
          <>
        <BookingsFilters params={searchParams} setParams={setParams} technicians={technicians} />

        {selected.size > 0 && (
          <div role="region" aria-label="Bulk actions" className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-[#1E3A5F] px-3 py-2 text-sm text-white">
            <span className="mr-auto font-semibold" aria-live="polite">{selected.size} selected</span>
            <Button size="sm" variant="white" className="gap-1.5" loading={bulkBusy} onClick={() => bulk("confirm")}><CheckCheck className="h-3.5 w-3.5" /> Confirm</Button>
            <Button size="sm" variant="white" className="gap-1.5" loading={bulkBusy} onClick={() => bulk("contacted")}><Phone className="h-3.5 w-3.5" /> Mark contacted</Button>
            <Button size="sm" variant="white" className="gap-1.5 text-red-600 dark:text-red-400" onClick={() => setCancelOpen(true)}>Cancel</Button>
            <button type="button" onClick={() => setSelected(new Set())} aria-label="Clear selection" className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg hover:bg-white/10"><X className="h-4 w-4" /></button>
          </div>
        )}

        <div className="mt-5 -mx-4 border-t border-slate-100 dark:border-white/10 sm:-mx-6">
          {error && !data ? (
            <div className="p-6 text-center">
              <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
              <Button size="sm" variant="secondary" onClick={reload}>Try again</Button>
            </div>
          ) : !loading && rows.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={filtersActive || tab !== "all" ? "No bookings match" : "No bookings yet"}
              description={filtersActive || tab !== "all" ? "Try removing a filter or switching tab." : "Bookings from the marketplace, your website widget and ones you add yourself will appear here."}
              action={!filtersActive && tab === "all" ? <Button variant="primary" size="sm" onClick={() => setNewOpen(true)}>Add a booking</Button> : undefined}
            />
          ) : (
            <BookingsTable rows={rows} loading={loading} sort={sort} dir={dir} onSort={onSort} onOpen={(id) => setParams({ booking: id })} selectedId={openId} selected={selected} onSelectedChange={setSelected} />
          )}
        </div>

        {total > 0 && (
          <Pagination
            className="mt-4"
            page={page}
            pageSize={pageSize}
            total={total}
            onPageChange={(p) => setParams({ page: p <= 1 ? null : p })}
            onPageSizeChange={(s) => setParams({ pageSize: s === 25 ? null : s }, { resetPage: true })}
          />
        )}
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title={`Cancel ${selected.size} booking${selected.size === 1 ? "" : "s"}?`}
        description="Customers with an account are notified. Bookings that can no longer be cancelled are skipped."
        confirmLabel="Cancel bookings"
        destructive
        loading={bulkBusy}
        onConfirm={() => bulk("cancel")}
      />
      <BookingDrawer bookingId={openId} onClose={() => setParams({ booking: null })} onChanged={reload} technicians={technicians} />
      <NewBookingDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        technicians={technicians}
        onCreated={(b) => {
          reload()
          setParams({ booking: b.id })
        }}
      />
    </>
  )
}
