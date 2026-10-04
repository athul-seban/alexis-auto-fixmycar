"use client"

import { useState } from "react"
import { useSession } from "next-auth/react"
import { AlertTriangle, CalendarClock, Mail, MessageSquare, Phone, Printer, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog"
import { FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { formatCurrency, getServiceLabel } from "@/lib/utils"
import { sourceLabel } from "@/lib/portal/labels"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { formatPhone } from "@/lib/portal/phone"
import { MessageThread } from "@/components/shared/MessageThread"
import { DateTimeFields, dateTimeFromIso, dateTimeToIso } from "@/components/garage-portal/shared/DateTimeFields"
import { OverlapNotice } from "@/components/garage-portal/shared/OverlapNotice"
import { PaymentPill } from "@/components/garage-portal/shared/PaymentPill"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { VrmPlate } from "@/components/garage-portal/shared/VrmPlate"
import type { BookingDetail, OverlapDetails, TechnicianOption } from "@/components/garage-portal/bookings/types"

interface BookingDrawerProps {
  bookingId: string | null
  onClose: () => void
  /** Called after any successful change so the list can refresh. */
  onChanged: () => void
  technicians: TechnicianOption[]
}

export function BookingDrawer({ bookingId, onClose, onChanged, technicians }: BookingDrawerProps) {
  return (
    <Dialog open={!!bookingId} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg">
        <DialogTitle className="sr-only">Booking details</DialogTitle>
        <DialogDescription className="sr-only">View and manage this booking.</DialogDescription>
        {bookingId && <DrawerBody key={bookingId} bookingId={bookingId} onChanged={onChanged} technicians={technicians} />}
      </SheetContent>
    </Dialog>
  )
}

const EVENT_ACTORS: Record<string, string> = { GARAGE: "You", OWNER: "Customer", CUSTOMER: "Customer", ADMIN: "Admin", SYSTEM: "System" }

type Mode = null | "complete" | "cancel" | "reschedule"

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-6 py-5 dark:border-white/10">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function DrawerBody({ bookingId, onChanged, technicians }: { bookingId: string; onChanged: () => void; technicians: TechnicianOption[] }) {
  const { data, loading, error, reload } = useApi<{ booking: BookingDetail }>(`/api/garage/bookings/${bookingId}`)
  const { data: session } = useSession()
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<Mode>(null)
  const [overlap, setOverlap] = useState<{ details: OverlapDetails; body: Record<string, unknown> } | null>(null)
  const [actionError, setActionError] = useState("")
  const [showThread, setShowThread] = useState(false)
  const [openedAt] = useState(() => Date.now()) // "now" for the no-show rule; fixed while the drawer is open

  const b = data?.booking

  const patch = async (body: Record<string, unknown>, successMessage?: string): Promise<boolean> => {
    setBusy(true)
    setActionError("")
    setOverlap(null)
    const res = await sendJson<{ booking: BookingDetail } & Partial<OverlapDetails>>(`/api/garage/bookings/${bookingId}`, "PATCH", body)
    setBusy(false)

    if (res.status === 409 && res.data?.code === "OVERLAP") {
      setOverlap({ details: res.data as OverlapDetails, body })
      return false
    }
    if (!res.ok) {
      setActionError(res.error ?? "Couldn't save that change")
      return false
    }
    if (successMessage) toast(successMessage)
    setMode(null)
    reload()
    onChanged()
    return true
  }

  if (!b) {
    return (
      <div className="space-y-4 p-6">
        {error ? (
          <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
        ) : (
          <>
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-64" />
            <Skeleton className="h-32 w-full" />
          </>
        )}
        {!loading && error && <Button size="sm" variant="secondary" onClick={reload}>Try again</Button>}
      </div>
    )
  }

  const startsInPast = new Date(b.scheduledAt).getTime() <= openedAt
  const phone = formatPhone(b.customerPhone)
  const userId = (session?.user as { id?: string } | undefined)?.id

  return (
    <div className="flex flex-col pb-6">
      {/* Header */}
      <div className="px-6 pb-5 pt-6">
        <div className="flex flex-wrap items-center gap-2 pr-8">
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{b.reference ?? "Booking"}</h2>
          <StatusPill status={b.displayStatus} />
          <a href={`/garage-dashboard/bookings/${b.id}/job-sheet`} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-[#1E3A5F] hover:bg-slate-50 dark:text-blue-300 dark:hover:bg-white/5">
            <Printer className="h-3.5 w-3.5" /> Job sheet
          </a>
        </div>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {getServiceLabel(b.serviceType)} · {sourceLabel(b.source)} · created {formatLondonDateTime(b.createdAt)}
        </p>
        {b.status === "CANCELLED" && b.cancelReason && (
          <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">Cancelled: {b.cancelReason}</p>
        )}
        {!b.timeConfirmed && b.status !== "CANCELLED" && (
          <div className="mt-3 flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
            <span>This is a placeholder time. Agree the real appointment with the customer, then reschedule or confirm.</span>
          </div>
        )}
        {b.displayStatus === "AWAITING_OUTCOME" && (
          <p className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            The appointment time has passed — record whether the customer attended.
          </p>
        )}
      </div>

      {actionError && <p role="alert" className="mx-6 mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{actionError}</p>}
      {overlap && (
        <div className="mx-6 mb-3">
          <OverlapNotice details={overlap.details} overriding={busy} actionLabel="Move anyway" onOverride={() => patch({ ...overlap.body, allowOverlap: true }, "Booking updated")} />
        </div>
      )}

      {/* Status actions */}
      <StatusActions b={b} busy={busy} startsInPast={startsInPast} mode={mode} setMode={setMode} patch={patch} />

      {/* Customer */}
      <Section title="Customer">
        <p className="font-semibold text-slate-900 dark:text-white">{b.customerName ?? "Unknown customer"}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {b.customerPhone && (
            <a href={`tel:${b.customerPhone}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <Phone className="h-3.5 w-3.5" /> {phone}
            </a>
          )}
          {b.customerEmail && (
            <a href={`mailto:${b.customerEmail}`} className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <Mail className="h-3.5 w-3.5" /> {b.customerEmail}
            </a>
          )}
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={!!b.contactedAt} disabled={busy} onChange={(e) => patch({ contacted: e.target.checked })} />
          Customer contacted{b.contactedAt && <span className="text-xs text-slate-400">· {formatLondonDateTime(b.contactedAt)}</span>}
        </label>
      </Section>

      {/* Vehicle & job */}
      <Section title="Vehicle & job">
        <div className="flex flex-wrap items-center gap-3">
          <VrmPlate vrm={b.vrm} />
          <span className="text-sm text-slate-600 dark:text-slate-300">
            {[b.vehicleYear, b.vehicleMake, b.vehicleModel].filter(Boolean).join(" ") || "Vehicle details not recorded"}
          </span>
        </div>
        {b.description && <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300">{b.description}</p>}
      </Section>

      {/* When */}
      <Section title="Appointment">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-slate-900 dark:text-white">{formatLondonDateTime(b.scheduledAt)}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">{b.durationMins ?? 60} min{b.durationMins === null && " (default)"}</p>
          </div>
          {(b.status === "PENDING" || b.status === "CONFIRMED" || b.status === "IN_PROGRESS") && mode !== "reschedule" && (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setMode("reschedule")}>
              <CalendarClock className="h-4 w-4" /> Reschedule
            </Button>
          )}
        </div>
        {mode === "reschedule" && <ReschedulePanel b={b} technicians={technicians} busy={busy} onCancel={() => setMode(null)} onSave={(body) => patch(body, "Booking rescheduled")} />}

        <div className="mt-4">
          <FieldLabel htmlFor="drawer-tech">Technician</FieldLabel>
          <NativeSelect id="drawer-tech" value={b.technician?.id ?? ""} disabled={busy} onChange={(e) => patch({ technicianId: e.target.value || null }, "Technician updated")}>
            <option value="">Unassigned</option>
            {technicians.filter((t) => t.isActive || t.id === b.technician?.id).map((t) => (
              <option key={t.id} value={t.id}>{t.name}{t.isActive ? "" : " (inactive)"}</option>
            ))}
          </NativeSelect>
        </div>
      </Section>

      {/* Money */}
      <MoneySection b={b} busy={busy} patch={patch} />

      {/* Notes */}
      <NotesSection key={b.notes ?? ""} b={b} busy={busy} patch={patch} />

      {/* Messages */}
      <Section title="Messages">
        {b.hasOwner && userId ? (
          showThread ? (
            <MessageThread bookingId={b.id} currentUserId={userId} />
          ) : (
            <Button size="sm" variant="secondary" className="gap-1.5" onClick={() => setShowThread(true)}>
              <MessageSquare className="h-4 w-4" /> Open conversation
            </Button>
          )
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">This customer doesn&apos;t have a Quote My Garage account, so in-app messaging isn&apos;t available — contact them by phone or email above.</p>
        )}
      </Section>

      {/* Review */}
      {b.paymentStatus !== "NONE" && (
        <Section title="Payment">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <PaymentPill status={b.paymentStatus} />
            {b.depositAmount !== null && <span className="text-slate-700 dark:text-slate-300">Deposit {formatCurrency(b.depositAmount)} of {formatCurrency(b.totalPrice)}</span>}
          </div>
          {b.paymentStatus === "PAID" && <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">The deposit is refunded automatically if you cancel. Collect the balance when the job is done.</p>}
        </Section>
      )}

      <Section title="History">
        <ol className="space-y-3 border-l border-slate-200 pl-4 dark:border-white/10">
          {b.events.map((e) => (
            <li key={e.id} className="relative text-sm">
              <span aria-hidden className="absolute -left-[1.3rem] top-1.5 h-2 w-2 rounded-full bg-[#1E3A5F] dark:bg-blue-400" />
              <p className="text-slate-800 dark:text-slate-200">{e.detail ?? e.type}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">{EVENT_ACTORS[e.actorType] ?? e.actorType} · {formatLondonDateTime(e.createdAt)}</p>
            </li>
          ))}
          {b.events.length === 0 && <li className="text-sm text-slate-400">No history recorded for this booking.</li>}
        </ol>
      </Section>

      {b.review && (
        <Section title="Customer review">
          <div className="mb-1 flex items-center gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star key={i} className={`h-4 w-4 ${i < b.review!.rating ? "fill-yellow-400 text-yellow-400" : "text-slate-300 dark:text-slate-600"}`} />
            ))}
          </div>
          {b.review.title && <p className="font-semibold text-slate-900 dark:text-white">{b.review.title}</p>}
          <p className="text-sm text-slate-600 dark:text-slate-300">{b.review.comment}</p>
          {b.review.reply && <p className="mt-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-white/5 dark:text-slate-300"><strong>Your reply:</strong> {b.review.reply}</p>}
        </Section>
      )}
    </div>
  )
}

type PatchFn = (body: Record<string, unknown>, successMessage?: string) => Promise<boolean>

function StatusActions({
  b, busy, startsInPast, mode, setMode, patch,
}: { b: BookingDetail; busy: boolean; startsInPast: boolean; mode: Mode; setMode: (m: Mode) => void; patch: PatchFn }) {
  const [fiv, setFiv] = useState(String(b.totalPrice))
  const [reason, setReason] = useState("")

  const buttons: React.ReactNode[] = []
  const add = (key: string, label: string, onClick: () => void, variant: "primary" | "secondary" | "destructive" = "secondary") =>
    buttons.push(<Button key={key} size="sm" variant={variant} disabled={busy} onClick={onClick}>{label}</Button>)

  if (b.status === "PENDING") add("confirm", "Confirm booking", () => patch({ status: "CONFIRMED" }, "Booking confirmed"), "primary")
  if (b.status === "CONFIRMED") add("start", "Start job", () => patch({ status: "IN_PROGRESS" }, "Job started"), "primary")
  if (b.status === "CONFIRMED" || b.status === "IN_PROGRESS") add("complete", "Mark complete", () => setMode("complete"), b.status === "IN_PROGRESS" ? "primary" : "secondary")
  if ((b.status === "PENDING" || b.status === "CONFIRMED") && startsInPast) add("noshow", "No show", () => patch({ status: "NO_SHOW" }, "Marked as no-show"))
  if (b.status === "PENDING" || b.status === "CONFIRMED" || b.status === "IN_PROGRESS") add("cancel", "Cancel booking", () => setMode("cancel"), "destructive")
  if (b.status === "CANCELLED") add("reinstate", "Reinstate booking", () => patch({ status: "PENDING" }, "Booking reinstated"), "primary")

  if (buttons.length === 0) return null

  return (
    <div className="px-6 pb-5">
      <div className="flex flex-wrap gap-2">{buttons}</div>

      {mode === "complete" && (
        <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
          <div>
            <FieldLabel htmlFor="fiv">Final invoice value (£)</FieldLabel>
            <TextInput id="fiv" type="number" min={0} step="0.01" value={fiv} onChange={(e) => setFiv(e.target.value)} />
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">What the customer actually paid. Used for your revenue figures.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" disabled={busy || fiv === "" || Number(fiv) < 0} onClick={() => patch({ status: "COMPLETED", finalInvoiceValue: Number(fiv) }, "Booking completed")}>Complete booking</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode(null)}>Back</Button>
          </div>
        </div>
      )}

      {mode === "cancel" && (
        <div className="mt-3 space-y-3 rounded-xl bg-red-50/60 p-4 dark:bg-red-500/5">
          <div>
            <FieldLabel htmlFor="cancel-reason">Reason (optional)</FieldLabel>
            <TextInput id="cancel-reason" value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Customer rang to cancel" />
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="destructive" disabled={busy} onClick={() => patch({ status: "CANCELLED", cancelReason: reason.trim() || null }, "Booking cancelled")}>Confirm cancellation</Button>
            <Button size="sm" variant="secondary" onClick={() => setMode(null)}>Keep booking</Button>
          </div>
        </div>
      )}
    </div>
  )
}

function ReschedulePanel({
  b, technicians, busy, onCancel, onSave,
}: { b: BookingDetail; technicians: TechnicianOption[]; busy: boolean; onCancel: () => void; onSave: (body: Record<string, unknown>) => void }) {
  const [when, setWhen] = useState(dateTimeFromIso(b.scheduledAt))
  const [duration, setDuration] = useState(b.durationMins ?? 60)
  const [tech, setTech] = useState(b.technician?.id ?? "")
  const iso = dateTimeToIso(when)

  return (
    <div className="mt-3 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
      <DateTimeFields value={when} onChange={setWhen} idPrefix="resched" required />
      <div className="grid grid-cols-2 gap-3">
        <div>
          <FieldLabel htmlFor="resched-duration">Duration (min)</FieldLabel>
          <TextInput id="resched-duration" type="number" min={15} max={960} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} />
        </div>
        <div>
          <FieldLabel htmlFor="resched-tech">Technician</FieldLabel>
          <NativeSelect id="resched-tech" value={tech} onChange={(e) => setTech(e.target.value)}>
            <option value="">Unassigned</option>
            {technicians.filter((t) => t.isActive || t.id === tech).map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="primary" disabled={busy || !iso || duration < 15} onClick={() => onSave({ scheduledAt: iso, durationMins: duration, technicianId: tech || null })}>Save new time</Button>
        <Button size="sm" variant="secondary" onClick={onCancel}>Cancel</Button>
      </div>
    </div>
  )
}

function MoneySection({ b, busy, patch }: { b: BookingDetail; busy: boolean; patch: PatchFn }) {
  const [fiv, setFiv] = useState(b.finalInvoiceValue === null ? "" : String(b.finalInvoiceValue))
  const dirty = fiv !== (b.finalInvoiceValue === null ? "" : String(b.finalInvoiceValue))

  return (
    <Section title="Price">
      <div className="flex items-baseline justify-between">
        <span className="text-sm text-slate-500 dark:text-slate-400">Quoted / booked price</span>
        <span className="font-semibold text-slate-900 dark:text-white">{formatCurrency(b.totalPrice)}</span>
      </div>
      {b.status === "COMPLETED" && (
        <div className="mt-3 flex items-end gap-2">
          <div className="flex-1">
            <FieldLabel htmlFor="drawer-fiv">Final invoice value (£)</FieldLabel>
            <TextInput id="drawer-fiv" type="number" min={0} step="0.01" value={fiv} onChange={(e) => setFiv(e.target.value)} />
          </div>
          <Button size="sm" variant="secondary" disabled={busy || !dirty || fiv === ""} onClick={() => patch({ finalInvoiceValue: Number(fiv) }, "Invoice value saved")}>Save</Button>
        </div>
      )}
    </Section>
  )
}

function NotesSection({ b, busy, patch }: { b: BookingDetail; busy: boolean; patch: PatchFn }) {
  const [notes, setNotes] = useState(b.notes ?? "")
  const dirty = notes.trim() !== (b.notes ?? "")
  return (
    <Section title="Private notes">
      <Textarea aria-label="Private notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Only visible to you and your team" />
      {dirty && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" disabled={busy} onClick={() => patch({ notes: notes.trim() || null }, "Notes saved")}>Save notes</Button>
          <Button size="sm" variant="secondary" onClick={() => setNotes(b.notes ?? "")}>Discard</Button>
        </div>
      )}
    </Section>
  )
}
