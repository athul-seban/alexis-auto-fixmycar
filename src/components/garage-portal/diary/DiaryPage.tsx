"use client"

import { useState } from "react"
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { cn } from "@/lib/utils"
import { startOfWeek, weekDays } from "@/lib/portal/diary-layout"
import { addDays, formatCivilDate, isValidDateString, todayLondon } from "@/lib/portal/tz"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { BookingDrawer } from "@/components/garage-portal/bookings/BookingDrawer"
import { NewBookingDialog, type NewBookingPrefill } from "@/components/garage-portal/bookings/NewBookingDialog"
import { BlockDetailsDialog, BlockDialog } from "@/components/garage-portal/diary/BlockDialog"
import { TimeGrid } from "@/components/garage-portal/diary/TimeGrid"
import type { DiaryBlockRow, DiaryResponse } from "@/components/garage-portal/diary/types"

type View = "week" | "day"

function rangeLabel(days: string[]): string {
  if (days.length === 1) return formatCivilDate(days[0])
  return `${formatCivilDate(days[0])} – ${formatCivilDate(days[days.length - 1])}`
}

export function DiaryPage() {
  const { searchParams, setParams } = useUrlParams()
  const today = todayLondon()

  const dateParam = searchParams.get("date")
  const date = isValidDateString(dateParam) ? dateParam : today
  const view: View = searchParams.get("view") === "day" ? "day" : "week"
  const technicianId = searchParams.get("technicianId") ?? ""
  const openId = searchParams.get("booking")

  const days = view === "day" ? [date] : weekDays(date)
  const query = new URLSearchParams({ from: days[0], to: days[days.length - 1] })
  if (technicianId) query.set("technicianId", technicianId)

  const { data, loading, error, reload } = useApi<DiaryResponse>(`/api/garage/diary?${query}`)
  const technicians = data?.technicians ?? []

  const [newBooking, setNewBooking] = useState<{ open: boolean; prefill?: NewBookingPrefill }>({ open: false })
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockView, setBlockView] = useState<DiaryBlockRow | null>(null)

  const step = view === "day" ? 1 : 7
  const go = (nextDate: string) => setParams({ date: nextDate === today ? null : nextDate })
  const dateInWeekStart = startOfWeek(date)

  return (
    <>
      <PageHeader
        title="Diary"
        description="Your bookings, technicians and time off. Click an empty slot to add a booking."
        actions={
          <>
            <Button variant="white" className="gap-2 border border-slate-200 dark:border-white/10" onClick={() => setBlockOpen(true)}>
              <CalendarOff className="h-4 w-4" /> Block time
            </Button>
            <Button variant="primary" className="gap-2" onClick={() => setNewBooking({ open: true, prefill: technicianId ? { technicianId } : undefined })}>
              <Plus className="h-4 w-4" /> New booking
            </Button>
          </>
        }
      />

      <Panel className="overflow-hidden">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-3 dark:border-white/10 sm:p-4">
          <div className="flex items-center gap-1">
            <button type="button" aria-label={view === "day" ? "Previous day" : "Previous week"} onClick={() => go(addDays(date, -step))} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label={view === "day" ? "Next day" : "Next week"} onClick={() => go(addDays(date, step))} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <ChevronRight className="h-4 w-4" />
            </button>
            <Button size="sm" variant="secondary" className="ml-1" onClick={() => go(today)} disabled={view === "day" ? date === today : dateInWeekStart === startOfWeek(today)}>
              Today
            </Button>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white" aria-live="polite">{rangeLabel(days)}</h2>

          <div className="ml-auto flex flex-wrap items-center gap-2">
            <div className="w-44">
              <NativeSelect aria-label="Technician" value={technicianId} onChange={(e) => setParams({ technicianId: e.target.value || null })}>
                <option value="">All technicians</option>
                {technicians.filter((t) => t.isActive).map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-slate-700" role="group" aria-label="View">
              {(["week", "day"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={view === v}
                  onClick={() => setParams({ view: v === "week" ? null : v })}
                  className={cn("cursor-pointer rounded-md px-3 py-1.5 text-sm font-medium capitalize transition-colors", view === v ? "bg-[#1E3A5F] text-white dark:bg-blue-500" : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-white/5")}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Technician legend */}
        {technicians.some((t) => t.isActive) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-b border-slate-100 px-4 py-2 text-xs text-slate-500 dark:border-white/10 dark:text-slate-400">
            {technicians.filter((t) => t.isActive).map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1.5">
                <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: t.color }} />
                {t.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-full bg-slate-400" />Unassigned</span>
            <span className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-4 rounded-sm ring-2 ring-amber-400" />Awaiting outcome</span>
          </div>
        )}

        {error && !data ? (
          <div className="p-8 text-center">
            <p role="alert" className="mb-3 text-sm text-red-600 dark:text-red-400">{error}</p>
            <Button size="sm" variant="secondary" onClick={reload}>Try again</Button>
          </div>
        ) : !data ? (
          <Skeleton className="m-4 h-[480px]" />
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            <TimeGrid
              days={days}
              bookings={data.bookings}
              blocks={data.blocks}
              openingHours={data.openingHours}
              onSlotClick={(day, time) => setNewBooking({ open: true, prefill: { date: day, time, technicianId: technicianId || undefined } })}
              onBookingClick={(id) => setParams({ booking: id })}
              onBlockClick={setBlockView}
            />
          </div>
        )}
      </Panel>

      <BookingDrawer bookingId={openId} onClose={() => setParams({ booking: null })} onChanged={reload} technicians={technicians} />
      <NewBookingDialog
        open={newBooking.open}
        onOpenChange={(open) => setNewBooking((s) => ({ ...s, open }))}
        technicians={technicians}
        prefill={newBooking.prefill}
        onCreated={(b) => { reload(); setParams({ booking: b.id }) }}
      />
      <BlockDialog open={blockOpen} onOpenChange={setBlockOpen} technicians={technicians} defaultTechnicianId={technicianId || undefined} defaultDate={date} onCreated={reload} />
      <BlockDetailsDialog block={blockView} onOpenChange={(open) => !open && setBlockView(null)} onRemoved={reload} />
    </>
  )
}
