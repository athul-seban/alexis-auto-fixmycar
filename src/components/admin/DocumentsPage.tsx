"use client"

import { useEffect, useRef, useState } from "react"
import { Check, Download, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import type { DataColumn } from "@/components/ui/data-table"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { timeAgo } from "@/lib/utils"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ResourceList } from "@/components/admin/ResourceList"

interface AdminDocument {
  id: string
  kind: string
  kindLabel: string
  name: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  note: string | null
  createdAt: string
  garage: { id: string; name: string; city: string; isVerified: boolean }
}

const muted = "text-slate-500 dark:text-slate-400"

/** Review the paperwork garages upload. Approving or rejecting tells the garage; a rejection must say why. */
export function AdminDocumentsPage() {
  const { toast } = useToast()
  const [rejecting, setRejecting] = useState<AdminDocument | null>(null)
  const [note, setNote] = useState("")
  const [busy, setBusy] = useState<string | null>(null)
  // The list owns its reload; the row buttons live in the column definitions, so the children render hands it over.
  const reloadRef = useRef<() => void>(() => {})

  async function decide(doc: AdminDocument, decision: "APPROVE" | "REJECT") {
    setBusy(doc.id)
    const res = await sendJson("/api/admin/documents", "PATCH", { documentId: doc.id, decision, note: decision === "REJECT" ? note.trim() : undefined })
    setBusy(null)
    if (!res.ok) return toast(res.error ?? "Couldn't record the decision", "error")
    toast(decision === "APPROVE" ? "Document approved" : "Document rejected")
    setRejecting(null)
    setNote("")
    reloadRef.current()
  }

  return (
    <ResourceList<AdminDocument>
      title="Verification documents"
      description="Insurance and accreditation garages have uploaded. Check them before awarding a Verified badge."
      caption="Garage documents"
      endpoint="/api/admin/documents"
      itemsKey="documents"
      columns={[
        { id: "garage", header: "Garage", mobile: "title", className: "font-medium text-slate-900 dark:text-white", cell: (d) => `${d.garage.name} (${d.garage.city})` },
        { id: "kind", header: "Document", cell: (d) => d.kindLabel },
        { id: "file", header: "File", className: muted, cell: (d) => d.name },
        { id: "when", header: "Uploaded", className: muted, cell: (d) => timeAgo(d.createdAt) },
        { id: "status", header: "Status", mobile: "badge", cell: (d) => <StatusPill status={d.status} /> },
        {
          id: "actions",
          header: "",
          mobile: "actions",
          cell: (d) => (
            <span className="flex flex-wrap gap-2">
              <a
                href={`/api/admin/documents/${d.id}/file`}
                className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100"
                aria-label={`Download ${d.name}`}
              >
                <Download className="h-3.5 w-3.5" /> View
              </a>
              {d.status === "PENDING" && <ApproveRejectButtons doc={d} busy={busy === d.id} onReject={() => setRejecting(d)} decide={decide} />}
            </span>
          ),
        } satisfies DataColumn<AdminDocument>,
      ]}
      rowKey={(d) => d.id}
      tabs={{
        param: "status",
        defaultValue: "PENDING",
        allValue: "ALL",
        options: [
          { value: "PENDING", label: "Pending", countKey: "PENDING" },
          { value: "APPROVED", label: "Approved", countKey: "APPROVED" },
          { value: "REJECTED", label: "Rejected", countKey: "REJECTED" },
          { value: "ALL", label: "All", countKey: "ALL" },
        ],
      }}
      emptyTitle="Nothing to review"
      emptyDescription="Documents appear here when garages upload them."
    >
      {({ reload }) => (
        <>
        <BindReload reload={reload} targetRef={reloadRef} />
        <Dialog open={rejecting !== null} onOpenChange={(o) => !o && setRejecting(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Reject this document</DialogTitle>
              <DialogDescription>{rejecting?.garage.name} sees your reason, so say what to fix.</DialogDescription>
            </DialogHeader>
            <label htmlFor="reject-note" className="sr-only">Reason</label>
            <textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={3}
              placeholder="e.g. The policy has expired — please upload the current certificate."
              className="w-full rounded-lg border border-slate-300 p-2 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
            />
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setRejecting(null)}>Cancel</Button>
              <Button variant="destructive" disabled={!note.trim()} loading={busy === rejecting?.id} onClick={() => rejecting && decide(rejecting, "REJECT")}>
                Reject document
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        </>
      )}
    </ResourceList>
  )
}

function ApproveRejectButtons({
  doc,
  busy,
  onReject,
  decide,
}: {
  doc: AdminDocument
  busy: boolean
  onReject: () => void
  decide: (doc: AdminDocument, decision: "APPROVE" | "REJECT") => void
}) {
  return (
    <>
      <Button size="sm" variant="secondary" className="gap-1.5" loading={busy} onClick={() => decide(doc, "APPROVE")} aria-label={`Approve ${doc.name}`}>
        <Check className="h-3.5 w-3.5" /> Approve
      </Button>
      <Button size="sm" variant="secondary" className="gap-1.5 text-red-700 dark:text-red-400" onClick={onReject} aria-label={`Reject ${doc.name}`}>
        <X className="h-3.5 w-3.5" /> Reject
      </Button>
    </>
  )
}

/** Publishes the list's reload function into a ref (after render) so handlers outside the children render can call it. */
function BindReload({ reload, targetRef }: { reload: () => void; targetRef: { current: () => void } }) {
  useEffect(() => {
    targetRef.current = reload
  }, [reload, targetRef])
  return null
}
