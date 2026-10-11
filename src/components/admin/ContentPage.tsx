"use client"

import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { FilterTab, FilterTabList, FilterTabs } from "@/components/ui/filter-tabs"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { LOCALE_META, type Locale } from "@/lib/i18n/config"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface Entry {
  key: string
  section: string
  multiline: boolean
  isBody: boolean
  english: string
  default: string
  value: string
  draft: string | null
}

interface Payload {
  locale: Locale
  locales: Locale[]
  entries: Entry[]
}

const TEXTAREA =
  "w-full rounded-lg border-2 border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-[#1E3A5F] focus:outline-none dark:border-slate-700 dark:bg-slate-900 dark:text-white"

/** What the field shows before the admin types: their unpublished draft, else the live text, else the built-in text. */
const baseline = (e: Entry) => e.draft ?? (e.value !== "" ? e.value : e.default)

function Status({ e, dirty }: { e: Entry; dirty: boolean }) {
  const base = "rounded-full px-2 py-0.5 text-[11px] font-semibold"
  if (dirty) return <span className={`${base} bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200`}>Unsaved changes</span>
  if (e.draft !== null) return <span className={`${base} bg-amber-100 text-amber-900 dark:bg-amber-500/20 dark:text-amber-200`}>Draft, not live</span>
  if (e.value !== "") return <span className={`${base} bg-green-100 text-green-900 dark:bg-green-500/20 dark:text-green-200`}>Edited, live</span>
  return <span className={`${base} bg-slate-100 text-slate-600 dark:bg-white/10 dark:text-slate-300`}>Built-in text</span>
}

function EntryEditor({ entry, locale, onChanged }: { entry: Entry; locale: Locale; onChanged: () => void }) {
  const { toast } = useToast()
  const [text, setText] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  const current = text ?? baseline(entry)
  const dirty = text !== null && text !== baseline(entry)
  const id = `content-${locale}-${entry.key}`

  async function act(action: "saveDraft" | "publish" | "discardDraft" | "reset", message: string) {
    setBusy(true)
    setError("")
    const res = await sendJson("/api/admin/content", "PUT", { key: entry.key, locale, action, ...(action === "saveDraft" || (action === "publish" && dirty) ? { text: current } : {}) })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast(message)
    setText(null)
    onChanged()
  }

  return (
    <Panel className="p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <FieldLabel htmlFor={id}>
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">{entry.key}</span>
        </FieldLabel>
        <Status e={entry} dirty={dirty} />
      </div>

      {locale !== "en" && entry.english && (
        <p className="mb-2 rounded-md bg-slate-50 p-2 text-xs text-slate-600 dark:bg-white/5 dark:text-slate-300">
          <span className="font-semibold">English: </span>
          {entry.english.length > 220 ? `${entry.english.slice(0, 220)}…` : entry.english}
        </p>
      )}

      {entry.multiline || entry.isBody ? (
        <textarea id={id} rows={entry.isBody ? 16 : 3} value={current} onChange={(e) => setText(e.target.value)} className={TEXTAREA} />
      ) : (
        <TextInput id={id} value={current} onChange={(e) => setText(e.target.value)} />
      )}
      {entry.isBody && (
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          Formatting: <code>## Heading</code>, <code>### Subheading</code>, <code>- bullet</code>, <code>1. numbered</code>, <code>**bold**</code>, <code>*italic*</code>, <code>[link text](https://…)</code>. Leave empty to keep the page unpublished.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" variant="primary" loading={busy} disabled={!dirty && entry.draft === null} onClick={() => act("publish", "Published")}>
          Publish
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={busy || !dirty} onClick={() => act("saveDraft", "Draft saved")}>
          Save draft
        </Button>
        {entry.draft !== null && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => act("discardDraft", "Draft discarded")}>
            Discard draft
          </Button>
        )}
        {entry.value !== "" && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => act("reset", "Reset to built-in text")}>
            Reset to built-in
          </Button>
        )}
        {dirty && (
          <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => setText(null)}>
            Undo typing
          </Button>
        )}
      </div>
    </Panel>
  )
}

export function AdminContentPage() {
  const [locale, setLocale] = useState<Locale>("en")
  const [section, setSection] = useState("")
  const [q, setQ] = useState("")
  const { data, loading, error, reload } = useApi<Payload>(`/api/admin/content?locale=${locale}`)

  const sections = useMemo(() => [...new Set((data?.entries ?? []).map((e) => e.section))], [data])
  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return (data?.entries ?? []).filter(
      (e) => (!section || e.section === section) && (!needle || e.key.toLowerCase().includes(needle) || baseline(e).toLowerCase().includes(needle) || e.english.toLowerCase().includes(needle))
    )
  }, [data, section, q])

  return (
    <>
      <PageHeader
        title="Site content"
        description="Edit the wording of the public pages, footer, site-wide notice and legal pages in each language. Publishing is instant; use a draft to prepare a change first."
      />

      <FilterTabs value={locale} onValueChange={(v) => setLocale(v as Locale)} className="mb-4">
        <FilterTabList aria-label="Language">
          {(["en", "fr", "de"] as const).map((l) => (
            <FilterTab key={l} value={l}>
              {LOCALE_META[l].label}
            </FilterTab>
          ))}
        </FilterTabList>
      </FilterTabs>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="content-section">Section</FieldLabel>
          <select
            id="content-section"
            value={section}
            onChange={(e) => setSection(e.target.value)}
            className="h-10 w-full rounded-lg border-2 border-slate-200 bg-white px-3 text-sm dark:border-slate-700 dark:bg-slate-900 dark:text-white"
          >
            <option value="">All sections</option>
            {sections.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div>
          <FieldLabel htmlFor="content-search">Search</FieldLabel>
          <TextInput id="content-search" type="search" placeholder="Find text or a key…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>

      {locale !== "en" && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
          The built-in {LOCALE_META[locale].label} text is a machine-assisted draft. Have a native speaker review it, then publish corrections here.
        </p>
      )}

      {error && !data && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {loading && !data ? (
        <Skeleton className="h-64 w-full" />
      ) : (
        <div className="space-y-6">
          {sections
            .filter((s) => visible.some((e) => e.section === s))
            .map((s) => (
              <section key={s} aria-labelledby={`sec-${s}`}>
                <h2 id={`sec-${s}`} className="mb-3 text-lg font-bold text-slate-900 dark:text-white">
                  {s}
                </h2>
                <div className="grid gap-3 lg:grid-cols-2">
                  {visible
                    .filter((e) => e.section === s)
                    .map((e) => (
                      <EntryEditor key={`${locale}:${e.key}:${e.value}:${e.draft}`} entry={e} locale={locale} onChanged={reload} />
                    ))}
                </div>
              </section>
            ))}
          {visible.length === 0 && <p className="text-sm text-slate-500 dark:text-slate-400">Nothing matches.</p>}
        </div>
      )}
    </>
  )
}
