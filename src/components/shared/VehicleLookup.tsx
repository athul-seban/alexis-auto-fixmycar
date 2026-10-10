"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Button } from "@/components/ui/button"

export interface LookedUpVehicle {
  registration: string
  make: string | null
  model: string | null
  year: number | null
  fuel: string | null
  colour: string | null
  motExpiry: string | null
  mileage: number | null
}

interface LookupResponse {
  available?: boolean
  found?: boolean
  vehicle?: LookedUpVehicle
  adviceDescription?: string
  error?: string
}

/**
 * "Look up" button for a registration field. Fills in make, model, year, fuel and MOT expiry from DVSA's MOT history.
 * Renders nothing when the platform has no DVSA credentials, so the form simply stays manual.
 */
export function VehicleLookup({ registration, onFound }: { registration: string; onFound: (v: LookedUpVehicle, adviceDescription: string) => void }) {
  const [available, setAvailable] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: "ok" | "warn"; text: string } | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    fetch("/api/vehicle-lookup", { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: LookupResponse) => setAvailable(Boolean(d.available)))
      .catch(() => {})
    return () => ctrl.abort()
  }, [])

  if (!available) return null

  async function lookup() {
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(`/api/vehicle-lookup?reg=${encodeURIComponent(registration)}`)
      const data = (await res.json().catch(() => ({}))) as LookupResponse
      if (!res.ok) return setMessage({ tone: "warn", text: data.error ?? "Couldn't look that up — fill the details in yourself." })
      if (!data.found || !data.vehicle) return setMessage({ tone: "warn", text: "We couldn't find that registration. Check it, or fill the details in yourself." })
      onFound(data.vehicle, data.adviceDescription ?? "")
      setMessage({ tone: "ok", text: `Found: ${[data.vehicle.make, data.vehicle.model].filter(Boolean).join(" ") || data.vehicle.registration}. Please check the details.` })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-2">
      <Button type="button" variant="outline" size="sm" className="gap-1.5" loading={busy} disabled={registration.trim().length < 2} onClick={lookup}>
        <Search className="h-3.5 w-3.5" aria-hidden /> Look up vehicle
      </Button>
      {message && (
        <p role="status" className={message.tone === "ok" ? "mt-1.5 text-xs text-green-700 dark:text-green-400" : "mt-1.5 text-xs text-slate-600 dark:text-slate-300"}>
          {message.text}
        </p>
      )}
    </div>
  )
}
