"use client"

import { cn } from "@/lib/utils"
import { blockedDays, groupByDay, isInMonth, keyboardMove, monthGrid } from "@/lib/portal/diary-layout"
import { formatLondonTime, todayLondon } from "@/lib/portal/tz"
import type { BookingRow } from "@/lib/portal/booking-rows"
import type { DiaryBlockRow } from "@/components/garage-portal/diary/types"

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const MAX_CHIPS = 3

interface MonthGridProps {
  /** Any civil date inside the month to show. */
  date: string
  bookings: BookingRow[]
  blocks: DiaryBlockRow[]
  onDayClick: (day: string) => void
  onBookingClick: (id: string) => void
  /** Called when a booking is dropped on a day. */
  onBookingDrop: (bookingId: string, day: string) => void
  /** Which booking is being dragged (set by the page so every cell can highlight as a target). */
  dragging: string | null
  onDragStateChange: (bookingId: string | null) => void
  draggable: (b: BookingRow) => boolean
  onBookingKeyMove: (bookingId: string, move: { days: number; minutes: number }) => void
}

const dayNumber = (day: string) => String(Number(day.slice(8)))

export function MonthGrid({ date, bookings, blocks, onDayClick, onBookingClick, onBookingDrop, dragging, onDragStateChange, draggable, onBookingKeyMove }: MonthGridProps) {
  const grid = monthGrid(date)
  const days = grid.weeks.flat()
  const today = todayLondon()
  const byDay = groupByDay(bookings.map((b) => ({ ...b, start: new Date(b.scheduledAt) })), days)
  const blocked = blockedDays(blocks.map((x) => ({ start: new Date(x.startAt), end: new Date(x.endAt) })), days)

  return (
    <div role="grid" aria-label="Month diary" className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div role="row" className="grid grid-cols-7 border-b border-slate-200 dark:border-white/10">
          {WEEKDAYS.map((w) => (
            <div key={w} role="columnheader" className="px-2 py-2 text-center text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {w}
            </div>
          ))}
        </div>
        {grid.weeks.map((week) => (
          <div key={week[0]} role="row" className="grid grid-cols-7">
            {week.map((day) => {
              const list = byDay.get(day) ?? []
              const inMonth = isInMonth(day, grid.month)
              const isToday = day === today
              const isDropTarget = dragging !== null
              return (
                <div
                  key={day}
                  role="gridcell"
                  aria-label={`${day}, ${list.length} booking${list.length === 1 ? "" : "s"}${blocked.has(day) ? ", time blocked" : ""}`}
                  className={cn(
                    "min-h-28 border-b border-l border-slate-100 p-1.5 dark:border-white/10",
                    !inMonth && "bg-slate-50/70 dark:bg-slate-950/30",
                    isToday && "bg-orange-50/50 dark:bg-orange-500/[0.04]",
                    isDropTarget && "transition-colors hover:bg-blue-50 dark:hover:bg-blue-500/10"
                  )}
                  onDragOver={(e) => {
                    if (dragging) e.preventDefault()
                  }}
                  onDrop={(e) => {
                    e.preventDefault()
                    const id = e.dataTransfer.getData("text/booking-id") || dragging
                    if (id) onBookingDrop(id, day)
                    onDragStateChange(null)
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onDayClick(day)}
                    aria-label={`Open ${day} in the day view`}
                    className={cn(
                      "mb-1 inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-full px-1.5 text-xs font-bold",
                      isToday ? "bg-[#C2410C] text-white" : inMonth ? "text-slate-900 hover:bg-slate-100 dark:text-white dark:hover:bg-white/10" : "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-white/10"
                    )}
                  >
                    {dayNumber(day)}
                  </button>
                  {blocked.has(day) && <span className="ml-1 text-[10px] font-semibold text-slate-500 dark:text-slate-400">Blocked</span>}
                  <ul className="space-y-1">
                    {list.slice(0, MAX_CHIPS).map((b) => {
                      const color = b.technician?.color ?? "#64748b"
                      const canDrag = draggable(b)
                      return (
                        <li key={b.id}>
                          <button
                            type="button"
                            draggable={canDrag}
                            onDragStart={(e) => {
                              e.dataTransfer.setData("text/booking-id", b.id)
                              e.dataTransfer.effectAllowed = "move"
                              onDragStateChange(b.id)
                            }}
                            onDragEnd={() => onDragStateChange(null)}
                            aria-keyshortcuts={canDrag ? "Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown" : undefined}
                            onKeyDown={(e) => {
                              const move = canDrag ? keyboardMove(e, "month") : null
                              if (move) {
                                e.preventDefault()
                                onBookingKeyMove(b.id, move)
                              }
                            }}
                            onClick={() => onBookingClick(b.id)}
                            className={cn("flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight text-slate-900 dark:text-white", canDrag ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", b.status === "COMPLETED" && "line-through decoration-slate-400")}
                            style={{ backgroundColor: `${color}26`, borderLeft: `3px solid ${color}` }}
                            title={`${formatLondonTime(b.scheduledAt)} ${b.customerName ?? "Booking"}`}
                          >
                            <span className="font-semibold">{formatLondonTime(b.scheduledAt)}</span>
                            <span className="truncate">{b.customerName ?? "Booking"}</span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                  {list.length > MAX_CHIPS && (
                    <button type="button" onClick={() => onDayClick(day)} className="mt-1 cursor-pointer text-[11px] font-semibold text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">
                      +{list.length - MAX_CHIPS} more
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
