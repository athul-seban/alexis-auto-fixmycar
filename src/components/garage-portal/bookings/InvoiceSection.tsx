"use client"

import { useState } from "react"
import { FileText, Mail } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, TextInput } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import type { BookingDetail } from "@/components/garage-portal/bookings/types"

/** Download or email the invoice for a completed booking. The first use assigns the invoice number. */
export function InvoiceSection({ booking, onChanged }: { booking: BookingDetail; onChanged: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [asking, setAsking] = useState(false)
  const [to, setTo] = useState("")
  const [error, setError] = useState("")

  async function email(address?: string) {
    setBusy(true)
    setError("")
    const res = await sendJson<{ to: string; number: string }>(`/api/garage/bookings/${booking.id}/invoice`, "POST", address ? { to: address } : {})
    setBusy(false)
    if (!res.ok) {
      // No email on the booking: ask for one instead of failing.
      if (res.status === 400 && !address) setAsking(true)
      return setError(res.error ?? "Couldn't send the invoice")
    }
    toast(`Invoice ${res.data?.number} sent to ${res.data?.to}`)
    setAsking(false)
    setTo("")
    onChanged()
  }

  return (
    <div>
      <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
        {booking.invoiceNumber ? <>Invoice <strong>{booking.invoiceNumber}</strong></> : "No invoice yet — creating one assigns the next invoice number."}
      </p>
      <div className="flex flex-wrap gap-2">
        <Button asChild size="sm" variant="secondary" className="gap-1.5">
          <a href={`/api/garage/bookings/${booking.id}/invoice`} download onClick={() => window.setTimeout(onChanged, 1500)}>
            <FileText className="h-3.5 w-3.5" /> Download PDF
          </a>
        </Button>
        <Button size="sm" variant="secondary" className="gap-1.5" loading={busy && !asking} onClick={() => email()}>
          <Mail className="h-3.5 w-3.5" /> Email to customer
        </Button>
      </div>
      {asking && (
        <form className="mt-3 flex gap-2" onSubmit={(e) => { e.preventDefault(); void email(to) }}>
          <TextInput type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="customer@example.com" aria-label="Email address to send the invoice to" required />
          <Button type="submit" size="sm" variant="primary" loading={busy}>Send</Button>
        </form>
      )}
      <FieldError>{error}</FieldError>
    </div>
  )
}
