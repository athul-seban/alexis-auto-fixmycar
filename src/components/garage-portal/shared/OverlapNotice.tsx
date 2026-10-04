import { AlertTriangle } from "lucide-react"
import { formatLondonDateTime } from "@/lib/portal/tz"
import { formatVrm } from "@/lib/portal/vrm"
import type { OverlapDetails } from "@/components/garage-portal/bookings/types"

const REASONS: Record<string, string> = {
  FULL: "You're already at capacity at that time.",
  BLOCKED: "That time is blocked in your diary.",
  TECHNICIAN_BUSY: "That technician is already busy at that time.",
}

/** Explains an OVERLAP rejection and offers the "book anyway" override. */
export function OverlapNotice({
  details,
  onOverride,
  overriding,
  actionLabel = "Book anyway",
}: {
  details: OverlapDetails
  onOverride: () => void
  overriding?: boolean
  actionLabel?: string
}) {
  return (
    <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <div className="flex-1">
          <p className="font-semibold">{REASONS[details.reason ?? "FULL"] ?? details.error}</p>
          {details.conflicts.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs">
              {details.conflicts.map((c) => (
                <li key={c.id}>
                  {formatLondonDateTime(c.scheduledAt)} · {c.customerName ?? "Customer"}
                  {c.vrm ? ` · ${formatVrm(c.vrm)}` : ""}
                  {c.reference ? ` · ${c.reference}` : ""}
                </li>
              ))}
            </ul>
          )}
          <button
            type="button"
            onClick={onOverride}
            disabled={overriding}
            className="mt-3 cursor-pointer rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-amber-700 disabled:opacity-60"
          >
            {overriding ? "Saving…" : actionLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
