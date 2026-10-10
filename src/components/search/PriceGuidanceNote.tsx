"use client"

import { useEffect, useState } from "react"
import { PoundSterling } from "lucide-react"
import { getServiceLabel } from "@/lib/utils"

interface Guidance {
  low: number
  median: number
  high: number
  samples: number
}

/** "Customers typically pay £X–£Y" for the service being searched, built from accepted quotes. Hidden until there's enough data. */
export function PriceGuidanceNote({ service, city }: { service: string; city?: string }) {
  const [guidance, setGuidance] = useState<Guidance | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const qs = new URLSearchParams({ service })
    if (city) qs.set("city", city)
    fetch(`/api/price-guidance?${qs}`, { signal: ctrl.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setGuidance(data?.guidance ?? null))
      .catch(() => setGuidance(null))
    return () => ctrl.abort()
  }, [service, city])

  if (!guidance) return null
  return (
    <p className="mb-4 flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm text-blue-900 dark:border-blue-500/20 dark:bg-blue-500/10 dark:text-blue-200">
      <PoundSterling className="mt-0.5 h-4 w-4 flex-shrink-0" aria-hidden />
      <span>
        Customers typically pay <strong>£{guidance.low}–£{guidance.high}</strong> for {getServiceLabel(service).toLowerCase()} (median £{guidance.median}, from{" "}
        {guidance.samples} accepted quotes). Use it as a guide when comparing.
      </span>
    </p>
  )
}
