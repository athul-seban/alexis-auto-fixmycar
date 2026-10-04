"use client"

import { useState } from "react"
import { CalendarDays, ChevronDown, Search, SlidersHorizontal, X } from "lucide-react"
import { cn, getServiceLabel } from "@/lib/utils"
import { SERVICE_TYPES } from "@/lib/constants"
import { BOOKING_STATUSES, STATUS_LABELS } from "@/lib/portal/booking-status"
import { SOURCE_OPTIONS } from "@/lib/portal/labels"
import { formatCivilDate } from "@/lib/portal/tz"
import { NativeSelect, TextInput, FieldLabel } from "@/components/ui/form-controls"
import { DebouncedParamInput, type SetParams } from "@/components/ui/param-search"
import { Popover } from "@/components/ui/popover"
import type { TechnicianOption } from "@/components/garage-portal/bookings/types"

interface FiltersProps {
  params: URLSearchParams
  setParams: SetParams
  technicians: TechnicianOption[]
}

/** Keys that count as "a filter is applied" (excludes tab, sort, paging). */
export const FILTER_KEYS = ["q", "vrm", "source", "serviceType", "contacted", "bookedFrom", "bookedTo", "createdFrom", "createdTo", "status", "technicianId", "outcome"] as const

function DateRangeFilter({
  label, fromKey, toKey, params, setParams,
}: { label: string; fromKey: string; toKey: string; params: URLSearchParams; setParams: SetParams }) {
  const from = params.get(fromKey) ?? ""
  const to = params.get(toKey) ?? ""
  const active = from || to
  const summary = active
    ? `${from ? formatCivilDate(from) : "…"} – ${to ? formatCivilDate(to) : "…"}`
    : label

  return (
    <Popover
      trigger={({ open, toggle }) => (
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          className={cn(
            "flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm dark:bg-slate-900",
            active
              ? "border-[#1E3A5F] font-medium text-slate-900 dark:border-blue-400 dark:text-white"
              : "border-slate-200 text-slate-500 dark:border-slate-700 dark:text-slate-400"
          )}
        >
          <CalendarDays className="h-4 w-4 flex-shrink-0" />
          <span className="whitespace-nowrap">{summary}</span>
        </button>
      )}
    >
      {(close) => (
        <div className="space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">{label}</p>
          <div>
            <FieldLabel htmlFor={`${fromKey}-in`}>From</FieldLabel>
            <TextInput id={`${fromKey}-in`} type="date" value={from} max={to || undefined} onChange={(e) => setParams({ [fromKey]: e.target.value || null }, { resetPage: true })} />
          </div>
          <div>
            <FieldLabel htmlFor={`${toKey}-in`}>To</FieldLabel>
            <TextInput id={`${toKey}-in`} type="date" value={to} min={from || undefined} onChange={(e) => setParams({ [toKey]: e.target.value || null }, { resetPage: true })} />
          </div>
          <div className="flex justify-between pt-1">
            <button type="button" className="cursor-pointer text-xs font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white" onClick={() => setParams({ [fromKey]: null, [toKey]: null }, { resetPage: true })}>
              Clear
            </button>
            <button type="button" className="cursor-pointer text-xs font-semibold text-[#1E3A5F] dark:text-blue-300" onClick={close}>
              Done
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

export function BookingsFilters({ params, setParams, technicians }: FiltersProps) {
  const [moreOpen, setMoreOpen] = useState(false)
  const activeCount = FILTER_KEYS.filter((k) => params.get(k)).length
  const extraActive = ["status", "technicianId", "outcome"].filter((k) => params.get(k)).length

  const select = (key: string, label: string, options: { value: string; label: string }[]) => (
    <div className="min-w-[10.5rem]">
      <NativeSelect aria-label={label} value={params.get(key) ?? "all"} onChange={(e) => setParams({ [key]: e.target.value === "all" ? null : e.target.value }, { resetPage: true })}>
        <option value="all">{label}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </NativeSelect>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="relative">
        <DebouncedParamInput param="vrm" params={params} setParams={setParams} placeholder="VRM" aria-label="Filter by registration" className="font-mono uppercase placeholder:font-sans placeholder:normal-case" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {select("source", "All sources", SOURCE_OPTIONS)}
        {select("serviceType", "All booking types", SERVICE_TYPES.map((s) => ({ value: s, label: getServiceLabel(s) })))}
        {select("contacted", "Contacted or not", [{ value: "yes", label: "Contacted" }, { value: "no", label: "Not contacted" }])}
        <DateRangeFilter label="Booked for" fromKey="bookedFrom" toKey="bookedTo" params={params} setParams={setParams} />
        <DateRangeFilter label="Created" fromKey="createdFrom" toKey="createdTo" params={params} setParams={setParams} />
        <button
          type="button"
          onClick={() => setMoreOpen((o) => !o)}
          aria-expanded={moreOpen}
          className={cn(
            "flex h-10 cursor-pointer items-center gap-2 rounded-lg border bg-white px-3 text-sm font-medium dark:bg-slate-900",
            extraActive ? "border-[#1E3A5F] text-slate-900 dark:border-blue-400 dark:text-white" : "border-slate-200 text-slate-700 dark:border-slate-700 dark:text-slate-300"
          )}
        >
          <SlidersHorizontal className="h-4 w-4" />
          More filters{extraActive > 0 && ` (${extraActive})`}
          <ChevronDown className={cn("h-4 w-4 transition-transform", moreOpen && "rotate-180")} />
        </button>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setParams(Object.fromEntries(FILTER_KEYS.map((k) => [k, null])), { resetPage: true })}
            className="flex h-10 cursor-pointer items-center gap-1.5 px-2 text-sm font-semibold text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
          >
            <X className="h-4 w-4" />
            Clear filters
          </button>
        )}
      </div>

      {moreOpen && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-slate-50 p-3 dark:bg-white/5">
          {select("status", "Any status", BOOKING_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })))}
          {select("technicianId", "Any technician", technicians.map((t) => ({ value: t.id, label: t.isActive ? t.name : `${t.name} (inactive)` })))}
          {select("outcome", "Any outcome", [{ value: "pending", label: "Awaiting outcome" }])}
        </div>
      )}
    </div>
  )
}

export function CustomerSearch({ params, setParams }: { params: URLSearchParams; setParams: SetParams }) {
  return (
    <div className="relative w-full sm:w-72">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <DebouncedParamInput param="q" params={params} setParams={setParams} placeholder="Search by customer name…" aria-label="Search bookings" className="pl-9" />
    </div>
  )
}
