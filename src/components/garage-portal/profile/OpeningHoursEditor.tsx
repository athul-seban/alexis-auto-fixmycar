"use client"

import { Copy } from "lucide-react"
import { Button } from "@/components/ui/button"
import { TextInput } from "@/components/ui/form-controls"
import { Switch } from "@/components/ui/switch"
import { DAY_LABELS, DAY_ORDER, DEFAULT_OPENING_HOURS, type DayKey } from "@/lib/portal/opening-hours"
import type { OpeningHours } from "@/types"

interface Props {
  value: OpeningHours
  onChange: (hours: OpeningHours) => void
  error?: string | null
}

export function OpeningHoursEditor({ value, onChange, error }: Props) {
  const setDay = (day: DayKey, patch: Partial<OpeningHours[DayKey]>) => {
    const current = value[day]
    const next = { ...current, ...patch }
    // Opening a closed day pre-fills sensible hours instead of leaving blanks.
    if (patch.open === true && !current.from && !current.to) {
      next.from = DEFAULT_OPENING_HOURS.monday.from
      next.to = DEFAULT_OPENING_HOURS.monday.to
    }
    onChange({ ...value, [day]: next })
  }

  const copyMondayToWeekdays = () => {
    const monday = value.monday
    onChange({
      ...value,
      tuesday: { ...monday }, wednesday: { ...monday }, thursday: { ...monday }, friday: { ...monday },
    })
  }

  return (
    <div>
      <ul className="divide-y divide-slate-100 dark:divide-white/10">
        {DAY_ORDER.map((day) => {
          const d = value[day]
          return (
            <li key={day} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
              <span className="w-28 text-sm font-semibold text-slate-900 dark:text-white">{DAY_LABELS[day]}</span>
              <Switch checked={d.open} onCheckedChange={(open) => setDay(day, { open })} aria-label={`${DAY_LABELS[day]} open`} />
              {d.open ? (
                <div className="flex items-center gap-2">
                  <TextInput type="time" aria-label={`${DAY_LABELS[day]} opens`} value={d.from} onChange={(e) => setDay(day, { from: e.target.value })} className="w-32" />
                  <span className="text-sm text-slate-400">to</span>
                  <TextInput type="time" aria-label={`${DAY_LABELS[day]} closes`} value={d.to} onChange={(e) => setDay(day, { to: e.target.value })} className="w-32" />
                </div>
              ) : (
                <span className="text-sm text-slate-500 dark:text-slate-400">Closed</span>
              )}
            </li>
          )
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" variant="secondary" className="gap-1.5" onClick={copyMondayToWeekdays}>
          <Copy className="h-3.5 w-3.5" /> Copy Monday to Tue–Fri
        </Button>
        {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
      </div>
    </div>
  )
}
