"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { CheckCircle, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, NativeSelect } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { SEARCH_SERVICE_OPTIONS } from "@/lib/service-options"

interface VehicleOption {
  id: string
  registration: string
  make: string
  model: string
  year: number
}

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  garageId: string
  garageSlug: string
  isSignedIn: boolean
  isOwner: boolean
  /** Preselect a service (from the search the visitor came from). */
  initialService?: string
  /** Preselect the saved vehicle with this registration. */
  initialReg?: string
}

const normaliseReg = (r: string) => r.replace(/\s+/g, "").toUpperCase()

/** Signed-in owners request a quote from this garage; everyone else is pointed at the right alternative. */
export function QuoteRequestDialog({ open, onOpenChange, garageId, garageSlug, isSignedIn, isOwner, initialService, initialReg }: Props) {
  const [vehicles, setVehicles] = useState<VehicleOption[]>([])
  const [vehiclesLoading, setVehiclesLoading] = useState(isOwner)
  const [vehicleId, setVehicleId] = useState("")
  const [serviceType, setServiceType] = useState(initialService && SEARCH_SERVICE_OPTIONS.some((s) => s.value === initialService) ? initialService : "MOT")
  const [description, setDescription] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState("")
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (!open || !isOwner) return
    let cancelled = false
    fetch("/api/vehicles")
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return
        const list: VehicleOption[] = data.vehicles ?? []
        setVehicles(list)
        const match = initialReg ? list.find((v) => normaliseReg(v.registration) === normaliseReg(initialReg)) : undefined
        setVehicleId((match ?? list[0])?.id ?? "")
      })
      .catch(() => !cancelled && setVehicles([]))
      .finally(() => !cancelled && setVehiclesLoading(false))
    return () => {
      cancelled = true
    }
  }, [open, isOwner, initialReg])

  const handleSubmit = async () => {
    setError("")
    if (!vehicleId) return setError("Please select a vehicle")
    if (description.trim().length < 10) return setError("Please describe what you need in at least 10 characters")
    setSubmitting(true)
    try {
      const res = await fetch("/api/quotes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "request", vehicleId, garageId, serviceType, description }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed to send quote request")
      setSuccess(true)
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send quote request")
    } finally {
      setSubmitting(false)
    }
  }

  const postJobHref = `/post-job?garage=${encodeURIComponent(garageSlug)}${serviceType ? `&service=${serviceType}` : ""}${initialReg ? `&reg=${encodeURIComponent(initialReg)}` : ""}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Request a quote</DialogTitle>
          <DialogDescription>Tell the garage what you need and it will reply with a price.</DialogDescription>
        </DialogHeader>

        {!isSignedIn ? (
          <div className="py-2 text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Sign in as a vehicle owner to request a quote, or send this garage a request without an account.</p>
            <div className="flex flex-col gap-2">
              <Link href="/login"><Button className="w-full">Sign in</Button></Link>
              <Link href={postJobHref}><Button variant="outline" className="w-full">Request a quote without an account</Button></Link>
            </div>
          </div>
        ) : !isOwner ? (
          <p className="py-6 text-center text-sm text-slate-600 dark:text-slate-300">Only vehicle owner accounts can request quotes directly.</p>
        ) : success ? (
          <div className="py-4 text-center">
            <CheckCircle className="mx-auto mb-3 h-12 w-12 text-green-500" />
            <p className="mb-1 font-semibold text-slate-900 dark:text-white">Quote requested!</p>
            <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">The garage will respond soon. You&apos;ll see its reply under your quotes.</p>
            <Link href="/dashboard/quotes"><Button className="w-full">View my quotes</Button></Link>
          </div>
        ) : vehiclesLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-slate-300 dark:text-slate-600" /></div>
        ) : vehicles.length === 0 ? (
          <div className="py-2 text-center">
            <p className="mb-4 text-sm text-slate-600 dark:text-slate-300">Add a vehicle to your account before requesting a quote.</p>
            <Link href="/dashboard/vehicles"><Button className="w-full">Add a vehicle</Button></Link>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <FieldLabel htmlFor="qr-vehicle">Vehicle</FieldLabel>
              <NativeSelect id="qr-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>{v.registration} · {v.year} {v.make} {v.model}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <FieldLabel htmlFor="qr-service">Service needed</FieldLabel>
              <NativeSelect id="qr-service" value={serviceType} onChange={(e) => setServiceType(e.target.value)}>
                {SEARCH_SERVICE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <FieldLabel htmlFor="qr-description">Description</FieldLabel>
              <Textarea id="qr-description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Describe the issue or service you need..." />
            </div>
            <FieldError>{error}</FieldError>
            <Button className="w-full" loading={submitting} onClick={handleSubmit}>Send quote request</Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
