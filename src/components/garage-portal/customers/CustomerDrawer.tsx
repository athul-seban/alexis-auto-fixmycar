"use client"

import { useState } from "react"
import Link from "next/link"
import { Mail, Phone } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogDescription, DialogTitle, SheetContent } from "@/components/ui/dialog"
import { FieldError, FieldLabel } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { formatCurrency, getServiceLabel } from "@/lib/utils"
import { formatPhone } from "@/lib/portal/phone"
import { formatLondonDate } from "@/lib/portal/tz"
import { MergeSection } from "@/components/garage-portal/customers/MergeSection"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { VrmPlate } from "@/components/garage-portal/shared/VrmPlate"
import type { CustomerDetail } from "@/components/garage-portal/customers/types"

export function CustomerDrawer({ customerKey, onClose, onChanged }: { customerKey: string | null; onClose: () => void; onChanged: () => void }) {
  return (
    <Dialog open={!!customerKey} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="sm:max-w-lg">
        <DialogTitle className="sr-only">Customer details</DialogTitle>
        <DialogDescription className="sr-only">Contact details, booking history and a private note.</DialogDescription>
        {customerKey && <Body key={customerKey} customerKey={customerKey} onChanged={onChanged} />}
      </SheetContent>
    </Dialog>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-slate-100 px-6 py-5 dark:border-white/10">
      <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function Body({ customerKey, onChanged }: { customerKey: string; onChanged: () => void }) {
  const { data, error, reload } = useApi<CustomerDetail>(`/api/garage/customers/detail?key=${encodeURIComponent(customerKey)}`)

  if (!data) {
    return (
      <div className="space-y-4 p-6">
        {error ? <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p> : (<><Skeleton className="h-6 w-40" /><Skeleton className="h-4 w-64" /><Skeleton className="h-32 w-full" /></>)}
      </div>
    )
  }

  const { customer: c, bookings } = data
  return (
    <div className="flex flex-col pb-6">
      <div className="px-6 pb-5 pt-6">
        <h2 className="pr-8 text-lg font-bold text-slate-900 dark:text-white">{c.name}</h2>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {c.email && (
            <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1.5 text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">
              <Mail className="h-4 w-4" /> {c.email}
            </a>
          )}
          {c.phone && (
            <a href={`tel:${c.phone}`} className="inline-flex items-center gap-1.5 text-slate-600 underline-offset-2 hover:underline dark:text-slate-300">
              <Phone className="h-4 w-4" /> {formatPhone(c.phone)}
            </a>
          )}
        </div>
        <dl className="mt-4 grid grid-cols-3 gap-3 text-center">
          {[
            ["Bookings", c.bookings],
            ["Spend", formatCurrency(c.spend)],
            ["No-shows", c.noShows],
          ].map(([label, value]) => (
            <div key={label as string} className="rounded-lg bg-slate-50 p-2 dark:bg-slate-800">
              <dd className="text-base font-bold text-slate-900 dark:text-white">{value}</dd>
              <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
            </div>
          ))}
        </dl>
      </div>

      {c.vehicles.length > 0 && (
        <Section title="Vehicles">
          <ul className="flex flex-wrap gap-3">
            {c.vehicles.map((v) => (
              <li key={v.vrm} className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
                <VrmPlate vrm={v.vrm} /> {v.label}
              </li>
            ))}
          </ul>
        </Section>
      )}

      <NoteSection customerKey={customerKey} initial={data.note?.body ?? ""} onSaved={reload} />

      <MergeSection customer={c} onChanged={() => { reload(); onChanged() }} />

      <Section title="Booking history">
        {bookings.length === 0 ? (
          <p className="text-sm text-slate-500 dark:text-slate-400">No bookings.</p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {bookings.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <Link href={`/garage-dashboard/bookings?booking=${b.id}`} className="font-medium text-slate-900 underline-offset-2 hover:underline dark:text-white">
                    {getServiceLabel(b.serviceType)}
                  </Link>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {formatLondonDate(b.scheduledAt)} · {formatCurrency(b.finalInvoiceValue ?? b.totalPrice)}
                  </p>
                </div>
                <StatusPill status={b.status} />
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  )
}

function NoteSection({ customerKey, initial, onSaved }: { customerKey: string; initial: string; onSaved: () => void }) {
  const { toast } = useToast()
  const [text, setText] = useState(initial)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const dirty = text.trim() !== initial.trim()

  async function save() {
    setBusy(true)
    setError("")
    const res = await sendJson("/api/garage/customers/note", "PUT", { key: customerKey, body: text })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save the note")
    toast(text.trim() ? "Note saved" : "Note removed")
    onSaved()
  }

  return (
    <Section title="Private note">
      <FieldLabel htmlFor="cust-note" className="sr-only">Private note about this customer</FieldLabel>
      <Textarea id="cust-note" rows={3} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="Only you can see this — e.g. prefers morning slots, always has the locking wheel nut key." />
      <FieldError>{error}</FieldError>
      {dirty && (
        <div className="mt-2 flex gap-2">
          <Button size="sm" variant="primary" loading={busy} onClick={save}>Save note</Button>
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => setText(initial)}>Discard</Button>
        </div>
      )}
    </Section>
  )
}
