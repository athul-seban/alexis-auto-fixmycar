"use client"

import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { londonDateString, londonTimeString, londonWallToUtc } from "@/lib/portal/tz"

// Date + time inputs that always mean *London* wall-clock time, regardless of the viewer's
// browser timezone (datetime-local would silently use the browser's).

export interface DateTimeValue {
  date: string // YYYY-MM-DD
  time: string // HH:mm
}

export function dateTimeFromIso(iso: string | Date): DateTimeValue {
  const d = new Date(iso)
  return { date: londonDateString(d), time: londonTimeString(d) }
}

export function dateTimeToIso(v: DateTimeValue): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date) || !/^\d{2}:\d{2}$/.test(v.time)) return null
  return londonWallToUtc(v.date, v.time).toISOString()
}

interface DateTimeFieldsProps {
  value: DateTimeValue
  onChange: (v: DateTimeValue) => void
  idPrefix: string
  required?: boolean
}

export function DateTimeFields({ value, onChange, idPrefix, required }: DateTimeFieldsProps) {
  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <FieldLabel htmlFor={`${idPrefix}-date`}>Date{required && " *"}</FieldLabel>
        <TextInput id={`${idPrefix}-date`} type="date" required={required} value={value.date} onChange={(e) => onChange({ ...value, date: e.target.value })} />
      </div>
      <div>
        <FieldLabel htmlFor={`${idPrefix}-time`}>Time (UK){required && " *"}</FieldLabel>
        <TextInput id={`${idPrefix}-time`} type="time" required={required} value={value.time} onChange={(e) => onChange({ ...value, time: e.target.value })} />
      </div>
    </div>
  )
}
