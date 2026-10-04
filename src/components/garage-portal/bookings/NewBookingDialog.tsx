"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { SERVICE_TYPES } from "@/lib/constants"
import { todayLondon } from "@/lib/portal/tz"
import { getServiceLabel } from "@/lib/utils"
import { DateTimeFields, dateTimeToIso, type DateTimeValue } from "@/components/garage-portal/shared/DateTimeFields"
import { OverlapNotice } from "@/components/garage-portal/shared/OverlapNotice"
import type { BookingRow, OverlapDetails, TechnicianOption } from "@/components/garage-portal/bookings/types"

export interface NewBookingPrefill {
  date?: string
  time?: string
  technicianId?: string
}

interface NewBookingDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  technicians: TechnicianOption[]
  onCreated: (booking: BookingRow) => void
  prefill?: NewBookingPrefill
}

const DURATIONS = [30, 45, 60, 90, 120, 180, 240, 480]

export function NewBookingDialog({ open, onOpenChange, technicians, onCreated, prefill }: NewBookingDialogProps) {
  // Remount the form each time the dialog opens so it starts clean (and picks up the prefill).
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <NewBookingForm key={`${open}-${prefill?.date}-${prefill?.time}`} technicians={technicians} prefill={prefill} onCreated={onCreated} onClose={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function NewBookingForm({
  technicians, prefill, onCreated, onClose,
}: { technicians: TechnicianOption[]; prefill?: NewBookingPrefill; onCreated: (b: BookingRow) => void; onClose: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState("")
  const [phone, setPhone] = useState("")
  const [email, setEmail] = useState("")
  const [vrm, setVrm] = useState("")
  const [make, setMake] = useState("")
  const [model, setModel] = useState("")
  const [year, setYear] = useState("")
  const [serviceType, setServiceType] = useState<string>("MOT")
  const [priceTouched, setPriceTouched] = useState(false)
  const { data: pricing } = useApi<{ services: { serviceType: string; offered: boolean; priceFrom: number | null; priceTo: number | null; durationMins: number }[] }>("/api/garage/pricing")
  const [when, setWhen] = useState<DateTimeValue>({ date: prefill?.date ?? todayLondon(), time: prefill?.time ?? "09:00" })
  const [duration, setDuration] = useState(60)
  const [technicianId, setTechnicianId] = useState(prefill?.technicianId ?? "")
  const [price, setPrice] = useState("")
  const [status, setStatus] = useState<"CONFIRMED" | "PENDING">("CONFIRMED")
  const [notes, setNotes] = useState("")
  const [notifyCustomer, setNotifyCustomer] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [overlap, setOverlap] = useState<OverlapDetails | null>(null)

  const submit = async (allowOverlap = false) => {
    setError("")
    const scheduledAt = dateTimeToIso(when)
    if (!name.trim()) return setError("Enter the customer's name")
    if (vrm.replace(/[^a-z0-9]/gi, "").length < 2) return setError("Enter the vehicle registration")
    if (!scheduledAt) return setError("Choose a date and time")
    const priceNum = price === "" ? NaN : Number(price)
    if (!Number.isFinite(priceNum) || priceNum < 0) return setError("Enter a price (0 if it's to be confirmed)")

    setSaving(true)
    setOverlap(null)
    const res = await sendJson<{ booking: BookingRow; warnings?: string[] } & Partial<OverlapDetails>>("/api/garage/bookings", "POST", {
      customer: { name: name.trim(), phone: phone.trim() || undefined, email: email.trim() || undefined },
      vehicle: { vrm, make: make.trim() || undefined, model: model.trim() || undefined, year: year ? Number(year) : undefined },
      serviceType,
      scheduledAt,
      durationMins: duration,
      technicianId: technicianId || undefined,
      totalPrice: priceNum,
      status,
      notes: notes.trim() || undefined,
      allowOverlap,
      notifyCustomer: notifyCustomer && !!email.trim(),
    })
    setSaving(false)

    if (res.status === 409 && res.data?.code === "OVERLAP") {
      setOverlap(res.data as OverlapDetails)
      return
    }
    if (!res.ok || !res.data) return setError(res.error ?? "Couldn't create the booking")

    if (res.data.warnings?.includes("OUTSIDE_OPENING_HOURS")) toast("Booked — note this is outside your opening hours")
    else toast("Booking created")
    onCreated(res.data.booking)
    onClose()
  }

  const activeTechs = technicians.filter((t) => t.isActive)

  // Choosing a service prefills its usual duration and price from the Pricing page
  // (the price only while the user hasn't typed their own).
  const chooseService = (next: string) => {
    setServiceType(next)
    const row = pricing?.services.find((s) => s.serviceType === next)
    if (!row) return
    setDuration(row.durationMins)
    if (!priceTouched) {
      const suggested = row.priceFrom ?? row.priceTo
      setPrice(suggested === null ? "" : String(suggested))
    }
  }
  const durationOptions = [...new Set([...DURATIONS, duration])].sort((a, b) => a - b)

  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(false) }} noValidate>
      <DialogHeader>
        <DialogTitle>New booking</DialogTitle>
        <DialogDescription>Add a phone or walk-in booking to your diary.</DialogDescription>
      </DialogHeader>

      <div className="space-y-5">
        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Customer</legend>
          <div>
            <FieldLabel htmlFor="nb-name">Name *</FieldLabel>
            <TextInput id="nb-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="off" autoFocus />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="nb-phone">Phone</FieldLabel>
              <TextInput id="nb-phone" type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="nb-email">Email</FieldLabel>
              <TextInput id="nb-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Vehicle</legend>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <FieldLabel htmlFor="nb-vrm">Registration *</FieldLabel>
              <TextInput id="nb-vrm" value={vrm} onChange={(e) => setVrm(e.target.value.toUpperCase())} className="font-mono uppercase tracking-wider" maxLength={12} />
            </div>
            <div>
              <FieldLabel htmlFor="nb-make">Make</FieldLabel>
              <TextInput id="nb-make" value={make} onChange={(e) => setMake(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="nb-model">Model</FieldLabel>
              <TextInput id="nb-model" value={model} onChange={(e) => setModel(e.target.value)} />
            </div>
          </div>
          <div className="w-28">
            <FieldLabel htmlFor="nb-year">Year</FieldLabel>
            <TextInput id="nb-year" type="number" min={1900} max={new Date().getFullYear() + 1} value={year} onChange={(e) => setYear(e.target.value)} />
          </div>
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-400">Job</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="nb-service">Service *</FieldLabel>
              <NativeSelect id="nb-service" value={serviceType} onChange={(e) => chooseService(e.target.value)}>
                {SERVICE_TYPES.map((s) => (
                  <option key={s} value={s}>{getServiceLabel(s)}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <FieldLabel htmlFor="nb-price">Price (£) *</FieldLabel>
              <TextInput id="nb-price" type="number" min={0} step="0.01" value={price} onChange={(e) => { setPriceTouched(true); setPrice(e.target.value) }} placeholder="0.00" />
            </div>
          </div>
          <DateTimeFields value={when} onChange={setWhen} idPrefix="nb-when" required />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="nb-duration">Duration</FieldLabel>
              <NativeSelect id="nb-duration" value={duration} onChange={(e) => setDuration(Number(e.target.value))}>
                {durationOptions.map((d) => (
                  <option key={d} value={d}>{d >= 60 ? `${Math.floor(d / 60)}h${d % 60 ? ` ${d % 60}m` : ""}` : `${d} min`}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <FieldLabel htmlFor="nb-tech">Technician</FieldLabel>
              <NativeSelect id="nb-tech" value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                <option value="">Unassigned</option>
                {activeTechs.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <FieldLabel htmlFor="nb-status">Status</FieldLabel>
              <NativeSelect id="nb-status" value={status} onChange={(e) => setStatus(e.target.value as "CONFIRMED" | "PENDING")}>
                <option value="CONFIRMED">Confirmed</option>
                <option value="PENDING">Pending</option>
              </NativeSelect>
            </div>
          </div>
          <div>
            <FieldLabel htmlFor="nb-notes">Notes (private)</FieldLabel>
            <Textarea id="nb-notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} />
          </div>
          <label className={`flex items-center gap-2 text-sm ${email.trim() ? "text-slate-700 dark:text-slate-300" : "text-slate-400 dark:text-slate-500"}`}>
            <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={notifyCustomer && !!email.trim()} disabled={!email.trim()} onChange={(e) => setNotifyCustomer(e.target.checked)} />
            Email the customer a confirmation{!email.trim() && " (add an email address)"}
          </label>
        </fieldset>

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
