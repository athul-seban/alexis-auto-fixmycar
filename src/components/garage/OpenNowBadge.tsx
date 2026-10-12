"use client"

import { useEffect, useState } from "react"
import { isOpenAt } from "@/lib/portal/opening-hours"
import type { OpeningHours } from "@/types"

/** "Open now" / "Closed now". Worked out after mount so the server's clock can't cause a hydration mismatch. */
export function OpenNowBadge({ hours }: { hours: OpeningHours | null | undefined }) {
  const [open, setOpen] = useState<boolean | null>(null)
  useEffect(() => {
    // Compute on mount and keep it fresh while the page stays open.
    const update = () => setOpen(isOpenAt(hours))
    update()
    const timer = setInterval(update, 60_000)
    return () => clearInterval(timer)
  }, [hours])

  if (open === null || !hours) return null
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
        open ? "bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-300" : "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-300"
      }`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${open ? "bg-green-600" : "bg-slate-400"}`} />
      {open ? "Open now" : "Closed now"}
    </span>
  )
}
