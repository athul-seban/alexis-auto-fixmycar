"use client"

import { useState } from "react"
import { CalendarOff, ChevronLeft, ChevronRight, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { NativeSelect } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useApi } from "@/hooks/use-api"
import { useUrlParams } from "@/hooks/use-url-params"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import { monthGrid, sameTimeOnDay, shiftSlot, startOfWeek, weekDays } from "@/lib/portal/diary-layout"
import { addDays, addMonths, formatCivilDate, formatLondonDateTime, isValidDateString, londonDateString, londonWallToUtc, todayLondon } from "@/lib/portal/tz"
import type { BookingRow } from "@/lib/portal/booking-rows"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { BookingDrawer } from "@/components/garage-portal/bookings/BookingDrawer"
import { NewBookingDialog, type NewBookingPrefill } from "@/components/garage-portal/bookings/NewBookingDialog"
import { BlockDetailsDialog, BlockDialog } from "@/components/garage-portal/diary/BlockDialog"
import { MonthGrid } from "@/components/garage-portal/diary/MonthGrid"
import { TimeGrid } from "@/components/garage-portal/diary/TimeGrid"
import type { DiaryBlockRow, DiaryResponse } from "@/components/garage-portal/diary/types"

type View = "week" | "day" | "month"

/** Only bookings that haven't started can be dragged to a new time. */
const canMove = (b: BookingRow) => b.status === "PENDING" || b.status === "CONFIRMED"

const monthLabel = (month: string) => new Date(`${month}-01T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })

function rangeLabel(days: string[]): string {
  if (days.length === 1) return formatCivilDate(days[0])
  return `${formatCivilDate(days[0])} – ${formatCivilDate(days[days.length - 1])}`
}

export function DiaryPage() {
  const { searchParams, setParams } = useUrlParams()
  const today = todayLondon()

  const dateParam = searchParams.get("date")
  const date = isValidDateString(dateParam) ? dateParam : today
  const viewParam = searchParams.get("view")
  const view: View = viewParam === "day" ? "day" : viewParam === "month" ? "month" : "week"
  const technicianId = searchParams.get("technicianId") ?? ""
  const openId = searchParams.get("booking")

  const month = view === "month" ? monthGrid(date) : null
  const days = view === "day" ? [date] : month ? month.weeks.flat() : weekDays(date)
  const query = new URLSearchParams({ from: days[0], to: days[days.length - 1] })
  if (technicianId) query.set("technicianId", technicianId)

  const { data, loading, error, reload } = useApi<DiaryResponse>(`/api/garage/diary?${query}`)
  const technicians = data?.technicians ?? []

  const [newBooking, setNewBooking] = useState<{ open: boolean; prefill?: NewBookingPrefill }>({ open: false })
  const [blockOpen, setBlockOpen] = useState(false)
  const [blockView, setBlockView] = useState<DiaryBlockRow | null>(null)
  const { toast } = useToast()
  const [dragging, setDragging] = useState<string | null>(null)
  const [move, setMove] = useState<{ booking: BookingRow; start: Date; clash: boolean } | null>(null)
  const [moving, setMoving] = useState(false)

  const go = (nextDate: string) => setParams({ date: nextDate === today ? null : nextDate })
  const goPrev = () => go(view === "month" ? addMonths(date, -1) : addDays(date, view === "day" ? -1 : -7))
  const goNext = () => go(view === "month" ? addMonths(date, 1) : addDays(date, view === "day" ? 1 : 7))

  /** A drop (or "move" gesture) asks for confirmation first, so a slip of the mouse never reschedules a customer. */
  function proposeMove(bookingId: string, start: Date) {
    const booking = data?.bookings.find((b) => b.id === bookingId)
    if (!booking || !canMove(booking)) return
    if (start.getTime() === new Date(booking.scheduledAt).getTime()) return
    setMove({ booking, start, clash: false })
  }

  /** Keyboard moves go through the same confirmation as a drop. */
  function keyMove(bookingId: string, m: { days: number; minutes: number }) {
    const b = data?.bookings.find((x) => x.id === bookingId)
    if (b) proposeMove(bookingId, shiftSlot(new Date(b.scheduledAt), m.days, m.minutes))
  }

  async function confirmMove(allowOverlap = false) {
    if (!move) return
    setMoving(true)
    const res = await sendJson<{ code?: string }>(`/api/garage/bookings/${move.booking.id}`, "PATCH", { scheduledAt: move.start.toISOString(), ...(allowOverlap ? { allowOverlap: true } : {}) })
    setMoving(false)
    if (res.status === 409 && res.data?.code === "OVERLAP") return setMove({ ...move, clash: true })
    if (!res.ok) {
      toast(res.error ?? "Couldn't move the booking", "error")
      return setMove(null)
    }
    toast("Booking moved")
    setMove(null)
    reload()
  }
  const dateInWeekStart = startOfWeek(date)

  return (
    <>
      <PageHeader
        title="Diary"
        description="Your bookings, technicians and time off. Click an empty slot to add a booking, drag a booking to move it, or focus one and press Alt + arrow keys."
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
            <button type="button" aria-label={view === "day" ? "Previous day" : view === "month" ? "Previous month" : "Previous week"} onClick={goPrev} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" aria-label={view === "day" ? "Next day" : view === "month" ? "Next month" : "Next week"} onClick={goNext} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <ChevronRight className="h-4 w-4" />
            </button>
            <Button size="sm" variant="secondary" className="ml-1" onClick={() => go(today)} disabled={view === "day" ? date === today : view === "month" ? date.slice(0, 7) === today.slice(0, 7) : dateInWeekStart === startOfWeek(today)}>
              Today
            </Button>
          </div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white" aria-live="polite">{month ? monthLabel(month.month) : rangeLabel(days)}</h2>

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
              {(["week", "day", "month"] as View[]).map((v) => (
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
            <p role="alert" className="mb-3 text-sm text-red-700 dark:text-red-400">{error}</p>
            <Button size="sm" variant="secondary" onClick={reload}>Try again</Button>
          </div>
        ) : !data ? (
          <Skeleton className="m-4 h-[480px]" />
        ) : (
          <div className={cn("transition-opacity", loading && "opacity-60")}>
            {month ? (
              <MonthGrid
                date={date}
                bookings={data.bookings}
                blocks={data.blocks}
                onDayClick={(day) => setParams({ view: "day", date: day === today ? null : day })}
                onBookingClick={(id) => setParams({ booking: id })}
                onBookingDrop={(id, day) => {
                  const b = data.bookings.find((x) => x.id === id)
                  if (b) proposeMove(id, sameTimeOnDay(new Date(b.scheduledAt), day))
                }}
                dragging={dragging}
                onDragStateChange={setDragging}
                draggable={canMove}
                onBookingKeyMove={keyMove}
              />
            ) : (
              <TimeGrid
                days={days}
                bookings={data.bookings}
                blocks={data.blocks}
                openingHours={data.openingHours}
                onSlotClick={(day, time) => setNewBooking({ open: true, prefill: { date: day, time, technicianId: technicianId || undefined } })}
                onBookingClick={(id) => setParams({ booking: id })}
                onBlockClick={setBlockView}
                onBookingDrop={(id, day, time) => proposeMove(id, londonWallToUtc(day, time))}
                dragging={dragging}
                onDragStateChange={setDragging}
                draggable={canMove}
                onBookingKeyMove={keyMove}
              />
            )}
          </div>
        )}
      </Panel>

      <ConfirmDialog
        open={move !== null && !move.clash}
        onOpenChange={(o) => !o && !moving && setMove(null)}
        title="Move this booking?"
        description={move ? `${move.booking.customerName ?? "This booking"} from ${formatLondonDateTime(move.booking.scheduledAt)} to ${formatLondonDateTime(move.start)}. The customer is told about the new time.` : ""}
        confirmLabel="Move booking"
        loading={moving}
        onConfirm={() => confirmMove(false)}
      />
      <ConfirmDialog
        open={move?.clash === true}
        onOpenChange={(o) => !o && !moving && setMove(null)}
        title="That time clashes"
        description={move ? `${formatLondonDateTime(move.start)} overlaps another booking or time off. Move it there anyway?` : ""}
        confirmLabel="Move anyway"
        destructive
        loading={moving}
        onConfirm={() => confirmMove(true)}
      />
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
