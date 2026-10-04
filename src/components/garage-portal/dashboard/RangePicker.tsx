"use client"

import { CalendarDays } from "lucide-react"
import { cn } from "@/lib/utils"
import { RANGE_PRESETS, matchPreset, presetLabel, presetRange, type CivilRange } from "@/lib/portal/date-range"
import { formatCivilDate } from "@/lib/portal/tz"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Popover } from "@/components/ui/popover"

interface RangePickerProps {
  range: CivilRange
  onChange: (range: CivilRange) => void
}

const chip =
  "cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition-colors"

/** Preset chips (14 Days / 3 Months / YTD / last year) plus a custom London-date range. */
export function RangePicker({ range, onChange }: RangePickerProps) {
  const active = matchPreset(range)

  return (
    <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Date range">
      {RANGE_PRESETS.map((p) => (
        <button
          key={p}
          type="button"
          aria-pressed={active === p}
          onClick={() => onChange(presetRange(p))}
          className={cn(
            chip,
            active === p
              ? "border-[#1E3A5F] bg-[#1E3A5F] text-white dark:border-blue-500 dark:bg-blue-500"
              : "border-gray-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          )}
        >
          {presetLabel(p)}
        </button>
      ))}

      <Popover
        align="right"
        trigger={({ open, toggle }) => (
          <button
            type="button"
            onClick={toggle}
            aria-expanded={open}
            className={cn(
              chip,
              "flex items-center gap-2",
              active === null
                ? "border-[#1E3A5F] bg-[#1E3A5F]/[0.06] text-slate-900 dark:border-blue-400 dark:text-white"
                : "border-gray-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-200"
            )}
          >
            <CalendarDays className="h-4 w-4" />
            {formatCivilDate(range.from)} – {formatCivilDate(range.to)}
          </button>
        )}
      >
        {(close) => (
          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900 dark:text-white">Custom range</p>
            <div>
              <FieldLabel htmlFor="range-from">From</FieldLabel>
              <TextInput id="range-from" type="date" value={range.from} max={range.to} onChange={(e) => e.target.value && onChange({ ...range, from: e.target.value })} />
            </div>
            <div>
              <FieldLabel htmlFor="range-to">To</FieldLabel>
              <TextInput id="range-to" type="date" value={range.to} min={range.from} onChange={(e) => e.target.value && onChange({ ...range, to: e.target.value })} />
            </div>
            <button type="button" onClick={close} className="cursor-pointer text-xs font-semibold text-[#1E3A5F] dark:text-blue-300">
              Done
            </button>
          </div>
        )}
      </Popover>
    </div>
  )
}
