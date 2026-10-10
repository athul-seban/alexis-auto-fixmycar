"use client"

import { useRef, useState } from "react"
import { Download, FileText, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, NativeSelect } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { DOCUMENT_KIND_LABELS, DOCUMENT_KINDS, MAX_DOCUMENT_BYTES } from "@/lib/garage-documents-shared"
import { formatLondonDate } from "@/lib/portal/tz"
import { Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"

interface DocRow {
  id: string
  kind: keyof typeof DOCUMENT_KIND_LABELS
  name: string
  status: "PENDING" | "APPROVED" | "REJECTED"
  note: string | null
  createdAt: string
}

/** Upload insurance / trade certificates for an admin to check before the garage gets its Verified badge. */
export function DocumentsCard() {
  const { toast } = useToast()
  const { data, error, reload } = useApi<{ documents: DocRow[]; uploadsAvailable: boolean }>("/api/garage/documents")
  const fileRef = useRef<HTMLInputElement>(null)
  const [kind, setKind] = useState<string>("INSURANCE")
  const [busy, setBusy] = useState(false)
  const [formError, setFormError] = useState("")

  async function upload(e: React.FormEvent) {
    e.preventDefault()
    const file = fileRef.current?.files?.[0]
    if (!file) return setFormError("Choose a file first")
    if (file.size > MAX_DOCUMENT_BYTES) return setFormError("Files can be at most 8MB")
    setBusy(true)
    setFormError("")
    const body = new FormData()
    body.set("file", file)
    body.set("kind", kind)
    try {
      const res = await fetch("/api/garage/documents", { method: "POST", body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return setFormError(json.error ?? "Couldn't upload that file")
      toast("Document uploaded — we'll review it")
      if (fileRef.current) fileRef.current.value = ""
      reload()
    } finally {
      setBusy(false)
    }
  }

  async function remove(id: string) {
    const res = await sendJson(`/api/garage/documents?id=${encodeURIComponent(id)}`, "DELETE")
    if (!res.ok) return toast(res.error ?? "Couldn't delete the document", "error")
    toast("Document deleted")
    reload()
  }

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Verification documents</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Upload your insurance and any trade accreditation. Our team checks them before awarding the Verified badge. Only you and our moderators can see these files.
      </p>

      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          {data.documents.length > 0 && (
            <ul className="mb-5 divide-y divide-slate-100 dark:divide-white/10" aria-label="Your documents">
              {data.documents.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex min-w-0 items-start gap-3">
                    <FileText className="mt-0.5 h-5 w-5 flex-shrink-0 text-slate-400" aria-hidden />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{DOCUMENT_KIND_LABELS[d.kind] ?? d.kind}</p>
                      <p className="truncate text-xs text-slate-500 dark:text-slate-400">{d.name} · {formatLondonDate(d.createdAt)}</p>
                      {d.status === "REJECTED" && d.note && <p className="mt-1 text-xs font-medium text-red-700 dark:text-red-400">Rejected: {d.note}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={d.status} />
                    <a href={`/api/garage/documents/${d.id}/file`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10" aria-label={`Download ${d.name}`}>
                      <Download className="h-4 w-4" />
                    </a>
                    <button type="button" onClick={() => remove(d.id)} className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10" aria-label={`Delete ${d.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {data.uploadsAvailable ? (
            <form onSubmit={upload} className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
              <div>
                <FieldLabel htmlFor="doc-kind">Document type</FieldLabel>
                <NativeSelect id="doc-kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                  {DOCUMENT_KINDS.map((k) => (
                    <option key={k} value={k}>{DOCUMENT_KIND_LABELS[k]}</option>
                  ))}
                </NativeSelect>
              </div>
              <div>
                <FieldLabel htmlFor="doc-file">File (PDF or image, up to 8MB)</FieldLabel>
                <input id="doc-file" ref={fileRef} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="block w-full text-sm text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-semibold dark:text-slate-300 dark:file:bg-slate-700" />
              </div>
              <Button type="submit" loading={busy} className="gap-1.5">
                <Upload className="h-4 w-4" aria-hidden /> Upload
              </Button>
              <div className="sm:col-span-3"><FieldError>{formError}</FieldError></div>
            </form>
          ) : (
            <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">Document uploads aren&apos;t switched on for the platform yet.</p>
          )}
        </>
      )}
    </Panel>
  )
}
