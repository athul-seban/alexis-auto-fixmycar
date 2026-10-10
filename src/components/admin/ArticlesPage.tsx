"use client"

import { useEffect, useRef, useState } from "react"
import { ExternalLink, Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson } from "@/hooks/use-api"
import { slugify } from "@/lib/articles"
import { timeAgo } from "@/lib/utils"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"
import { ResourceList } from "@/components/admin/ResourceList"

interface ArticleRow {
  id: string
  slug: string
  title: string
  excerpt: string | null
  status: "DRAFT" | "PUBLISHED"
  publishedAt: string | null
  updatedAt: string
}
interface FullArticle extends ArticleRow {
  body: string
  metaTitle: string | null
  metaDescription: string | null
}

const EMPTY = { title: "", slug: "", excerpt: "", body: "", metaTitle: "", metaDescription: "", status: "DRAFT" as "DRAFT" | "PUBLISHED" }

/** Write and publish the guides on /blog. */
export function AdminArticlesPage() {
  const { toast } = useToast()
  const [editing, setEditing] = useState<{ id: string | null } | null>(null)
  const [deleting, setDeleting] = useState<ArticleRow | null>(null)
  const [busy, setBusy] = useState(false)
  const reloadRef = useRef<() => void>(() => {})

  return (
    <ResourceList<ArticleRow>
      title="Guides & blog"
      description="Help articles and motoring guides shown at /blog. Published articles also go into the sitemap."
      caption="Articles"
      endpoint="/api/admin/articles"
      itemsKey="articles"
      actions={
        <Button className="gap-1.5" onClick={() => setEditing({ id: null })}>
          <Plus className="h-4 w-4" aria-hidden /> New article
        </Button>
      }
      columns={[
        { id: "title", header: "Title", mobile: "title", className: "max-w-md font-medium text-slate-900 dark:text-white", cell: (a) => <span className="line-clamp-2 whitespace-normal">{a.title}</span> },
        { id: "status", header: "Status", mobile: "badge", cell: (a) => <StatusPill status={a.status} /> },
        { id: "updated", header: "Updated", className: "text-slate-500 dark:text-slate-400", cell: (a) => timeAgo(a.updatedAt) },
        {
          id: "actions",
          header: "",
          mobile: "actions",
          cell: (a) => (
            <span className="flex gap-2">
              {a.status === "PUBLISHED" && (
                <a href={`/blog/${a.slug}`} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-slate-100 px-3 text-xs font-semibold text-slate-700 hover:bg-slate-200 dark:bg-slate-700 dark:text-slate-100" aria-label={`View ${a.title} on the site`}>
                  <ExternalLink className="h-3.5 w-3.5" /> View
                </a>
              )}
              <Button size="sm" variant="secondary" className="text-red-700 dark:text-red-400" onClick={() => setDeleting(a)} aria-label={`Delete ${a.title}`}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </span>
          ),
        },
      ]}
      rowKey={(a) => a.id}
      onRowClick={(a) => setEditing({ id: a.id })}
      rowLabel={(a) => `Edit ${a.title}`}
      tabs={{
        param: "status",
        defaultValue: "ALL",
        allValue: "ALL",
        options: [
          { value: "ALL", label: "All", countKey: "ALL" },
          { value: "PUBLISHED", label: "Published", countKey: "PUBLISHED" },
          { value: "DRAFT", label: "Drafts", countKey: "DRAFT" },
        ],
      }}
      searchPlaceholder="Search titles…"
      emptyTitle="No articles yet"
      emptyDescription="Write your first guide with “New article”."
    >
      {({ reload }) => (
        <>
          <BindReload reload={reload} targetRef={reloadRef} />
          <ArticleEditor
            target={editing}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null)
              reload()
            }}
          />
          <ConfirmDialog
            open={deleting !== null}
            onOpenChange={(o) => !o && setDeleting(null)}
            title="Delete this article?"
            description="It disappears from the site straight away and can't be recovered."
            confirmLabel="Delete article"
            destructive
            loading={busy}
            onConfirm={async () => {
              if (!deleting) return
              setBusy(true)
              const res = await sendJson(`/api/admin/articles/${deleting.id}`, "DELETE")
              setBusy(false)
              if (!res.ok) return toast(res.error ?? "Couldn't delete the article", "error")
              toast("Article deleted")
              setDeleting(null)
              reloadRef.current()
            }}
          />
        </>
      )}
    </ResourceList>
  )
}

function BindReload({ reload, targetRef }: { reload: () => void; targetRef: { current: () => void } }) {
  useEffect(() => {
    targetRef.current = reload
  }, [reload, targetRef])
  return null
}

function ArticleEditor({ target, onClose, onSaved }: { target: { id: string | null } | null; onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast()
  const [f, setF] = useState(EMPTY)
  const [slugTouched, setSlugTouched] = useState(false)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const id = target?.id ?? null

  useEffect(() => {
    // Opening the dialog resets or loads the form; this synchronises local form state with the chosen article.
    /* eslint-disable react-hooks/set-state-in-effect */
    setError("")
    setSlugTouched(false)
    if (!target) return
    if (!id) {
      setF(EMPTY)
      return
    }
    setLoading(true)
    const ctrl = new AbortController()
    fetch(`/api/admin/articles/${id}`, { signal: ctrl.signal })
      .then((r) => r.json())
      .then((d: { article?: FullArticle; error?: string }) => {
        if (!d.article) return setError(d.error ?? "Couldn't load the article")
        const a = d.article
        setF({ title: a.title, slug: a.slug, excerpt: a.excerpt ?? "", body: a.body, metaTitle: a.metaTitle ?? "", metaDescription: a.metaDescription ?? "", status: a.status })
        setSlugTouched(true)
      })
      .catch((err) => err?.name !== "AbortError" && setError("Couldn't load the article"))
      .finally(() => setLoading(false))
    return () => ctrl.abort()
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [target, id])

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) => setF((cur) => ({ ...cur, [key]: value }))

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError("")
    const res = await sendJson(id ? `/api/admin/articles/${id}` : "/api/admin/articles", id ? "PATCH" : "POST", f)
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save the article")
    toast(f.status === "PUBLISHED" ? "Article published" : "Draft saved")
    onSaved()
  }

  return (
    <Dialog open={target !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{id ? "Edit article" : "New article"}</DialogTitle>
          <DialogDescription>
            Formatting: <code>## Heading</code>, <code>- bullet</code>, <code>1. step</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link](https://…)</code>.
          </DialogDescription>
        </DialogHeader>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">Loading…</p>
        ) : (
          <form onSubmit={save} className="space-y-4">
            <div>
              <FieldLabel htmlFor="art-title">Title</FieldLabel>
              <TextInput
                id="art-title"
                value={f.title}
                maxLength={140}
                onChange={(e) => {
                  set("title", e.target.value)
                  if (!slugTouched) set("slug", slugify(e.target.value))
                }}
              />
            </div>
            <div>
              <FieldLabel htmlFor="art-slug">Web address</FieldLabel>
              <div className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400">
                <span>/blog/</span>
                <TextInput id="art-slug" value={f.slug} onChange={(e) => { setSlugTouched(true); set("slug", e.target.value) }} className="flex-1" />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="art-excerpt">Summary (shown in lists and search results)</FieldLabel>
              <Textarea id="art-excerpt" value={f.excerpt} onChange={(e) => set("excerpt", e.target.value)} rows={2} maxLength={300} />
            </div>
            <div>
              <FieldLabel htmlFor="art-body">Article</FieldLabel>
              <Textarea id="art-body" value={f.body} onChange={(e) => set("body", e.target.value)} rows={14} className="font-mono text-sm" />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="art-mt">Search title (optional)</FieldLabel>
                <TextInput id="art-mt" value={f.metaTitle} onChange={(e) => set("metaTitle", e.target.value)} maxLength={70} />
              </div>
              <div>
                <FieldLabel htmlFor="art-md">Search description (optional)</FieldLabel>
                <TextInput id="art-md" value={f.metaDescription} onChange={(e) => set("metaDescription", e.target.value)} maxLength={170} />
              </div>
            </div>
            <div className="w-48">
              <FieldLabel htmlFor="art-status">Status</FieldLabel>
              <NativeSelect id="art-status" value={f.status} onChange={(e) => set("status", e.target.value as "DRAFT" | "PUBLISHED")}>
                <option value="DRAFT">Draft (hidden)</option>
                <option value="PUBLISHED">Published</option>
              </NativeSelect>
            </div>
            <FieldError>{error}</FieldError>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={onClose}>Cancel</Button>
              <Button type="submit" loading={saving}>{f.status === "PUBLISHED" ? "Save & publish" : "Save draft"}</Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  )
}
