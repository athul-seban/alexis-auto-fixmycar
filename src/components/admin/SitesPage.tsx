"use client"

import { useState } from "react"
import { ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DataColumn } from "@/components/ui/data-table"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { cn, formatDate } from "@/lib/utils"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ResourceList } from "@/components/admin/ResourceList"

interface AdminSite {
  id: string
  organisationId: string
  businessName: string
  status: string
  label: string | null
  url: string | null
  submittedAt: string | null
  publishedAt: string | null
  disabled: boolean
  disabledReason: string | null
  rejectionReason: string | null
  locations: number
  liveLocations: number
  ownerEmail: string | null
  headline: string
}

const muted = "text-slate-500 dark:text-slate-400"

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5 text-sm">
      <dt className={muted}>{label}</dt>
      <dd className="min-w-0 break-words text-right font-medium text-slate-900 dark:text-white">{children}</dd>
    </div>
  )
}

type Ask = { action: "reject" | "disable" } | null

function SiteDialog({ site, onClose, onChanged }: { site: AdminSite | null; onClose: () => void; onChanged: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState(false)
  const [ask, setAsk] = useState<Ask>(null)
  const [reason, setReason] = useState("")
  const [error, setError] = useState("")

  const run = async (body: object, done: string) => {
    if (!site) return
    setBusy(true)
    const res = await sendJson("/api/admin/sites", "POST", { siteId: site.id, ...body })
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? "Something went wrong")
      return toast(res.error ?? "Something went wrong", "error")
    }
    toast(done)
    setAsk(null)
    setReason("")
    setError("")
    onClose()
    onChanged()
  }

  const submitReason = () => {
    if (reason.trim().length < 3) return setError("Give a reason (a few words at least).")
    void run({ action: ask!.action, reason: reason.trim() }, ask!.action === "reject" ? "Sent back to the business" : "Website switched off")
  }

  return (
    <>
      <Dialog open={site !== null && ask === null} onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="max-w-xl">
          {site && (
            <>
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2">
                  {site.businessName} <StatusPill status={site.status} />
                  {site.disabled ? <StatusPill status="SUSPENDED" /> : null}
                </DialogTitle>
                <DialogDescription>{site.submittedAt ? `Sent for review ${formatDate(site.submittedAt)}` : "Not submitted"}</DialogDescription>
              </DialogHeader>
              <dl className="mb-4 divide-y divide-slate-100 dark:divide-white/10">
                <Row label="Address">{site.url ? <a href={site.url} target="_blank" rel="noopener noreferrer" className="underline-offset-2 hover:underline">{site.label}</a> : (site.label ?? "None chosen")}</Row>
                <Row label="Headline">{site.headline || "—"}</Row>
                <Row label="Locations">{site.liveLocations} live of {site.locations}</Row>
                <Row label="Owner">{site.ownerEmail ?? "—"}</Row>
                {site.publishedAt ? <Row label="Published">{formatDate(site.publishedAt)}</Row> : null}
                {site.rejectionReason ? <Row label="Sent back for">{site.rejectionReason}</Row> : null}
                {site.disabled ? <Row label="Switched off for">{site.disabledReason ?? "—"}</Row> : null}
              </dl>
              {site.status === "PENDING_REVIEW" ? <p className={cn("mb-2 text-sm", muted)}>Check the draft before you approve it: it must be accurate, lawful and not misleading.</p> : null}
              <DialogFooter className="flex-wrap">
                <Button asChild variant="secondary" className="gap-1.5 sm:mr-auto">
                  <a href={`/site-preview/${site.id}`} target="_blank" rel="noopener noreferrer">
                    Preview draft <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </Button>
                {site.status === "PENDING_REVIEW" ? (
                  <>
                    <Button variant="secondary" className="text-red-700 dark:text-red-400" onClick={() => { setReason(""); setError(""); setAsk({ action: "reject" }) }}>Send back</Button>
                    <Button variant="primary" onClick={() => run({ action: "approve" }, "Approved and published")} loading={busy}>Approve and publish</Button>
                  </>
                ) : null}
                {site.disabled ? (
                  <Button variant="primary" onClick={() => run({ action: "enable" }, "Website switched back on")} loading={busy}>Switch back on</Button>
                ) : (
                  <Button variant="destructive" onClick={() => { setReason(""); setError(""); setAsk({ action: "disable" }) }}>Switch off</Button>
                )}
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={ask !== null} onOpenChange={(o) => !o && setAsk(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{ask?.action === "reject" ? "Send it back" : "Switch the website off"}</DialogTitle>
            <DialogDescription>{ask?.action === "reject" ? "Tell them what to change. They'll see this and can send it again." : "It goes offline at once. They'll be told why."}</DialogDescription>
          </DialogHeader>
          <div className="my-3">
            <FieldLabel htmlFor="site-reason">Reason *</FieldLabel>
            <TextInput id="site-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} autoFocus />
            <FieldError>{error}</FieldError>
          </div>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setAsk(null)} disabled={busy}>Cancel</Button>
            <Button variant={ask?.action === "disable" ? "destructive" : "primary"} onClick={submitReason} loading={busy}>{ask?.action === "reject" ? "Send back" : "Switch off"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function AdminSitesPage() {
  const [open, setOpen] = useState<AdminSite | null>(null)

  const columns: DataColumn<AdminSite>[] = [
    {
      id: "business",
      header: "Business",
      mobile: "title",
      cell: (s) => (
        <span>
          <span className="font-medium text-slate-900 dark:text-white">{s.businessName}</span>
          <span className={cn("block text-xs font-normal", muted)}>{s.label ?? "No address yet"} · {s.ownerEmail ?? "no owner"}</span>
        </span>
      ),
    },
    { id: "locations", header: "Locations", className: muted, cell: (s) => `${s.liveLocations} live of ${s.locations}` },
    { id: "submitted", header: "Sent", className: muted, mobile: "hidden", cell: (s) => (s.submittedAt ? formatDate(s.submittedAt) : "—") },
    { id: "status", header: "Status", mobile: "badge", cell: (s) => (s.disabled ? <StatusPill status="SUSPENDED" /> : <StatusPill status={s.status} />) },
  ]

  return (
    <ResourceList<AdminSite>
      title="Websites"
      description="Approve each business's first website before it goes live, and switch any website off if it breaks the rules. Later edits publish without review."
      caption="Websites"
      endpoint="/api/admin/sites"
      itemsKey="sites"
      columns={columns}
      rowKey={(s) => s.id}
      tabs={{
        param: "status",
        defaultValue: "PENDING_REVIEW",
        options: [
          { value: "PENDING_REVIEW", label: "Waiting for review", countKey: "PENDING_REVIEW" },
          { value: "PUBLISHED", label: "Live", countKey: "PUBLISHED" },
          { value: "REJECTED", label: "Sent back", countKey: "REJECTED" },
          { value: "UNPUBLISHED", label: "Offline", countKey: "UNPUBLISHED" },
          { value: "DRAFT", label: "Drafts", countKey: "DRAFT" },
        ],
      }}
      searchPlaceholder="Search business or address…"
      onRowClick={setOpen}
      rowLabel={(s) => `Review ${s.businessName}`}
      emptyTitle="No websites here"
      emptyDescription="Websites appear in this list when a business sends one for review."
    >
      {({ reload }) => <SiteDialog site={open} onClose={() => setOpen(null)} onChanged={reload} />}
    </ResourceList>
  )
}
