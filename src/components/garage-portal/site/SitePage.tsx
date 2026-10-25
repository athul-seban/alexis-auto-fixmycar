"use client"

import { useEffect, useMemo, useState } from "react"
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, Eye, Globe } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Skeleton } from "@/components/ui/skeleton"
import { TextInput } from "@/components/ui/form-controls"
import { useToast } from "@/components/ui/toast"
import { activeLocationHeaders } from "@/lib/org/active-location-client"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn, formatDate, formatDateTime } from "@/lib/utils"
import type { SiteContent } from "@/lib/site/content"
import type { SiteTier } from "@/lib/site/tier"
import type { SiteTheme } from "@/lib/site/theme"
import { ProPanel } from "@/components/garage-portal/site/ProPanel"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { Card } from "@/components/garage-portal/site/fields"
import { EditorSections, type Draft } from "@/components/garage-portal/site/EditorSections"

interface EditorState {
  site: { id: string; status: string; version: number; hasUnpublishedChanges: boolean; approved: boolean; publishedAt: string | null; submittedAt: string | null; rejectionReason: string | null; disabled: boolean; disabledReason: string | null; logo: string | null }
  address: { label: string | null; url: string | null; previous: string[] }
  theme: SiteTheme
  content: SiteContent
  locations: { id: string; name: string; city: string; status: string; slug: string }[]
  problems: string[]
  revisions: { id: string; version: number; createdAt: string; note: string | null }[]
  websiteDomainConfigured: boolean
  tier: SiteTier
}

function hostOf(url: string | null): string | undefined {
  try {
    return url ? new URL(url).host : undefined
  } catch {
    return undefined
  }
}

export function SitePage() {
  const { data, error, reload } = useApi<EditorState>("/api/garage/site")
  return (
    <>
      <PageHeader title="Website" description="A simple one-page website for your business, with every location, your opening hours and a way to book. It lives at its own address." />
      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !data ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
        </div>
      ) : (
        // Remounts whenever something the server decided changes (status, address, a new published version), so the editor
        // always starts from the truth; a plain save keeps it mounted so nothing flickers or loses the scroll position.
        <Editor key={[data.site.status, data.site.approved, data.site.publishedAt, data.site.disabled, data.address.label, data.revisions[0]?.id].join("|")} state={data} reload={reload} />
      )}
    </>
  )
}

const STATUS: Record<string, { label: string; tone: string; icon: typeof Clock }> = {
  DRAFT: { label: "Draft", tone: "bg-slate-100 text-slate-800 dark:bg-white/10 dark:text-slate-200", icon: Clock },
  PENDING_REVIEW: { label: "Waiting for review", tone: "bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200", icon: Clock },
  PUBLISHED: { label: "Live", tone: "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300", icon: CheckCircle2 },
  UNPUBLISHED: { label: "Offline", tone: "bg-slate-200 text-slate-800 dark:bg-white/10 dark:text-slate-200", icon: Clock },
  REJECTED: { label: "Needs changes", tone: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300", icon: AlertTriangle },
}

function Editor({ state, reload }: { state: EditorState; reload: () => void }) {
  const { toast } = useToast()
  const [draft, setDraft] = useState<Draft>({ theme: state.theme, content: state.content, logo: state.site.logo })
  const [baseline, setBaseline] = useState(() => JSON.stringify({ theme: state.theme, content: state.content, logo: state.site.logo }))
  const [serverLogo, setServerLogo] = useState(state.site.logo)
  const [version, setVersion] = useState(state.site.version)
  const [hasUnpublished, setHasUnpublished] = useState(state.site.hasUnpublishedChanges)
  const [busy, setBusy] = useState<string | null>(null)
  const [stale, setStale] = useState(false)
  const [confirm, setConfirm] = useState<null | { kind: "unpublish" } | { kind: "rollback"; id: string; version: number }>(null)

  const dirty = JSON.stringify(draft) !== baseline
  const status = state.site.disabled ? { label: "Switched off by Quote My Garage", tone: "bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-300", icon: AlertTriangle } : (STATUS[state.site.status] ?? STATUS.DRAFT)
  const StatusIcon = status.icon
  const live = state.site.status === "PUBLISHED" && !state.site.disabled
  const goLiveLabel = live ? "Publish changes" : state.site.approved ? "Publish" : "Send for review"
  const canPublish = !dirty && state.problems.length === 0 && !state.site.disabled && (state.site.status !== "PUBLISHED" || hasUnpublished) && state.site.status !== "PENDING_REVIEW"

  const onError = (message: string) => toast(message, "error")

  const save = async () => {
    setBusy("save")
    const res = await sendJson<{ version: number; problems?: string[] }>("/api/garage/site", "PATCH", {
      expectedVersion: version,
      theme: draft.theme,
      content: draft.content,
      ...(draft.logo !== serverLogo ? { logo: draft.logo } : {}),
    })
    setBusy(null)
    if (!res.ok || !res.data) {
      if (res.status === 409 && (res.data as { code?: string } | null)?.code === "STALE") setStale(true)
      return toast(res.error ?? "Couldn't save", "error")
    }
    setVersion(res.data.version)
    setBaseline(JSON.stringify(draft))
    setServerLogo(draft.logo)
    setHasUnpublished(true)
    toast("Saved. Your changes aren't on the live website until you publish them.")
    reload()
  }

  const act = async (key: string, body: object, done: string) => {
    setBusy(key)
    const res = await sendJson<{ status?: string }>("/api/garage/site/publish", "POST", body)
    setBusy(null)
    setConfirm(null)
    if (!res.ok) return toast(res.error ?? "That didn't work", "error")
    toast(done)
    reload()
  }

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return
    const warn = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [dirty])

  return (
    <div className="space-y-6 pb-24">
      <Panel className="p-5 sm:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold", status.tone)}>
            <StatusIcon aria-hidden className="h-4 w-4" /> {status.label}
          </span>
          {live && hasUnpublished ? <span className="rounded-full bg-blue-100 px-3 py-1 text-sm font-semibold text-blue-900 dark:bg-blue-500/20 dark:text-blue-200">Changes not published yet</span> : null}
          {live && state.address.url ? (
            <a href={state.address.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A5F] underline-offset-2 hover:underline dark:text-blue-300">
              {state.address.url.replace(/^https?:\/\//, "")} <ExternalLink aria-hidden className="h-3.5 w-3.5" />
            </a>
          ) : null}
        </div>

        {state.site.disabled ? <p role="alert" className="mt-3 text-sm text-red-800 dark:text-red-300">Quote My Garage switched your website off{state.site.disabledReason ? `: ${state.site.disabledReason}` : ""}. Contact support to put it back.</p> : null}
        {state.site.status === "REJECTED" && state.site.rejectionReason ? <p role="alert" className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-900 dark:bg-red-500/10 dark:text-red-200"><strong>Needs changes:</strong> {state.site.rejectionReason}. Update it, then send it again.</p> : null}
        {state.site.status === "PENDING_REVIEW" ? <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">Sent for review{state.site.submittedAt ? ` on ${formatDate(state.site.submittedAt)}` : ""}. We check each new website once before it goes live, and email you the outcome. After that, you can publish changes yourself.</p> : null}
        {!state.websiteDomainConfigured ? <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">Website addresses aren&apos;t set up on this platform yet, so a published site can&apos;t be reached. Everything else works.</p> : null}
        {stale ? (
          <p role="alert" className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            Someone else changed the website. <button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Reload</button> to see their changes (yours on this page will be lost).
          </p>
        ) : null}

        {state.problems.length > 0 && state.site.status !== "PUBLISHED" ? (
          <ul className="mt-3 space-y-1 text-sm text-amber-900 dark:text-amber-200" aria-label="Before it can go live">
            {state.problems.map((p) => (
              <li key={p} className="flex items-start gap-2"><AlertTriangle aria-hidden className="mt-0.5 h-4 w-4 flex-shrink-0" /> {p}</li>
            ))}
          </ul>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <Button variant="primary" onClick={save} loading={busy === "save"} disabled={!dirty || busy !== null}>Save changes</Button>
          <Button asChild variant="secondary" className="gap-1.5">
            <a href="/site-preview" target="_blank" rel="noopener noreferrer" title={dirty ? "Preview shows your last saved changes" : undefined}>
              <Eye className="h-4 w-4" /> Preview
            </a>
          </Button>
          {state.site.status !== "PENDING_REVIEW" ? (
            <Button variant="default" onClick={() => act("publish", { action: "publish" }, live || state.site.approved ? "Published" : "Sent for review")} loading={busy === "publish"} disabled={!canPublish || busy !== null} title={dirty ? "Save your changes first" : undefined}>
              {goLiveLabel}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => act("withdraw", { action: "withdraw" }, "Taken back to a draft")} loading={busy === "withdraw"}>Withdraw from review</Button>
          )}
          {live ? <Button variant="secondary" className="text-red-700 dark:text-red-400" onClick={() => setConfirm({ kind: "unpublish" })} disabled={busy !== null}>Take offline</Button> : null}
        </div>
        {dirty ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400" aria-live="polite">You have unsaved changes.</p> : null}
      </Panel>

      <AddressCard state={state} onSaved={reload} />

      <ProPanel tier={state.tier} />

      <EditorSections
        draft={draft}
        setDraft={setDraft}
        locations={state.locations}
        tier={state.tier}
        siteHost={hostOf(state.address.url)}
        onError={onError}
        onVersion={(v) => {
          // A logo upload is saved straight away: the server's version moved, and the logo is no longer an unsaved change.
          setVersion(v)
          setServerLogo(draft.logo)
          setBaseline((b) => JSON.stringify({ ...JSON.parse(b), logo: draft.logo }))
        }}
      />

      {state.site.status === "PUBLISHED" && state.revisions.length > 0 ? (
        <Card title="Earlier versions" description="Every time you publish, a copy is kept. Restore one if a change didn't work out.">
          <ul className="divide-y divide-slate-100 dark:divide-white/10">
            {state.revisions.map((r, i) => (
              <li key={r.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-900 dark:text-white">{formatDateTime(r.createdAt)}</span>
                  {i === 0 ? <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-semibold text-green-800 dark:bg-green-500/15 dark:text-green-300">Live now</span> : null}
                  {r.note ? <span className="block text-xs text-slate-500 dark:text-slate-400">{r.note}</span> : null}
                </span>
                {i > 0 ? <Button size="sm" variant="secondary" disabled={busy !== null || dirty} onClick={() => setConfirm({ kind: "rollback", id: r.id, version: r.version })}>Restore</Button> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm?.kind === "unpublish"}
        loading={busy === "confirm"}
        title={confirm?.kind === "unpublish" ? "Take your website offline?" : "Restore this version?"}
        description={confirm?.kind === "unpublish" ? "Visitors will see a “not found” page until you publish again. You won't need another review." : "This version goes live straight away. Anything you've saved but not published stays as it is."}
        confirmLabel={confirm?.kind === "unpublish" ? "Take offline" : "Restore"}
        onConfirm={() => {
          if (!confirm) return
          void act("confirm", confirm.kind === "unpublish" ? { action: "unpublish" } : { action: "rollback", revisionId: confirm.id }, confirm.kind === "unpublish" ? "Your website is offline" : "Restored")
        }}
      />
    </div>
  )
}

/** The address: <name>.<domain>. Checks as you type; changing it keeps the old one redirecting. */
function AddressCard({ state, onSaved }: { state: EditorState; onSaved: () => void }) {
  const { toast } = useToast()
  const current = state.address.label ?? ""
  const [value, setValue] = useState(current)
  const [check, setCheck] = useState<{ ok: boolean; message: string | null; label: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const suffix = useMemo(() => {
    try {
      return state.address.url ? new URL(state.address.url).host.replace(/^[^.]+/, "") : ""
    } catch {
      return ""
    }
  }, [state.address.url])

  // Ask the server whether the typed name is free, once typing pauses.
  useEffect(() => {
    const typed = value.trim()
    if (!typed || typed.toLowerCase() === current) return
    const t = setTimeout(async () => {
      try {
        const url = `/api/garage/site/address?label=${encodeURIComponent(typed)}`
        const res = await fetch(url, { headers: activeLocationHeaders(url) })
        if (res.ok) setCheck((await res.json()) as { ok: boolean; message: string | null; label: string })
      } catch {
        /* the hint is optional */
      }
    }, 350)
    return () => clearTimeout(t)
  }, [value, current])

  const changed = value.trim().toLowerCase() !== current
  const shown = changed ? check : null

  const save = async () => {
    setSaving(true)
    const res = await sendJson("/api/garage/site/address", "PUT", { label: value })
    setSaving(false)
    if (!res.ok) return toast(res.error ?? "Couldn't change the address", "error")
    toast("Address saved")
    onSaved()
  }

  return (
    <Card title="Website address" description={current ? "Visitors reach your website here. If you change it, the old address keeps redirecting to the new one." : "Choose the address visitors will use."}>
      <div>
        <label htmlFor="site-address" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Address</label>
        <div className="flex flex-wrap items-center gap-2">
          <TextInput id="site-address" value={value} onChange={(e) => { setValue(e.target.value); setCheck(null) }} maxLength={40} autoCapitalize="none" spellCheck={false} className="max-w-[16rem] font-mono" aria-describedby="site-address-hint" />
          {suffix ? <span className="font-mono text-sm text-slate-600 dark:text-slate-300">{suffix}</span> : null}
          <Button type="button" size="sm" variant="secondary" onClick={save} loading={saving} disabled={!changed || !value.trim() || (shown !== null && !shown.ok)}>
            {current ? "Change address" : "Save address"}
          </Button>
        </div>
        <p id="site-address-hint" className={cn("mt-1 text-xs", shown && !shown.ok ? "text-red-700 dark:text-red-400" : shown?.ok ? "text-green-800 dark:text-green-400" : "text-slate-500 dark:text-slate-400")} aria-live="polite">
          {shown ? (shown.ok ? `“${shown.label}” is available.` : shown.message) : "3 to 40 letters, numbers and hyphens."}
        </p>
        {state.address.previous.length > 0 ? <p className="mt-2 text-xs text-slate-500 dark:text-slate-400"><Globe aria-hidden className="mr-1 inline h-3 w-3" />Earlier addresses that redirect: {state.address.previous.join(", ")}</p> : null}
      </div>
    </Card>
  )
}
