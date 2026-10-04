import { cn } from "@/lib/utils"

const STYLES: Record<string, { label: string; className: string }> = {
  PENDING: { label: "Awaiting deposit", className: "bg-amber-100 text-amber-900 dark:bg-amber-500/15 dark:text-amber-300" },
  PAID: { label: "Deposit paid", className: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300" },
  REFUNDED: { label: "Refunded", className: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300" },
  FAILED: { label: "Payment failed", className: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300" },
}

/** Deposit state of a booking. Renders nothing for bookings with no online payment (status NONE). */
export function PaymentPill({ status, className }: { status: string; className?: string }) {
  const s = STYLES[status]
  if (!s) return null
  return <span className={cn("inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold", s.className, className)}>{s.label}</span>
}
