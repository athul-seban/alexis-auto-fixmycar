"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { VehicleLookup } from "@/components/shared/VehicleLookup"
import { sendJson } from "@/hooks/use-api"
import type { OwnerVehicle } from "@/components/owner-portal/types"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdded: (vehicle: OwnerVehicle) => void
}

export function AddVehicleDialog({ open, onOpenChange, onAdded }: Props) {
  const [f, setF] = useState({ registration: "", make: "", model: "", year: String(new Date().getFullYear()), fuel: "", mileage: "", motDueDate: "", serviceDueDate: "" })
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const set = (key: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((cur) => ({ ...cur, [key]: e.target.value }))

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!f.registration.trim() || !f.make.trim() || !f.model.trim()) return setError("Registration, make and model are required")
    setBusy(true)
    setError("")
    const res = await sendJson<{ vehicle: OwnerVehicle }>("/api/vehicles", "POST", {
      registration: f.registration.trim(),
      make: f.make.trim(),
      model: f.model.trim(),
      year: parseInt(f.year, 10),
      fuel: f.fuel || undefined,
      mileage: f.mileage ? parseInt(f.mileage, 10) : undefined,
      motDueDate: f.motDueDate ? new Date(f.motDueDate).toISOString() : undefined,
      serviceDueDate: f.serviceDueDate ? new Date(f.serviceDueDate).toISOString() : undefined,
    })
    setBusy(false)
    if (!res.ok || !res.data) return setError(res.error ?? "Failed to add vehicle")
    onAdded(res.data.vehicle)
    setF((cur) => ({ ...cur, registration: "", make: "", model: "", fuel: "", mileage: "", motDueDate: "", serviceDueDate: "" }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add a vehicle</DialogTitle>
          <DialogDescription>We&apos;ll remind you when its MOT or service is due.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <FieldLabel htmlFor="v-reg">Registration</FieldLabel>
            <TextInput id="v-reg" value={f.registration} onChange={(e) => setF((c) => ({ ...c, registration: e.target.value.toUpperCase() }))} placeholder="AB12 CDE" autoComplete="off" className="font-mono uppercase" />
            <VehicleLookup
              registration={f.registration}
              onFound={(v) =>
                setF((c) => ({
                  ...c,
                  make: v.make ?? c.make,
                  model: v.model ?? c.model,
                  year: v.year ? String(v.year) : c.year,
                  fuel: v.fuel ?? c.fuel,
                  mileage: v.mileage ? String(v.mileage) : c.mileage,
                  motDueDate: v.motExpiry ?? c.motDueDate,
                }))
              }
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel htmlFor="v-make">Make</FieldLabel>
              <TextInput id="v-make" value={f.make} onChange={set("make")} />
            </div>
            <div>
              <FieldLabel htmlFor="v-model">Model</FieldLabel>
              <TextInput id="v-model" value={f.model} onChange={set("model")} />
            </div>
            <div>
              <FieldLabel htmlFor="v-year">Year</FieldLabel>
              <TextInput id="v-year" type="number" inputMode="numeric" value={f.year} onChange={set("year")} />
            </div>
            <div>
              <FieldLabel htmlFor="v-fuel">Fuel (optional)</FieldLabel>
              <TextInput id="v-fuel" value={f.fuel} onChange={set("fuel")} />
            </div>
            <div>
              <FieldLabel htmlFor="v-mileage">Mileage (optional)</FieldLabel>
              <TextInput id="v-mileage" type="number" inputMode="numeric" value={f.mileage} onChange={set("mileage")} />
            </div>
            <div />
            <div>
              <FieldLabel htmlFor="v-mot">MOT due (optional)</FieldLabel>
              <TextInput id="v-mot" type="date" value={f.motDueDate} onChange={set("motDueDate")} />
            </div>
            <div>
              <FieldLabel htmlFor="v-svc">Next service (optional)</FieldLabel>
              <TextInput id="v-svc" type="date" value={f.serviceDueDate} onChange={set("serviceDueDate")} />
            </div>
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" variant="primary" className="w-full" loading={busy}>
            Add vehicle
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  )
}
