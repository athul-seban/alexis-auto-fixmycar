"use client"

import { useState } from "react"
import Link from "next/link"
import { Check, ExternalLink, Minus, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import type { DataColumn } from "@/components/ui/data-table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { cn, formatDate } from "@/lib/utils"
import type { Readiness } from "@/lib/portal/readiness"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ResourceList } from "@/components/admin/ResourceList"

interface AdminGarage {
  id: string
  name: string
  slug: string
  city: string
  postcode: string
  email: string
  phone: string
  status: string
  isVerified: boolean
  badges: string[]
  averageRating: number
  totalReviews: number
  totalBookings: number
  widgetEnabled: boolean
  createdAt: string
  owner: { name: string | null; email: string; phone: string | null }
  readiness: Readiness
}

const BADGES = [
  { value: "ID_VERIFIED", label: "ID verified" },
  { value: "INSURANCE_VERIFIED", label: "Insurance verified" },
  { value: "QUALIFICATIONS_VERIFIED", label: "Qualifications verified" },
]

const muted = "text-slate-500 dark:text-slate-400"

function ReadinessSummary({ r }: { r: Readiness }) {
  const done = r.checks.filter((c) => c.ok).length
  return (
    <span className={cn("whitespace-nowrap text-xs font-semibold", r.ready ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400")}>
      {done}/{r.checks.length} complete
    </span>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className={muted}>{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-900 dark:text-white">{children}</dd>
    </div>
  )
}

type Pending = { action: "approve" | "reject" | "suspend"; force?: boolean } | null

function GarageDialog({ garage, onClose, onChanged }: { garage: AdminGarage | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [badges, setBadges] = useState<string[]>([])
  const [loadedId, setLoadedId] = useState<string | null>(null)
  const [confirm, setConfirm] = useState<Pending>(null)
  const [overrideMissing, setOverrideMissing] = useState<string[] | null>(null)

  // Reset the editable badge state each time a different garage is opened.
  if (garage && garage.id !== loadedId) {
    setLoadedId(garage.id)
    setBadges(garage.badges)
  }

  async function run(action: "approve" | "reject" | "suspend", force = false) {
    if (!garage) return
    setBusy(true)
    const res = await sendJson<{ missing?: string[]; code?: string }>("/api/admin/garages", "POST", { garageId: garage.id, action, force })
    setBusy(false)
    if (res.status === 409 && res.data?.code === "NOT_READY") {
      setOverrideMissing(res.data.missing ?? [])
      return
    }
    if (!res.ok) return toast(res.error ?? "Something went wrong", "error")
    toast(action === "approve" ? "Garage approved" : "Garage suspended")
    setConfirm(null)
    setOverrideMissing(null)
    onClose()
    onChanged()
  }

  async function saveBadges() {
    if (!garage) return
    setBusy(true)
    const res = await sendJson("/api/admin/garages", "PATCH", { garageId: garage.id, badges })
    setBusy(false)
    if (!res.ok) return toast(res.error ?? "Couldn't save badges", "error")
    toast("Badges saved")
    onClose()
    onChanged()
  }

  const g = garage
  const badgesChanged = g ? [...badges].sort().join() !== [...g.badges].sort().join() : false

  return (
    <>
      <Dialog open={g !== null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          {g && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {g.name} <StatusPill status={g.status} />
                </DialogTitle>
                <DialogDescription>
                  {g.city}, {g.postcode} · registered {formatDate(g.createdAt)}
                </DialogDescription>
              </DialogHeader>

              <section aria-labelledby="readiness-h" className="mb-5">
                <h3 id="readiness-h" className="mb-2 text-sm font-bold text-slate-900 dark:text-white">
                  Profile readiness
                </h3>
                <ul className="space-y-1.5">
                  {g.readiness.checks.map((c) => (
                    <li key={c.key} className="flex items-center gap-2 text-sm">
                      {c.ok ? (
                        <Check className="h-4 w-4 flex-shrink-0 text-green-600 dark:text-green-400" aria-label="Done" />
                      ) : c.required ? (
                        <X className="h-4 w-4 flex-shrink-0 text-red-500" aria-label="Missing, required" />
                      ) : (
                        <Minus className="h-4 w-4 flex-shrink-0 text-slate-400" aria-label="Missing, optional" />
                      )}
                      <span className={cn(c.ok ? "text-slate-700 dark:text-slate-300" : "font-medium text-slate-900 dark:text-white")}>{c.label}</span>
                      {!c.required && !c.ok && <span className={cn("text-xs", muted)}>recommended</span>}
                    </li>
                  ))}
                </ul>
              </section>

              <dl className="mb-5 divide-y divide-slate-100 dark:divide-white/10">
                <Row label="Owner">{g.owner.name ?? g.owner.email}</Row>
                <Row label="Contact">
                  <a className="underline-offset-2 hover:underline" href={`mailto:${g.email}`}>{g.email}</a> · {g.phone}
                </Row>
                <Row label="Rating">{g.totalReviews ? `${g.averageRating.toFixed(1)} (${g.totalReviews})` : "No reviews yet"}</Row>
                <Row label="Bookings received">{g.totalBookings}</Row>
                <Row label="Booking widget">{g.widgetEnabled ? "Enabled" : "Off"}</Row>
              </dl>

              <fieldset className="mb-2">
                <legend className="mb-2 text-sm font-bold text-slate-900 dark:text-white">Verification badges</legend>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {BADGES.map((b) => (
                    <label key={b.value} className="flex min-h-10 cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        className="h-4 w-4 cursor-pointer accent-[#1E3A5F]"
                        checked={badges.includes(b.value)}
                        onChange={(e) => setBadges((cur) => (e.target.checked ? [...cur, b.value] : cur.filter((x) => x !== b.value)))}
                      />
                      {b.label}
                    </label>
                  ))}
                </div>
                {badgesChanged && (
                  <Button size="sm" variant="secondary" className="mt-2" onClick={saveBadges} loading={busy}>
                    Save badges
                  </Button>
                )}
              </fieldset>

              <DialogFooter className="mt-6 flex-wrap">
                {g.status === "APPROVED" && (
                  <Link href={`/garage/${g.slug}`} target="_blank" className="inline-flex h-10 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-[#1E3A5F] hover:underline dark:text-blue-300 sm:mr-auto">
                    View listing <ExternalLink className="h-3.5 w-3.5" />
                  </Link>
                )}
                {g.status === "APPROVED" ? (
                  <Button variant="destructive" onClick={() => setConfirm({ action: "suspend" })}>
                    Suspend
                  </Button>
                ) : (
                  <>
                    {g.status === "PENDING" && (
                      <Button variant="secondary" className="text-red-600 dark:text-red-400" onClick={() => setConfirm({ action: "reject" })}>
                        Reject
                      </Button>
                    )}
                    <Button variant="primary" onClick={() => run("approve")} loading={busy}>
                      {g.status === "SUSPENDED" ? "Reinstate" : "Approve"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        title={confirm?.action === "reject" ? "Reject this garage?" : "Suspend this garage?"}
        description="Its listing and booking widget go offline straight away and its portal becomes read-only. The garage is notified. You can reinstate it later."
        confirmLabel={confirm?.action === "reject" ? "Reject garage" : "Suspend garage"}
        destructive
        loading={busy}
        onConfirm={() => confirm && run(confirm.action)}
      />
      <ConfirmDialog
        open={overrideMissing !== null}
        onOpenChange={(o) => !o && setOverrideMissing(null)}
        title="Approve an incomplete profile?"
        description={`Still missing: ${overrideMissing?.join(", ")}. Customers would see a half-finished listing.`}
        confirmLabel="Approve anyway"
        loading={busy}
        onConfirm={() => run("approve", true)}
      />
    </>
  )
}

export function AdminGaragesPage() {
  const [open, setOpen] = useState<AdminGarage | null>(null)

  const columns: DataColumn<AdminGarage>[] = [
    {
      id: "name",
      header: "Garage",
      mobile: "title",
      cell: (g) => (
        <span>
          <span className="font-medium text-slate-900 dark:text-white">{g.name}</span>
          <span className={cn("block text-xs font-normal", muted)}>
            {g.city} · {g.owner.name ?? g.owner.email}
          </span>
        </span>
      ),
    },
    { id: "rating", header: "Rating", className: muted, cell: (g) => (g.totalReviews ? `${g.averageRating.toFixed(1)} ★ (${g.totalReviews})` : "—") },
    { id: "bookings", header: "Bookings", className: muted, cell: (g) => g.totalBookings },
    { id: "widget", header: "Widget", className: muted, cell: (g) => (g.widgetEnabled ? "On" : "Off") },
    { id: "ready", header: "Profile", cell: (g) => <ReadinessSummary r={g.readiness} /> },
    { id: "joined", header: "Registered", className: muted, mobile: "hidden", cell: (g) => formatDate(g.createdAt) },
    { id: "status", header: "Status", mobile: "badge", cell: (g) => <StatusPill status={g.status} /> },
  ]

  return (
    <ResourceList<AdminGarage>
      title="Garages"
      description="Approve new garages, check their profile is ready, and manage verification badges."
      caption="Garages"
      endpoint="/api/admin/garages"
      itemsKey="garages"
      columns={columns}
      rowKey={(g) => g.id}
      tabs={{
        param: "status",
        defaultValue: "PENDING",
        options: [
          { value: "PENDING", label: "Pending approval", countKey: "PENDING" },
          { value: "APPROVED", label: "Approved", countKey: "APPROVED" },
          { value: "SUSPENDED", label: "Suspended", countKey: "SUSPENDED" },
        ],
      }}
      searchPlaceholder="Search name, city or email…"
      onRowClick={setOpen}
      rowLabel={(g) => `Review ${g.name}`}
      emptyTitle="No garages here"
      emptyDescription="Garages appear in this list as they register."
    >
      {({ reload }) => <GarageDialog garage={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </ResourceList>
  )
}
