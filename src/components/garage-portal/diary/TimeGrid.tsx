"use client"

import { useEffect, useState } from "react"
import { cn, getServiceLabel } from "@/lib/utils"
import {
  closedRanges,
  dropSlot,
  hourWindow,
  keyboardMove,
  layoutDay,
  minutesOnDay,
  snapToTime,
} from "@/lib/portal/diary-layout"
import { formatLondonTime, londonParts, todayLondon } from "@/lib/portal/tz"
import { formatVrm } from "@/lib/portal/vrm"
import { bookingEnd } from "@/lib/portal/booking-status"
import type { OpeningHours } from "@/types"
import type { BookingRow } from "@/lib/portal/booking-rows"
import type { DiaryBlockRow } from "@/components/garage-portal/diary/types"

const HOUR_PX = 60
const PX_PER_MIN = HOUR_PX / 60

interface TimeGridProps {
  days: string[]
  bookings: BookingRow[]
  blocks: DiaryBlockRow[]
  openingHours: OpeningHours | null
  onSlotClick: (day: string, time: string) => void
  onBookingClick: (id: string) => void
  onBlockClick: (block: DiaryBlockRow) => void
  /** Drag-and-drop: a booking was dropped on a day at a slot. */
  onBookingDrop: (bookingId: string, day: string, time: string) => void
  dragging: string | null
  onDragStateChange: (bookingId: string | null) => void
  /** Only bookings that can still be moved are draggable. */
  draggable: (b: BookingRow) => boolean
  /** Keyboard move: Alt+arrow on a focused booking. */
  onBookingKeyMove: (bookingId: string, move: { days: number; minutes: number }) => void
}

const dayLabel = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`)
  return {
    weekday: d.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" }),
    date: d.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }),
  }
}

export function TimeGrid({ days, bookings, blocks, openingHours, onSlotClick, onBookingClick, onBlockClick, onBookingDrop, dragging, onDragStateChange, draggable, onBookingKeyMove }: TimeGridProps) {
  // "Now" only exists on the client after mount, so the current-time line never causes a hydration mismatch.
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const tick = () => setNow(new Date())
    tick()
    const id = setInterval(tick, 60000)
    return () => clearInterval(id)
  }, [])

  const events = bookings.map((b) => ({
    ...b,
    id: b.id,
    start: new Date(b.scheduledAt),
    end: bookingEnd(new Date(b.scheduledAt), b.durationMins),
  }))
  const blockEvents = blocks.map((b) => ({ ...b, start: new Date(b.startAt), end: new Date(b.endAt) }))

  // Always show every booking/block: widen the window beyond opening hours if needed.
  const extra: { start: number; end: number }[] = []
  for (const day of days) {
    for (const e of [...events, ...blockEvents]) {
      const s = minutesOnDay(e.start, day, "start")
      const en = minutesOnDay(e.end, day, "end")
      if (en > s && !(s === 0 && en === 1440 && "allDay" in e && e.allDay)) extra.push({ start: s, end: en })
    }
  }
  const win = hourWindow(openingHours, extra)
  const windowStart = win.startHour * 60
  const windowEnd = win.endHour * 60
  const hours = Array.from({ length: win.endHour - win.startHour }, (_, i) => win.startHour + i)
  const gridHeight = (windowEnd - windowStart) * PX_PER_MIN
  const today = todayLondon()
  const nowMinutes = now ? londonParts(now).hour * 60 + londonParts(now).minute : null

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: days.length === 1 ? 0 : 640 }}>
        {/* Header */}
        <div className="sticky top-0 z-20 flex border-b border-slate-200 bg-white dark:border-white/10 dark:bg-slate-800">
          <div className="w-14 flex-shrink-0" />
          {days.map((day) => {
            const l = dayLabel(day)
            const isToday = day === today
            return (
              <div key={day} className="flex-1 border-l border-slate-100 px-2 py-2 text-center dark:border-white/10">
                <div className="text-xs font-medium uppercase tracking-wide text-slate-400">{l.weekday}</div>
                <div className={cn("mx-auto mt-0.5 inline-flex h-8 min-w-8 items-center justify-center rounded-full px-2 text-sm font-bold", isToday ? "bg-[#F97316] text-white" : "text-slate-900 dark:text-white")}>
                  {l.date}
                </div>
              </div>
            )
          })}
        </div>

        {/* Body */}
        <div className="flex">
          <div className="relative w-14 flex-shrink-0" style={{ height: gridHeight }}>
            {hours.map((h, i) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-slate-400" style={{ top: i * HOUR_PX }}>
                {i === 0 ? "" : `${String(h).padStart(2, "0")}:00`}
              </div>
            ))}
          </div>

          {days.map((day) => {
            const placed = layoutDay(events, day, windowStart, windowEnd)
            const dayBlocks = layoutDay(blockEvents, day, windowStart, windowEnd, 0)
            const closed = closedRanges(openingHours, day, windowStart, windowEnd)
            const isToday = day === today
            return (
              <div
                key={day}
                role="button"
                tabIndex={0}
                aria-label={`Add a booking on ${day}`}
                className={cn("relative flex-1 cursor-pointer border-l border-slate-100 dark:border-white/10", isToday && "bg-orange-50/40 dark:bg-orange-500/[0.03]")}
                style={{
                  height: gridHeight,
                  backgroundImage: "linear-gradient(to bottom, rgba(148,163,184,0.25) 1px, transparent 1px)",
                  backgroundSize: `100% ${HOUR_PX}px`,
                }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect()
                  onSlotClick(day, snapToTime(windowStart + (e.clientY - rect.top) / PX_PER_MIN))
                }}
                onDragOver={(e) => {
                  if (dragging) {
                    e.preventDefault()
                    e.dataTransfer.dropEffect = "move"
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  const id = e.dataTransfer.getData("text/booking-id") || dragging
                  const rect = e.currentTarget.getBoundingClientRect()
                  if (id) onBookingDrop(id, day, dropSlot(e.clientY - rect.top, PX_PER_MIN, windowStart))
                  onDragStateChange(null)
                }}
                onKeyDown={(e) => {
                  // Keyboard users can't point at a time, so Enter starts a booking at the first opening hour.
                  if (e.key === "Enter") onSlotClick(day, snapToTime(windowStart))
                }}
              >
                {closed.map((c, i) => (
                  <div key={i} aria-hidden className="pointer-events-none absolute inset-x-0 bg-slate-100/80 dark:bg-slate-950/40" style={{ top: c.top * PX_PER_MIN, height: c.height * PX_PER_MIN }} />
                ))}

                {dayBlocks.map(({ event, top, height }) => (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onBlockClick(event) }}
                    title={`${event.reason ?? "Time blocked"}${event.technician ? ` — ${event.technician.name}` : " — whole garage"}`}
                    className="absolute inset-x-0.5 cursor-pointer overflow-hidden rounded-md border border-slate-300 px-1.5 py-1 text-left text-[11px] font-semibold text-slate-600 dark:border-slate-600 dark:text-slate-300"
                    style={{
                      top: top * PX_PER_MIN,
                      height: height * PX_PER_MIN,
                      backgroundImage: "repeating-linear-gradient(135deg, rgba(100,116,139,0.18) 0 6px, rgba(100,116,139,0.06) 6px 12px)",
                    }}
                  >
                    {event.reason ?? "Blocked"}
                    {event.technician && <span className="font-normal"> · {event.technician.name}</span>}
                  </button>
                ))}

                {placed.map(({ event, top, height, column, columns }) => {
                  const color = event.technician?.color ?? "#64748b"
                  const needsOutcome = event.displayStatus === "AWAITING_OUTCOME"
                  return (
                    <button
                      key={event.id}
                      type="button"
                      draggable={draggable(event)}
                      onDragStart={(e) => {
                        e.dataTransfer.setData("text/booking-id", event.id)
                        e.dataTransfer.effectAllowed = "move"
                        onDragStateChange(event.id)
                      }}
                      onDragEnd={() => onDragStateChange(null)}
                      aria-keyshortcuts={draggable(event) ? "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown" : undefined}
                      onKeyDown={(e) => {
                        const move = draggable(event) ? keyboardMove(e, days.length === 1 ? "day" : "week") : null
                        if (move) {
                          e.preventDefault()
                          e.stopPropagation()
                          onBookingKeyMove(event.id, move)
                        }
                      }}
                      onClick={(e) => { e.stopPropagation(); onBookingClick(event.id) }}
                      className={cn(
                        "absolute cursor-pointer overflow-hidden rounded-md px-1.5 py-1 text-left text-[11px] leading-tight shadow-sm transition-shadow hover:z-10 hover:shadow-md",
                        event.status === "COMPLETED" && "opacity-70",
                        event.status === "NO_SHOW" && "opacity-60",
                        needsOutcome && "ring-2 ring-amber-400",
                        dragging === event.id && "opacity-40",
                        draggable(event) && "active:cursor-grabbing",
                        !event.timeConfirmed && "border-dashed"
                      )}
                      style={{
                        top: top * PX_PER_MIN,
                        height: Math.max(height * PX_PER_MIN - 2, 18),
                        left: `calc(${(column / columns) * 100}% + 2px)`,
                        width: `calc(${100 / columns}% - 4px)`,
                        backgroundColor: `${color}26`,
                        borderLeft: `3px ${event.timeConfirmed ? "solid" : "dashed"} ${color}`,
                      }}
                      aria-label={`${formatLondonTime(event.start)} ${event.customerName ?? "booking"}, ${getServiceLabel(event.serviceType)}`}
                    >
                      <div className="truncate font-bold text-slate-900 dark:text-white">
                        {formatLondonTime(event.start)} {event.customerName ?? "Booking"}
                      </div>
                      {height * PX_PER_MIN > 34 && (
                        <div className="truncate text-slate-600 dark:text-slate-300">
                          {getServiceLabel(event.serviceType)}{event.vrm ? ` · ${formatVrm(event.vrm)}` : ""}
                        </div>
                      )}
                      {height * PX_PER_MIN > 52 && event.technician && (
                        <div className="truncate text-slate-500 dark:text-slate-400">{event.technician.name}</div>
                      )}
                    </button>
                  )
                })}

                {isToday && nowMinutes !== null && nowMinutes >= windowStart && nowMinutes <= windowEnd && (
                  <div aria-hidden className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: (nowMinutes - windowStart) * PX_PER_MIN }}>
                    <span className="-ml-1 h-2 w-2 rounded-full bg-red-500" />
                    <span className="h-px flex-1 bg-red-500" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
