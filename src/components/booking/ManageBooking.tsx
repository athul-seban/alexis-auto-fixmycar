"use client"

import { useState } from "react"
import { CalendarClock, MapPin, Phone, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldError } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { sendJson, useApi } from "@/hooks/use-api"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { cn, formatCurrency, getServiceLabel } from "@/lib/utils"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { PaymentPill } from "@/components/garage-portal/shared/PaymentPill"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"

interface ManagedBooking {
  reference: string | null
  serviceType: string
  status: string
  displayStatus: string
  scheduledAt: string
  timeConfirmed: boolean
  totalPrice: number
  customerName: string | null
  vehicle: string | null
  cancelReason: string | null
  garage: { name: string; slug: string; phone: string; address: string; city: string; postcode: string }
  review: { rating: number; comment: string; reply: string | null } | null
  paymentStatus: string
  depositAmount: number | null
  refundedAmount: number | null
  cancelRefundNote: string | null
  canCancel: boolean
  canReschedule: boolean
  canReview: boolean
}

function ReschedulePanel({ token, onMoved }: { token: string; onMoved: () => void }) {
  const [open, setOpen] = useState(false)
  const [date, setDate] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const { data, loading } = useApi<{ slots: { start: string; label: string }[] }>(open && date ? `/api/booking/${token}/slots?date=${date}` : null)

  async function move(start: string) {
    setBusy(true)
    setError("")
    const res = await sendJson(`/api/booking/${token}`, "POST", { action: "reschedule", start })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't move the booking")
    setOpen(false)
    onMoved()
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Change time
      </Button>
    )
  }
  return (
    <div className="rounded-lg border border-slate-200 p-3 dark:border-white/10">
      <FieldLabel htmlFor="resched-date">Choose a new day</FieldLabel>
      <TextInput id="resched-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      {date && (
        <div className="mt-3" aria-live="polite">
          {loading ? (
            <p className="text-sm text-slate-500">Finding times…</p>
          ) : data?.slots.length ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {data.slots.map((s) => (
                <li key={s.start}>
                  <button type="button" disabled={busy} onClick={() => move(s.start)} className="min-h-10 w-full cursor-pointer rounded-lg border border-slate-200 text-sm font-semibold text-slate-800 hover:border-[#1E3A5F] hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:text-slate-200 dark:hover:bg-white/5">
                    {s.label}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No times available that day — try another.</p>
          )}
        </div>
      )}
      <FieldError>{error}</FieldError>
      <button type="button" onClick={() => setOpen(false)} className="mt-3 cursor-pointer text-sm font-semibold text-slate-500 hover:underline">
        Keep my current time
      </button>
    </div>
  )
}

const card = "rounded-xl border border-gray-200 bg-white p-5 dark:border-white/10 dark:bg-slate-800 sm:p-6"

/** The page behind the link in a customer's booking email: view, cancel, and review without an account. */
export function ManageBooking({ token }: { token: string }) {
  const { data, loading, error, reload } = useApi<{ booking: ManagedBooking }>(`/api/booking/${token}`)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState("")
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState("")
  const [reviewError, setReviewError] = useState("")
  const b = data?.booking
  // Stripe sends the customer back with ?paid=1; the webhook may land a moment after they do.
  const [returnedFromStripe] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("paid") === "1")

  async function cancel() {
    setBusy(true)
    const res = await sendJson(`/api/booking/${token}`, "POST", { action: "cancel" })
    setBusy(false)
    setCancelOpen(false)
    setMsg(res.ok ? "Your booking has been cancelled and the garage has been told." : (res.error ?? "Couldn't cancel"))
    if (res.ok) reload()
  }

  async function review(e: React.FormEvent) {
    e.preventDefault()
    if (comment.trim().length < 10) return setReviewError("Please write at least 10 characters")
    setBusy(true)
    setReviewError("")
    const res = await sendJson(`/api/booking/${token}`, "POST", { action: "review", rating, comment })
    setBusy(false)
    if (!res.ok) return setReviewError(res.error ?? "Couldn't submit your review")
    setMsg("Thanks — your review is now live.")
    reload()
  }

  if (loading && !b) return <Skeleton className="mx-auto h-72 w-full max-w-xl" />
  if (error || !b) {
    return (
      <div role="alert" className={cn(card, "mx-auto max-w-xl text-center")}>
        <h1 className="mb-2 text-xl font-bold text-slate-900 dark:text-white">We couldn&apos;t find that booking</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">The link may be incomplete. Use the link from your confirmation email, or contact the garage directly.</p>
      </div>
    )
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-5">
      {msg && (
        <p role="status" className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-900 dark:border-green-500/30 dark:bg-green-500/10 dark:text-green-200">
          {msg}
        </p>
      )}
      <section className={card}>
        {returnedFromStripe && b.paymentStatus === "PENDING" && (
          <p role="status" className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            Thanks — we&apos;re confirming your payment. Refresh this page in a moment.
          </p>
        )}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Your booking{b.customerName ? `, ${b.customerName.split(" ")[0]}` : ""}</h1>
            {b.reference && <p className="text-sm text-slate-500 dark:text-slate-400">Reference {b.reference}</p>}
          </div>
          <StatusPill status={b.displayStatus} />
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className="sr-only">Service</dt>
            <dd className="font-semibold text-slate-900 dark:text-white">
              {getServiceLabel(b.serviceType)}
              {b.vehicle ? ` · ${b.vehicle}` : ""} · {formatCurrency(b.totalPrice)}
            </dd>
          </div>
          <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
            <CalendarClock className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <div>
              <dt className="sr-only">When</dt>
              <dd>{b.timeConfirmed ? formatLondonDateTime(b.scheduledAt) : "The garage will agree a time with you"}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
            <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
            <div>
              <dt className="sr-only">Where</dt>
              <dd>
                <a href={`/garage/${b.garage.slug}`} className="font-semibold underline-offset-2 hover:underline">
                  {b.garage.name}
                </a>
                <br />
                {b.garage.address}, {b.garage.city} {b.garage.postcode}
              </dd>
            </div>
          </div>
          {b.paymentStatus !== "NONE" && (
            <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-300">
              <dt className="sr-only">Payment</dt>
              <dd className="flex flex-wrap items-center gap-2">
                <PaymentPill status={b.paymentStatus} />
                {b.depositAmount !== null && <span>Deposit {formatCurrency(b.depositAmount)}</span>}
                {b.refundedAmount ? <span>· {formatCurrency(b.refundedAmount)} refunded</span> : null}
              </dd>
            </div>
          )}
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Phone className="h-4 w-4 flex-shrink-0 text-slate-400" />
            <dt className="sr-only">Phone</dt>
            <dd>
              <a href={`tel:${b.garage.phone}`} className="underline-offset-2 hover:underline">
                {b.garage.phone}
              </a>
            </dd>
          </div>
        </dl>

        {b.status === "CANCELLED" && b.cancelReason && <p className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">Cancelled: {b.cancelReason}</p>}

        {b.canCancel && (
          <div className="mt-5 border-t border-slate-100 pt-4 dark:border-white/10">
            <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
              {b.canReschedule ? "Need a different time, or no longer need it? You can change or cancel your booking here." : "To change the time, call the garage. If you no longer need the booking you can cancel it here."}
            </p>
            {b.cancelRefundNote && <p className="mb-3 text-sm font-medium text-slate-700 dark:text-slate-200">{b.cancelRefundNote}</p>}
            <div className="flex flex-col gap-3">
              {b.canReschedule && (
                <ReschedulePanel
                  token={token}
                  onMoved={() => {
                    setMsg("Your booking has been moved and the garage has been told.")
                    reload()
                  }}
                />
              )}
              <div>
                <Button variant="secondary" className="text-red-700 dark:text-red-400" onClick={() => setCancelOpen(true)}>
                  Cancel booking
                </Button>
              </div>
            </div>
          </div>
        )}
      </section>

      {b.canReview && (
        <form onSubmit={review} className={card}>
          <h2 className="mb-3 text-lg font-bold text-slate-900 dark:text-white">How did {b.garage.name} do?</h2>
          <div role="radiogroup" aria-label="Rating" className="mb-3 flex gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" role="radio" aria-checked={i === rating} aria-label={`${i} star${i === 1 ? "" : "s"}`} onClick={() => setRating(i)} className="cursor-pointer rounded p-1">
                <Star className={cn("h-8 w-8", i <= rating ? "fill-yellow-400 text-yellow-400" : "text-gray-200 dark:text-slate-700")} />
              </button>
            ))}
          </div>
          <Textarea rows={4} value={comment} onChange={(e) => setComment(e.target.value)} aria-label="Your review" placeholder="Tell others what it was like…" maxLength={2000} />
          <FieldError>{reviewError}</FieldError>
          <Button type="submit" variant="primary" className="mt-3" loading={busy}>
            Submit review
          </Button>
        </form>
      )}

      {b.review && (
        <section className={card}>
          <h2 className="mb-1 text-lg font-bold text-slate-900 dark:text-white">Your review</h2>
          <p className="text-amber-500" role="img" aria-label={`${b.review.rating} out of 5`}>
            {"★".repeat(b.review.rating)}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{b.review.comment}</p>
          {b.review.reply && (
            <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <strong className="block text-xs">Reply from {b.garage.name}</strong>
              {b.review.reply}
            </p>
          )}
        </section>
      )}

      <ConfirmDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this booking?"
        description={`${getServiceLabel(b.serviceType)} at ${b.garage.name}. The garage will be told straight away.`}
        confirmLabel="Cancel booking"
        destructive
        loading={busy}
        onConfirm={cancel}
      />
    </div>
  )
}
