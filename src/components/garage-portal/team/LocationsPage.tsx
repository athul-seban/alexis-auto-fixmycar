"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Building2, Plus } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { EmptyState } from "@/components/ui/empty-state"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { setActiveLocationId } from "@/lib/org/active-location-client"
import { SERVICE_TYPES } from "@/lib/constants"
import { cn, getServiceLabel } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { usePortalAccess } from "@/components/portal-shell/access-context"

interface Row {
  id: string
  name: string
  slug: string
  city: string
  postcode: string
  status: string
  isVerified: boolean
  isPrimary: boolean
  upcomingBookings: number
  staffCount: number
}

export function LocationsPage() {
  const { toast } = useToast()
  const router = useRouter()
  const { activeLocationId } = usePortalAccess()
  const { data, error, reload } = useApi<{ locations: Row[]; limit: number }>("/api/garage/locations")
  const [adding, setAdding] = useState(false)
  const [confirm, setConfirm] = useState<Row | null>(null)
  const [busy, setBusy] = useState(false)

  const change = async (row: Row, action: "archive" | "restore") => {
    setBusy(true)
    const res = await sendJson(`/api/garage/locations/${row.id}`, "PATCH", { action })
    setBusy(false)
    setConfirm(null)
    if (!res.ok) return toast(res.error ?? "That didn't work", "error")
    toast(action === "archive" ? `${row.name} archived` : `${row.name} restored`)
    reload()
    router.refresh() // the switcher and banners follow the new status
  }

  const open = async (row: Row) => {
    const res = await sendJson("/api/garage/location", "POST", { locationId: row.id })
    if (!res.ok) return toast(res.error ?? "Couldn't open that location", "error")
    setActiveLocationId(row.id)
    router.push("/garage-dashboard/profile")
    router.refresh()
  }

  const working = data?.locations.filter((l) => l.status !== "ARCHIVED").length ?? 0

  return (
    <>
      <PageHeader
        title="Locations"
        description="Each location has its own listing, diary, prices and team. Customers find them separately, and one enquiry reaches your business once."
        actions={
          <Button variant="primary" className="gap-1.5" onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" /> Add a location
          </Button>
        }
      />

      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !data ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full rounded-xl" />
          <Skeleton className="h-24 w-full rounded-xl" />
        </div>
      ) : data.locations.length === 0 ? (
        <EmptyState icon={Building2} title="No locations" description="Add your first location." />
      ) : (
        <ul className="space-y-3">
          {data.locations.map((l) => (
            <li key={l.id}>
              <Panel className={cn("p-4", l.status === "ARCHIVED" && "opacity-75")}>
                <div className="flex flex-wrap items-start gap-3">
                  <Building2 aria-hidden className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400" />
                  <div className="min-w-[12rem] flex-1">
                    <p className="flex flex-wrap items-center gap-2 font-semibold text-slate-900 dark:text-white">
                      {l.name}
                      <StatusPill status={l.status} />
                      {l.isPrimary && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">First location</span>}
                      {l.id === activeLocationId && <span className="rounded-full bg-blue-100 px-2 py-0.5 text-[11px] font-semibold text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">You&apos;re here</span>}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {l.city}, {l.postcode}
                    </p>
                    <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                      {l.upcomingBookings} upcoming {l.upcomingBookings === 1 ? "booking" : "bookings"} · {l.staffCount} {l.staffCount === 1 ? "person" : "people"}
                      {l.status === "PENDING" && " · waiting for approval before it appears to customers"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {l.id !== activeLocationId && l.status !== "ARCHIVED" && (
                      <Button size="sm" variant="secondary" onClick={() => open(l)}>
                        Open
                      </Button>
                    )}
                    {l.status === "ARCHIVED" ? (
                      <Button size="sm" variant="secondary" disabled={busy} onClick={() => change(l, "restore")}>
                        Restore
                      </Button>
                    ) : l.status !== "SUSPENDED" ? (
                      <Button size="sm" variant="secondary" className="text-red-700 dark:text-red-400" disabled={busy || working <= 1} title={working <= 1 ? "Your business needs at least one active location" : undefined} onClick={() => setConfirm(l)}>
                        Archive
                      </Button>
                    ) : null}
                  </div>
                </div>
              </Panel>
            </li>
          ))}
        </ul>
      )}

      <AddLocationDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdded={() => {
          setAdding(false)
          reload()
          router.refresh()
        }}
      />

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        loading={busy}
        title={`Archive ${confirm?.name}?`}
        description={
          confirm && confirm.upcomingBookings > 0
            ? `${confirm.name} has ${confirm.upcomingBookings} upcoming ${confirm.upcomingBookings === 1 ? "booking" : "bookings"}. Move or cancel ${confirm.upcomingBookings === 1 ? "it" : "them"} first, then archive.`
            : "It comes off the marketplace and becomes read-only. Its bookings, customers and invoices are kept, and you can restore it any time."
        }
        confirmLabel="Archive"
        onConfirm={() => confirm && change(confirm, "archive")}
      />
    </>
  )
}

function AddLocationDialog({ open, onClose, onAdded }: { open: boolean; onClose: () => void; onAdded: () => void }) {
  const { toast } = useToast()
  const blank = { name: "", phone: "", email: "", address: "", city: "", postcode: "" }
  const [f, setF] = useState(blank)
  const [services, setServices] = useState<string[]>(["MOT", "FULL_SERVICE"])
  const [error, setError] = useState("")
  const [saving, setSaving] = useState(false)
  const [wasOpen, setWasOpen] = useState(false)
  if (open && !wasOpen) {
    setWasOpen(true)
    setF(blank)
    setServices(["MOT", "FULL_SERVICE"])
    setError("")
  }
  if (!open && wasOpen) setWasOpen(false)

  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (services.length === 0) return setError("Choose at least one service.")
    setSaving(true)
    setError("")
    const res = await sendJson("/api/garage/locations", "POST", { ...f, services })
    setSaving(false)
    if (!res.ok) {
      const first = (res.data as { details?: { message?: string }[] } | null)?.details?.[0]?.message
      return setError(first ?? res.error ?? "Couldn't add the location")
    }
    toast("Location added. It will appear to customers once it's approved.")
    onAdded()
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Add a location</DialogTitle>
            <DialogDescription>New locations are checked before they appear to customers. You can set up its prices, hours and team in the meantime.</DialogDescription>
          </DialogHeader>
          <div className="my-4 space-y-3">
            <div>
              <FieldLabel htmlFor="loc-name">Name *</FieldLabel>
              <TextInput id="loc-name" value={f.name} onChange={set("name")} maxLength={100} autoFocus placeholder="e.g. Acme Motors — York" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="loc-phone">Phone *</FieldLabel>
                <TextInput id="loc-phone" type="tel" value={f.phone} onChange={set("phone")} />
              </div>
              <div>
                <FieldLabel htmlFor="loc-email">Email *</FieldLabel>
                <TextInput id="loc-email" type="email" value={f.email} onChange={set("email")} />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="loc-address">Street address *</FieldLabel>
              <TextInput id="loc-address" value={f.address} onChange={set("address")} maxLength={200} />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="loc-city">Town or city *</FieldLabel>
                <TextInput id="loc-city" value={f.city} onChange={set("city")} maxLength={80} />
              </div>
              <div>
                <FieldLabel htmlFor="loc-postcode">Postcode *</FieldLabel>
                <TextInput id="loc-postcode" value={f.postcode} onChange={set("postcode")} maxLength={10} autoCapitalize="characters" />
              </div>
            </div>
            <fieldset>
              <legend className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Services *</legend>
              <ul className="grid gap-x-4 sm:grid-cols-2">
                {SERVICE_TYPES.map((s) => (
                  <li key={s}>
                    <label className="flex min-h-9 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[#1E3A5F]"
                        checked={services.includes(s)}
                        onChange={(e) => setServices((cur) => (e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)))}
                      />
                      {getServiceLabel(s)}
                    </label>
                  </li>
                ))}
              </ul>
            </fieldset>
            <FieldError>{error}</FieldError>
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" loading={saving}>Add location</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
