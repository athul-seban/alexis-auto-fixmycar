"use client"

import { useState } from "react"
import { Send } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { sendJson } from "@/hooks/use-api"
import type { EnquiryRow } from "@/lib/portal/enquiries"
import { getServiceLabel } from "@/lib/utils"

interface QuoteFormProps {
  enquiry: EnquiryRow
  onSent: () => void
  onCancel: () => void
}

const VALID_DAYS = [3, 7, 14, 30]

/** Price an enquiry. Quote requests and guest job leads use different endpoints but the same form. */
export function QuoteForm({ enquiry, onSent, onCancel }: QuoteFormProps) {
  const [price, setPrice] = useState(enquiry.myPrice?.toString() ?? "")
  const [labour, setLabour] = useState(enquiry.laborCost?.toString() ?? "")
  const [parts, setParts] = useState(enquiry.partsCost?.toString() ?? "")
  const multi = enquiry.works.length > 1
  // One amount per work, starting from what the customer was last quoted, else the garage's own fixed price.
  const [amounts, setAmounts] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      enquiry.works.map((w) => {
        const sent = enquiry.lineItems.find((i) => i.serviceType === w)?.price ?? enquiry.suggestedPrices[w]
        return [w, sent?.toString() ?? ""]
      })
    )
  )
  const itemised = enquiry.works.reduce((t, w) => t + (Number(amounts[w]) > 0 ? Number(amounts[w]) : 0), 0)
  const [validDays, setValidDays] = useState(7)
  const [note, setNote] = useState(enquiry.note ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const total = multi ? Math.round(itemised * 100) / 100 : Number(price)
    if (multi && enquiry.works.some((w) => !(Number(amounts[w]) > 0))) return setError("Enter a price for every service")
    if (!Number.isFinite(total) || total <= 0) return setError("Enter the total price")
    setSaving(true)
    setError("")

    const optional = (v: string) => (v !== "" && Number(v) > 0 ? Number(v) : undefined)
    const items = enquiry.works.map((w) => ({ serviceType: w, price: Number(amounts[w]) }))
    const common = { ...(multi ? { items } : { price: total }), laborCost: optional(labour), partsCost: optional(parts), validDays }
    const res =
      enquiry.kind === "QUOTE"
        ? await sendJson("/api/quotes", "POST", { action: "respond", quoteId: enquiry.id, ...common, notes: note.trim() || undefined })
        : await sendJson(`/api/job-requests/${enquiry.id}/respond`, "POST", { ...common, message: note.trim() || undefined })

    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't send the quote")
    onSent()
  }

  const id = `qf-${enquiry.key}`
  return (
    <form onSubmit={submit} noValidate className="mt-4 space-y-3 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
      {multi ? (
        <div className="space-y-2">
          {enquiry.works.map((w, i) => (
            <div key={w} className="grid grid-cols-[1fr_8rem] items-center gap-3">
              <FieldLabel htmlFor={`${id}-w-${w}`}>{getServiceLabel(w)} (£)</FieldLabel>
              <TextInput id={`${id}-w-${w}`} type="number" min={0} step="0.01" value={amounts[w]} autoFocus={i === 0} onChange={(e) => setAmounts((a) => ({ ...a, [w]: e.target.value }))} />
            </div>
          ))}
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">Total: £{itemised.toFixed(2)}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="sm:col-span-2">
            <FieldLabel htmlFor={`${id}-price`}>Total price (£) *</FieldLabel>
            <TextInput id={`${id}-price`} type="number" min={0} step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} autoFocus />
          </div>
          <div>
            <FieldLabel htmlFor={`${id}-labour`}>Labour (£)</FieldLabel>
            <TextInput id={`${id}-labour`} type="number" min={0} step="0.01" value={labour} onChange={(e) => setLabour(e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor={`${id}-parts`}>Parts (£)</FieldLabel>
            <TextInput id={`${id}-parts`} type="number" min={0} step="0.01" value={parts} onChange={(e) => setParts(e.target.value)} />
          </div>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <div>
          <FieldLabel htmlFor={`${id}-valid`}>Valid for</FieldLabel>
          <NativeSelect id={`${id}-valid`} value={validDays} onChange={(e) => setValidDays(Number(e.target.value))}>
            {VALID_DAYS.map((d) => (
              <option key={d} value={d}>{d} days</option>
            ))}
          </NativeSelect>
        </div>
        <div className="sm:col-span-3">
          <FieldLabel htmlFor={`${id}-note`}>Message to customer (optional)</FieldLabel>
          <Textarea id={`${id}-note`} rows={2} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} />
        </div>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" className="gap-1.5" loading={saving}>
          <Send className="h-3.5 w-3.5" /> {enquiry.myPrice ? "Update quote" : "Send quote"}
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={onCancel} disabled={saving}>Cancel</Button>
      </div>
    </form>
  )
}
