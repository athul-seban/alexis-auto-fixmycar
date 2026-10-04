import { cn, getStatusColor } from "@/lib/utils"
import { STATUS_LABELS, type DisplayStatus } from "@/lib/portal/booking-status"

/** "NOT_READY" -> "Not ready" for statuses without an explicit label (quotes, garages, job requests). */
function humanise(status: string): string {
  const text = status.toLowerCase().replace(/_/g, " ")
  return text.charAt(0).toUpperCase() + text.slice(1)
}

export function StatusPill({ status, className }: { status: DisplayStatus | string; className?: string }) {
  const label = STATUS_LABELS[status as DisplayStatus] ?? humanise(status)
  return (
    <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", getStatusColor(status), className)}>
      {label}
    </span>
  )
}
