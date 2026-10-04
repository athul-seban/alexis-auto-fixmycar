"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { addDays, formatLondonDateTime, londonWallToUtc, todayLondon } from "@/lib/portal/tz"
import type { TechnicianOption } from "@/components/garage-portal/bookings/types"
import type { DiaryBlockRow } from "@/components/garage-portal/diary/types"

interface BlockDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  technicians: TechnicianOption[]
  /** Pre-select a technician (e.g. the diary is filtered to one person). */
  defaultTechnicianId?: string
  defaultDate?: string
  onCreated: () => void
}

/** Create a block of unavailable time: a closure, holiday, or one technician's time off. */
export function BlockDialog({ open, onOpenChange, technicians, defaultTechnicianId, defaultDate, onCreated }: BlockDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {open && <BlockForm key={`${defaultDate}-${defaultTechnicianId}`} technicians={technicians} defaultTechnicianId={defaultTechnicianId} defaultDate={defaultDate} onCreated={onCreated} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function BlockForm({ technicians, defaultTechnicianId, defaultDate, onCreated, onClose }: Omit<BlockDialogProps, "open" | "onOpenChange"> & { onClose: () => void }) {
  const { toast } = useToast()
  const start = defaultDate ?? todayLondon()
  const [allDay, setAllDay] = useState(true)
  const [startDate, setStartDate] = useState(start)
  const [endDate, setEndDate] = useState(start)
  const [startTime, setStartTime] = useState("09:00")
  const [endTime, setEndTime] = useState("17:00")
  const [technicianId, setTechnicianId] = useState(defaultTechnicianId ?? "")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!startDate || !endDate || endDate < startDate) return setError("The end date can't be before the start date")
    const startAt = allDay ? londonWallToUtc(startDate, "00:00") : londonWallToUtc(startDate, startTime)
    const endAt = allDay ? londonWallToUtc(addDays(endDate, 1), "00:00") : londonWallToUtc(endDate, endTime)
    if (endAt <= startAt) return setError("The end must be after the start")

    setSaving(true)
    setError("")
    const res = await sendJson<{ conflicts: unknown[] }>("/api/garage/diary/blocks", "POST", {
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      allDay,
      reason: reason.trim() || undefined,
      technicianId: technicianId || null,
    })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't block that time")

    const n = res.data?.conflicts.length ?? 0
    toast(n > 0 ? `Time blocked — ${n} existing booking${n === 1 ? " falls" : "s fall"} in this period, so you may need to rearrange ${n === 1 ? "it" : "them"}` : "Time blocked")
    onCreated()
    onClose()
  }

  return (
    <form onSubmit={submit} noValidate>
      <DialogHeader>
        <DialogTitle>Block time</DialogTitle>
        <DialogDescription>Close the diary for a holiday, training day or a technician&apos;s time off. Existing bookings aren&apos;t cancelled.</DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
          All day
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="blk-start">{allDay ? "From" : "Start date"}</FieldLabel>
            <TextInput id="blk-start" type="date" value={startDate} onChange={(e) => { setStartDate(e.target.value); if (endDate < e.target.value) setEndDate(e.target.value) }} />
          </div>
          <div>
            <FieldLabel htmlFor="blk-end">{allDay ? "To (inclusive)" : "End date"}</FieldLabel>
            <TextInput id="blk-end" type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {!allDay && (
            <>
              <div>
                <FieldLabel htmlFor="blk-st">Start time (UK)</FieldLabel>
                <TextInput id="blk-st" type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
              </div>
              <div>
                <FieldLabel htmlFor="blk-et">End time (UK)</FieldLabel>
                <TextInput id="blk-et" type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} />
              </div>
            </>
          )}
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="blk-tech">Applies to</FieldLabel>
            <NativeSelect id="blk-tech" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Whole garage</option>
              {technicians.filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel htmlFor="blk-reason">Reason (optional)</FieldLabel>
            <TextInput id="blk-reason" value={reason} maxLength={200} placeholder="e.g. Bank holiday" onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <FieldError>{error}</FieldError>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving}>Block time</Button>
      </DialogFooter>
    </form>
  )
}

interface BlockDetailsDialogProps {
  block: DiaryBlockRow | null
  onOpenChange: (open: boolean) => void
  onRemoved: () => void
}

export function BlockDetailsDialog({ block, onOpenChange, onRemoved }: BlockDetailsDialogProps) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)

  const remove = async () => {
    if (!block) return
    setBusy(true)
    const res = await sendJson(`/api/garage/diary/blocks/${block.id}`, "DELETE")
    setBusy(false)
    if (!res.ok) return toast(res.error ?? "Couldn't remove that block", "error")
    toast("Block removed")
    onRemoved()
    onOpenChange(false)
  }

  return (
    <Dialog open={!!block} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        {block && (
          <>
            <DialogHeader>
              <DialogTitle>{block.reason ?? "Time blocked"}</DialogTitle>
              <DialogDescription>
                {block.technician ? block.technician.name : "Whole garage"}
              </DialogDescription>
            </DialogHeader>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              {formatLondonDateTime(block.startAt)} → {formatLondonDateTime(block.endAt)}
            </p>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
              <Button type="button" variant="destructive" loading={busy} onClick={remove}>Remove block</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
