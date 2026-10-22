"use client"

import { useId, useRef, useState } from "react"
import { ImagePlus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Switch } from "@/components/ui/switch"
import { activeLocationHeaders } from "@/lib/org/active-location-client"
import { cn } from "@/lib/utils"
import { Panel } from "@/components/garage-portal/shared/PageHeader"

// Small building blocks for the website editor: a titled card, labelled fields with character counts, an on/off row and
// an image picker that uploads straight away.

export function Card({ title, description, children, className }: { title: string; description?: string; children: React.ReactNode; className?: string }) {
  return (
    <Panel className={cn("p-5 sm:p-6", className)}>
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      {description ? <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </Panel>
  )
}

export function Field({ label, value, onChange, max, hint, multiline, rows = 4, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; max: number; hint?: string; multiline?: boolean; rows?: number; type?: string; placeholder?: string }) {
  const id = useId()
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <span className={cn("text-xs tabular-nums", value.length > max * 0.9 ? "text-amber-700 dark:text-amber-300" : "text-slate-500 dark:text-slate-400")} aria-hidden>
          {value.length}/{max}
        </span>
      </div>
      {multiline ? (
        <textarea
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={max}
          rows={rows}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-400"
        />
      ) : (
        <TextInput id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} />
      )}
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}

export function Toggle({ label, checked, onChange, hint }: { label: string; checked: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const id = useId()
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <label htmlFor={id} className="text-sm font-semibold text-slate-800 dark:text-slate-100">{label}</label>
        {hint ? <p className="text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
      </div>
      <Switch id={id} checked={checked} onCheckedChange={onChange} aria-label={label} />
    </div>
  )
}

export type UploadResult = { ok: true; url: string; version?: number } | { ok: false; error: string }

/** Sends one image to the website's upload endpoint. The server checks the bytes, the size and the folder. */
export async function uploadImage(file: File, kind: "logo" | "hero" | "gallery"): Promise<UploadResult> {
  const form = new FormData()
  form.set("file", file)
  form.set("kind", kind)
  try {
    const url = "/api/garage/site/upload"
    const res = await fetch(url, { method: "POST", body: form, headers: activeLocationHeaders(url) })
    const data = (await res.json().catch(() => null)) as { url?: string; version?: number; error?: string } | null
    if (!res.ok || !data?.url) return { ok: false, error: data?.error ?? `Upload failed (${res.status})` }
    return { ok: true, url: data.url, version: data.version }
  } catch {
    return { ok: false, error: "Network error: please try again" }
  }
}

/** A picture with Change and Remove. Uploading happens on pick; the address comes back and is handed to the editor. */
export function ImageField({ label, url, kind, onUploaded, onRemove, hint, onError, square }: { label: string; url: string | null; kind: "logo" | "hero"; onUploaded: (url: string, version?: number) => void; onRemove: () => void; hint?: string; onError: (message: string) => void; square?: boolean }) {
  const input = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)

  const pick = async (file: File | undefined) => {
    if (!file) return
    setBusy(true)
    const r = await uploadImage(file, kind)
    setBusy(false)
    if (input.current) input.current.value = ""
    if (!r.ok) return onError(r.error)
    onUploaded(r.url, r.version)
  }

  return (
    <div>
      <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{label}</p>
      <div className="flex items-center gap-4">
        <div className={cn("flex flex-shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-800", square ? "h-20 w-20" : "h-20 w-32")}>
          {url ? (
            // eslint-disable-next-line @next/next/no-img-element -- our own uploaded image
            <img src={url} alt="" className="h-full w-full object-contain" />
          ) : (
            <ImagePlus aria-hidden className="h-6 w-6 text-slate-400" />
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" aria-label={`${label}: choose a file`} onChange={(e) => pick(e.target.files?.[0])} />
          <Button type="button" size="sm" variant="secondary" loading={busy} onClick={() => input.current?.click()}>
            {url ? "Change" : "Upload"}
          </Button>
          {url ? (
            <Button type="button" size="sm" variant="secondary" className="gap-1 text-red-700 dark:text-red-400" onClick={onRemove}>
              <Trash2 className="h-3.5 w-3.5" /> Remove
            </Button>
          ) : null}
        </div>
      </div>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </div>
  )
}
