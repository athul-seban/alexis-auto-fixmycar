"use client"

import { useState } from "react"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { CalendarPlus, CheckCircle2, Clock, MapPin, MessageSquare, Phone, RotateCcw, Send, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn, formatCurrency, getServiceLabel, timeAgo } from "@/lib/utils"
import { formatLondonDate } from "@/lib/portal/tz"
import { formatPhone } from "@/lib/portal/phone"
import { garageLinks } from "@/lib/portal/links"
import type { EnquiryRow } from "@/lib/portal/enquiries"
import { MessageThread } from "@/components/shared/MessageThread"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { VrmPlate } from "@/components/garage-portal/shared/VrmPlate"
import { QuoteForm } from "@/components/garage-portal/enquiries/QuoteForm"

interface EnquiryCardProps {
  enquiry: EnquiryRow
  highlighted?: boolean
  busy?: boolean
  onWork: (patch: { contacted?: boolean; ignored?: boolean }) => void
  onBook: () => void
  onQuoted: () => void
}

const STATUS_NOTE: Record<string, string> = {
  PENDING: "Awaiting your quote",
  NEW: "Awaiting your quote",
  SENT: "Quote sent",
  ACCEPTED: "Accepted",
  DECLINED: "Not chosen",
  REJECTED: "Declined",
  EXPIRED: "Expired",
  IGNORED: "Ignored",
}

export function EnquiryCard({ enquiry: e, highlighted, busy, onWork, onBook, onQuoted }: EnquiryCardProps) {
  const { data: session } = useSession()
  const [quoting, setQuoting] = useState(false)
  const [thread, setThread] = useState(false)
  const userId = (session?.user as { id?: string } | undefined)?.id
  const phone = formatPhone(e.customer.phone)

  return (
    <article
      id={`enq-${e.key}`}
      className={cn(
        "rounded-xl border bg-white p-5 transition-shadow dark:bg-slate-800",
        highlighted ? "border-[#F97316] ring-2 ring-[#F97316]/30" : "border-gray-200 dark:border-white/10"
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="font-bold text-slate-900 dark:text-white">{getServiceLabel(e.serviceType)}</h3>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">
              {e.kind === "QUOTE" ? "Quote request" : "Job lead"}
            </span>
            <StatusPill status={e.status === "NEW" || e.status === "IGNORED" ? "PENDING" : e.status} className={cn(e.status === "IGNORED" && "opacity-70")} />
            <span className="text-xs text-slate-400 dark:text-slate-500" title={new Date(e.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}>{timeAgo(e.createdAt)}</span>
          </div>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{e.description}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="flex items-center gap-2">
              <VrmPlate vrm={e.vehicle.vrm} />
              {e.vehicle.year} {e.vehicle.make} {e.vehicle.model}
            </span>
            {e.location && (
              <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{e.location.city}, {e.location.postcode}</span>
            )}
            {e.preferredDate && (
              <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Wants ~{formatLondonDate(e.preferredDate)}</span>
            )}
            <span className="flex items-center gap-1">
              <Phone className="h-3.5 w-3.5" />
              {e.customer.name ?? "Customer"}
              {e.customer.phone && (
                <> · <a href={`tel:${e.customer.phone}`} className="font-medium text-[#1E3A5F] hover:underline dark:text-blue-300">{phone}</a></>
              )}
            </span>
          </div>
        </div>

        <div className="flex flex-shrink-0 flex-col gap-2 sm:items-end">
          {e.myPrice !== null && (
            <div className="text-left sm:text-right">
              <div className="text-xl font-bold text-green-600 dark:text-green-400">{formatCurrency(e.myPrice)}</div>
              <div className="text-xs text-slate-400 dark:text-slate-500">
                {STATUS_NOTE[e.status] ?? e.status}
                {e.validUntil && e.stage === "estimates" && ` · valid to ${formatLondonDate(e.validUntil)}`}
              </div>
            </div>
          )}
          {e.stage === "new" && !quoting && (
            <Button size="sm" variant="primary" className="gap-1.5" onClick={() => setQuoting(true)}>
              <Send className="h-3.5 w-3.5" /> Send quote
            </Button>
          )}
          {e.stage === "estimates" && e.canBook && (
            <Button size="sm" variant="primary" className="gap-1.5" onClick={onBook}>
              <CalendarPlus className="h-3.5 w-3.5" /> Create booking
            </Button>
          )}
          {e.bookingId && (
            <Button asChild size="sm" variant="secondary">
              <Link href={garageLinks.booking(e.bookingId)}>View booking</Link>
            </Button>
          )}
        </div>
      </div>

      {quoting && <QuoteForm enquiry={e} onCancel={() => setQuoting(false)} onSent={() => { setQuoting(false); onQuoted() }} />}
      {e.kind === "QUOTE" && e.stage === "estimates" && !quoting && (
        <button type="button" onClick={() => setQuoting(true)} className="mt-3 cursor-pointer text-xs font-semibold text-[#1E3A5F] hover:underline dark:text-blue-300">
          Revise quote
        </button>
      )}

      {/* Secondary actions */}
      <div className="mt-4 flex flex-wrap items-center gap-1 border-t border-slate-100 pt-3 dark:border-white/10">
        <WorkButton
          active={e.contacted}
          disabled={busy}
          onClick={() => onWork({ contacted: !e.contacted })}
          icon={<CheckCircle2 className="h-3.5 w-3.5" />}
          label={e.contacted ? "Contacted" : "Mark contacted"}
        />
        {e.stage === "new" && (
          <WorkButton
            disabled={busy}
            onClick={() => onWork({ ignored: true })}
            icon={<XCircle className="h-3.5 w-3.5" />}
            label={e.kind === "QUOTE" ? "Decline" : "Ignore"}
          />
        )}
        {e.ignored && (
          <WorkButton disabled={busy} onClick={() => onWork({ ignored: false })} icon={<RotateCcw className="h-3.5 w-3.5" />} label="Restore" />
        )}
        {e.canMessage && userId && (
          <WorkButton active={thread} onClick={() => setThread((t) => !t)} icon={<MessageSquare className="h-3.5 w-3.5" />} label={thread ? "Hide messages" : "Messages"} />
        )}
      </div>
      {thread && userId && (
        <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
          <MessageThread quoteId={e.id} currentUserId={userId} />
        </div>
      )}
    </article>
  )
}

function WorkButton({ icon, label, onClick, active, disabled }: { icon: React.ReactNode; label: string; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        active
          ? "text-green-700 hover:bg-green-50 dark:text-green-400 dark:hover:bg-green-500/10"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
      )}
    >
      {icon}
      {label}
    </button>
  )
}
