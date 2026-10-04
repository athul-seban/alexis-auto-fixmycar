"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { formatCurrency, getServiceLabel } from "@/lib/utils"
import { todayLondon } from "@/lib/portal/tz"
import type { EnquiryRow } from "@/lib/portal/enquiries"
import { DateTimeFields, dateTimeToIso } from "@/components/garage-portal/shared/DateTimeFields"
import { OverlapNotice } from "@/components/garage-portal/shared/OverlapNotice"
import type { BookingRow, OverlapDetails, TechnicianOption } from "@/components/garage-portal/bookings/types"

interface Props {
  enquiry: EnquiryRow | null
  technicians: TechnicianOption[]
  onOpenChange: (open: boolean) => void
  onCreated: (booking: BookingRow) => void
}

export function EstimateBookingDialog({ enquiry, technicians, onOpenChange, onCreated }: Props) {
  return (
    <Dialog open={!!enquiry} onOpenChange={onOpenChange}>
      <DialogContent>
        {enquiry && <Form key={enquiry.key} enquiry={enquiry} technicians={technicians} onCreated={onCreated} onClose={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

function Form({ enquiry, technicians, onCreated, onClose }: { enquiry: EnquiryRow; technicians: TechnicianOption[]; onCreated: (b: BookingRow) => void; onClose: () => void }) {
  const { toast } = useToast()
  const preferred = enquiry.preferredDate ? new Date(enquiry.preferredDate) : null
  const [when, setWhen] = useState({ date: todayLondon(), time: "09:00" })
  const [duration, setDuration] = useState(60)
  const [technicianId, setTechnicianId] = useState("")
  const [status, setStatus] = useState<"CONFIRMED" | "PENDING">("CONFIRMED")
  const [notes, setNotes] = useState("")
  const [notify, setNotify] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [overlap, setOverlap] = useState<OverlapDetails | null>(null)

  const submit = async (allowOverlap = false) => {
    const scheduledAt = dateTimeToIso(when)
    if (!scheduledAt) return setError("Choose a date and time")
    setSaving(true)
    setError("")
    setOverlap(null)
    const res = await sendJson<{ booking: BookingRow } & Partial<OverlapDetails>>("/api/garage/bookings", "POST", {
      ...(enquiry.kind === "QUOTE" ? { fromQuoteId: enquiry.id } : { fromJobResponseId: enquiry.responseId }),
      scheduledAt,
      durationMins: duration,
      technicianId: technicianId || undefined,
      status,
      notes: notes.trim() || undefined,
      notifyCustomer: notify,
      allowOverlap,
    })
    setSaving(false)

    if (res.status === 409 && res.data?.code === "OVERLAP") return setOverlap(res.data as OverlapDetails)
    if (!res.ok || !res.data) return setError(res.error ?? "Couldn't create the booking")
    toast("Booking created from your quote")
    onCreated(res.data.booking)
    onClose()
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false) }} noValidate>
      <DialogHeader>
        <DialogTitle>Create booking</DialogTitle>
        <DialogDescription>
          {getServiceLabel(enquiry.serviceType)} for {enquiry.customer.name ?? "the customer"} · quoted {formatCurrency(enquiry.myPrice ?? 0)}
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4">
        {preferred && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:bg-blue-500/10 dark:text-blue-200">
            The customer asked for around {preferred.toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "Europe/London" })}.
          </p>
        )}
        <DateTimeFields value={when} onChange={setWhen} idPrefix="est-when" required />
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <FieldLabel htmlFor="est-duration">Duration (min)</FieldLabel>
            <TextInput id="est-duration" type="number" min={15} max={960} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
          </div>
          <div>
            <FieldLabel htmlFor="est-tech">Technician</FieldLabel>
            <NativeSelect id="est-tech" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
              <option value="">Unassigned</option>
              {technicians.filter((t) => t.isActive).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel htmlFor="est-status">Status</FieldLabel>
            <NativeSelect id="est-status" value={status} onChange={(e) => setStatus(e.target.value as "CONFIRMED" | "PENDING")}>
              <option value="CONFIRMED">Confirmed</option>
              <option value="PENDING">Pending</option>
            </NativeSelect>
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="est-notes">Notes (private)</FieldLabel>
          <Textarea id="est-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={notify} onChange={(e) => setNotify(e.target.checked)} />
          Let the customer know their booking is scheduled
        </label>
        {overlap && <OverlapNotice details={overlap} overriding={saving} onOverride={() => submit(true)} />}
        <FieldError>{error}</FieldError>
      </div>

      <DialogFooter>
        <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving}>Create booking</Button>
      </DialogFooter>
    </form>
  )
}
