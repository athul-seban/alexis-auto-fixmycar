"use client"

import { useState } from "react"
import Link from "next/link"
import { PoundSterling } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/ui/empty-state"
import { TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface ServicePricing {
  serviceType: string
  label: string
  offered: boolean
  priceFrom: number | null
  priceTo: number | null
  durationMins: number
  notes: string | null
  isActive: boolean
  configured: boolean
}

// Inputs are edited as strings so a half-typed number isn't clobbered.
interface Row {
  serviceType: string
  label: string
  from: string
  to: string
  duration: string
  notes: string
  isActive: boolean
}

const toRow = (s: ServicePricing): Row => ({
  serviceType: s.serviceType,
  label: s.label,
  from: s.priceFrom?.toString() ?? "",
  to: s.priceTo?.toString() ?? "",
  duration: String(s.durationMins),
  notes: s.notes ?? "",
  isActive: s.isActive,
})

function rowError(r: Row): string | null {
  const from = r.from === "" ? null : Number(r.from)
  const to = r.to === "" ? null : Number(r.to)
  if ((from !== null && !(from >= 0)) || (to !== null && !(to >= 0))) return "Prices must be positive numbers"
  if (from !== null && to !== null && to < from) return "“Up to” can't be lower than “from”"
  const d = Number(r.duration)
  if (!Number.isInteger(d) || d < 15 || d > 960) return "Duration must be 15–960 minutes"
  return null
}

export function PricingPage() {
  const { data, error, reload } = useApi<{ services: ServicePricing[] }>("/api/garage/pricing")

  return (
    <>
      <PageHeader
        title="Pricing"
        description="The prices and job lengths for each service. They prefill new bookings and your booking widget, and customers see them on your listing."
      />
      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-600 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <PricingForm key={JSON.stringify(data.services.map((s) => [s.serviceType, s.priceFrom, s.priceTo, s.durationMins, s.isActive, s.notes]))} services={data.services} onSaved={reload} />
      )}
    </>
  )
}

function PricingForm({ services, onSaved }: { services: ServicePricing[]; onSaved: () => void }) {
  const { toast } = useToast()
  const offered = services.filter((s) => s.offered)
  const notOffered = services.filter((s) => !s.offered)
  const [baseline] = useState(() => offered.map(toRow))
  const [rows, setRows] = useState(baseline)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const dirty = JSON.stringify(rows) !== JSON.stringify(baseline)
  const update = (serviceType: string, patch: Partial<Row>) =>
    setRows((rs) => rs.map((r) => (r.serviceType === serviceType ? { ...r, ...patch } : r)))

  const save = async () => {
    const bad = rows.map((r) => ({ r, e: rowError(r) })).find((x) => x.e)
    if (bad) return setError(`${bad.r.label}: ${bad.e}`)
    setError(null)
    setSaving(true)
    const res = await sendJson("/api/garage/pricing", "PUT", {
      prices: rows.map((r) => ({
        serviceType: r.serviceType,
        priceFrom: r.from === "" ? null : Number(r.from),
        priceTo: r.to === "" ? null : Number(r.to),
        durationMins: Number(r.duration),
        notes: r.notes.trim() || null,
        isActive: r.isActive,
      })),
    })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save your prices")
    toast("Prices saved")
    onSaved()
  }

  if (offered.length === 0) {
    return (
      <Panel>
        <EmptyState
          icon={PoundSterling}
          title="No services yet"
          description="Choose the services you offer on your Profile, then set their prices here."
          action={<Button asChild variant="primary" size="sm"><Link href="/garage-dashboard/profile">Go to Profile</Link></Button>}
        />
      </Panel>
    )
  }

  return (
    <div className="pb-24">
      {/* Phones: one stacked card per service (a 6-column editor table does not fit). */}
      <ul className="space-y-3 md:hidden">
        {rows.map((r) => {
          const err = rowError(r)
          return (
            <li key={r.serviceType} className={`rounded-xl border border-gray-200 bg-white p-4 dark:border-white/10 dark:bg-slate-800 ${r.isActive ? "" : "opacity-60"}`}>
              <div className="mb-3 flex items-center justify-between gap-3">
                <span className="font-semibold text-slate-900 dark:text-white">{r.label}</span>
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  Offered
                  <Switch checked={r.isActive} onCheckedChange={(v) => update(r.serviceType, { isActive: v })} aria-label={`${r.label} offered for booking`} />
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="text-xs text-slate-500 dark:text-slate-400">From (£)<TextInput type="number" inputMode="decimal" min={0} step="0.01" className="mt-1" value={r.from} onChange={(e) => update(r.serviceType, { from: e.target.value })} aria-invalid={!!err} /></label>
                <label className="text-xs text-slate-500 dark:text-slate-400">Up to (£)<TextInput type="number" inputMode="decimal" min={0} step="0.01" className="mt-1" value={r.to} onChange={(e) => update(r.serviceType, { to: e.target.value })} aria-invalid={!!err} /></label>
                <label className="text-xs text-slate-500 dark:text-slate-400">Minutes<TextInput type="number" inputMode="numeric" min={15} max={960} step={15} className="mt-1" value={r.duration} onChange={(e) => update(r.serviceType, { duration: e.target.value })} /></label>
              </div>
              <label className="mt-2 block text-xs text-slate-500 dark:text-slate-400">Notes<TextInput className="mt-1" maxLength={300} placeholder="e.g. Class 4 vehicles" value={r.notes} onChange={(e) => update(r.serviceType, { notes: e.target.value })} /></label>
            </li>
          )
        })}
      </ul>

      <Panel className="hidden overflow-hidden md:block">
        <Table>
          <TableHeader>
            <TableRow className="border-t-0">
              <TableHead>Service</TableHead>
              <TableHead>Price from (£)</TableHead>
              <TableHead>Up to (£)</TableHead>
              <TableHead>Duration (min)</TableHead>
              <TableHead>Notes</TableHead>
              <TableHead>Offered</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => {
              const err = rowError(r)
              return (
                <TableRow key={r.serviceType} className={r.isActive ? "" : "opacity-60"}>
                  <TableCell className="font-semibold text-slate-900 dark:text-white">{r.label}</TableCell>
                  <TableCell><TextInput aria-label={`${r.label} price from`} type="number" min={0} step="0.01" className="w-28" value={r.from} onChange={(e) => update(r.serviceType, { from: e.target.value })} aria-invalid={!!err} /></TableCell>
                  <TableCell><TextInput aria-label={`${r.label} price up to`} type="number" min={0} step="0.01" className="w-28" value={r.to} onChange={(e) => update(r.serviceType, { to: e.target.value })} aria-invalid={!!err} /></TableCell>
                  <TableCell><TextInput aria-label={`${r.label} duration in minutes`} type="number" min={15} max={960} step={15} className="w-24" value={r.duration} onChange={(e) => update(r.serviceType, { duration: e.target.value })} /></TableCell>
                  <TableCell><TextInput aria-label={`${r.label} notes`} className="min-w-52" maxLength={300} placeholder="e.g. Class 4 vehicles" value={r.notes} onChange={(e) => update(r.serviceType, { notes: e.target.value })} /></TableCell>
                  <TableCell><Switch checked={r.isActive} onCheckedChange={(v) => update(r.serviceType, { isActive: v })} aria-label={`${r.label} offered for booking`} /></TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Panel>

      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Leave “Up to” blank to show “from £x”, or leave both blank to show no price. Turn a service off to hide it from the booking widget without removing it from your listing.
      </p>

      {notOffered.length > 0 && (
        <p className="mt-4 text-sm text-slate-500 dark:text-slate-400">
          Not offered: {notOffered.map((s) => s.label).join(", ")}.{" "}
          <Link href="/garage-dashboard/profile" className="font-semibold text-[#1E3A5F] hover:underline dark:text-blue-300">Add services on your Profile</Link>
        </p>
      )}

      <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur transition-transform dark:border-white/10 dark:bg-slate-900/95 lg:left-64 ${dirty || error ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className={`flex-1 text-sm ${error ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`} role={error ? "alert" : undefined}>
            {error ?? "You have unsaved changes."}
          </p>
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setRows(baseline); setError(null) }}>Discard</Button>
          <Button type="button" variant="primary" size="sm" loading={saving} onClick={save}>Save prices</Button>
        </div>
      </div>
    </div>
  )
}
