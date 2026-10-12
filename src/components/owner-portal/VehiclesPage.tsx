"use client"

import { useState } from "react"
import { Car, History, Pencil, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { sendJson, useApi } from "@/hooks/use-api"
import { formatDateShort, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { AddVehicleDialog } from "@/components/owner-portal/AddVehicleDialog"
import { isDueSoon, type OwnerVehicle } from "@/components/owner-portal/types"

interface HistoryItem {
  id: string
  serviceType: string
  scheduledAt: string
  completedAt: string | null
  garage: { name: string }
}

function VehicleHistory({ vehicleId }: { vehicleId: string }) {
  const { data, loading } = useApi<{ history: HistoryItem[] }>(`/api/vehicles/${vehicleId}/history`)
  return (
    <div className="mt-3 border-t border-slate-100 pt-3 dark:border-white/10">
      <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Service history</p>
      {loading && !data ? (
        <Skeleton className="h-4 w-1/2" />
      ) : !data?.history.length ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">No completed services yet.</p>
      ) : (
        <ul className="space-y-2">
          {data.history.map((h) => (
            <li key={h.id} className="flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-600 dark:text-slate-300">
                {getServiceLabel(h.serviceType)} · {h.garage.name}
              </span>
              <span className="flex-shrink-0 text-slate-500 dark:text-slate-400">{formatDateShort(h.completedAt ?? h.scheduledAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function VehicleCard({ vehicle, onEdit, onDelete }: { vehicle: OwnerVehicle; onEdit: () => void; onDelete: () => void }) {
  const [showHistory, setShowHistory] = useState(false)
  const [now] = useState(() => Date.now())
  const motDue = isDueSoon(vehicle.motDueDate, now)
  const serviceDue = isDueSoon(vehicle.serviceDueDate, now)

  return (
    <Panel className="p-5">
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl bg-[#1E3A5F]">
          <Car className="h-6 w-6 text-white" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="plate-number text-sm">{vehicle.registration}</div>
          <p className="mt-1 font-semibold text-slate-900 dark:text-white">
            {vehicle.year} {vehicle.make} {vehicle.model}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {vehicle.fuel ?? "Fuel unknown"}
            {vehicle.mileage ? ` · ${vehicle.mileage.toLocaleString("en-GB")} mi` : ""}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowHistory((s) => !s)}
          aria-expanded={showHistory}
          aria-label={`Service history for ${vehicle.registration}`}
          className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-[#1E3A5F] dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <History className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${vehicle.registration}`}
          className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-slate-50 hover:text-[#1E3A5F] dark:text-slate-500 dark:hover:bg-white/5 dark:hover:text-white"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={onDelete}
          aria-label={`Delete ${vehicle.registration}`}
          className="flex h-10 w-10 flex-shrink-0 cursor-pointer items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-700 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {(motDue || serviceDue) && (
        <div className="mt-3 flex flex-wrap gap-2">
          {motDue && <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-700 dark:bg-red-500/20 dark:text-red-400">MOT due {formatDateShort(vehicle.motDueDate!)}</span>}
          {serviceDue && <span className="rounded-full bg-orange-100 px-2 py-1 text-xs font-semibold text-orange-700 dark:bg-orange-500/20 dark:text-orange-400">Service due {formatDateShort(vehicle.serviceDueDate!)}</span>}
        </div>
      )}
      {showHistory && <VehicleHistory vehicleId={vehicle.id} />}
    </Panel>
  )
}

export function OwnerVehiclesPage() {
  const { data, loading, error, reload } = useApi<{ vehicles: OwnerVehicle[] }>("/api/vehicles")
  const [adding, setAdding] = useState(false)
  const [editing, setEditing] = useState<OwnerVehicle | null>(null)
  const [deleting, setDeleting] = useState<OwnerVehicle | null>(null)
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deleteError, setDeleteError] = useState("")

  async function confirmDelete() {
    if (!deleting) return
    setDeleteBusy(true)
    const res = await sendJson(`/api/vehicles/${deleting.id}`, "DELETE")
    setDeleteBusy(false)
    if (!res.ok) return setDeleteError(res.error ?? "Could not delete this vehicle")
    setDeleting(null)
    reload()
  }
  const vehicles = data?.vehicles ?? []

  return (
    <>
      <PageHeader
        title="My vehicles"
        description="Keep your cars here to get quotes faster and never miss an MOT."
        actions={
          <Button variant="primary" className="gap-2" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add vehicle
          </Button>
        }
      />
      {error && !data && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {loading && !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : vehicles.length === 0 ? (
        <Panel>
          <EmptyState icon={Car} title="No vehicles yet" description="Add a vehicle to start requesting quotes." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {vehicles.map((v) => (
            <VehicleCard
              key={v.id}
              vehicle={v}
              onEdit={() => setEditing(v)}
              onDelete={() => {
                setDeleteError("")
                setDeleting(v)
              }}
            />
          ))}
        </div>
      )}
      <AddVehicleDialog
        open={adding}
        onOpenChange={setAdding}
        onAdded={() => {
          setAdding(false)
          reload()
        }}
      />
      {editing && (
        <AddVehicleDialog
          key={editing.id}
          vehicle={editing}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          onAdded={() => {
            setEditing(null)
            reload()
          }}
        />
      )}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.registration ?? "vehicle"}?`}
        description={deleteError || "This removes the vehicle and its reminders. Vehicles with quotes or bookings can't be deleted."}
        confirmLabel="Delete vehicle"
        destructive
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />
    </>
  )
}
