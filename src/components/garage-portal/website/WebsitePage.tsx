"use client"

import { useState } from "react"
import Link from "next/link"
import { AlertTriangle, Check, Clock, Copy, ExternalLink } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import { SLOT_MINUTES, type PortalSettings } from "@/lib/portal/portal-settings"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { PaymentsCard } from "@/components/garage-portal/website/PaymentsCard"

interface SettingsResponse {
  settings: PortalSettings
  garage: { status: string; slug: string }
  paymentsAvailable: boolean
  stripe: { connected: boolean; enabled: boolean }
}
interface MeResponse {
  garage: { openingHours: unknown | null; services: string[] }
}

const SWATCHES = ["1E3A5F", "F97316", "10B981", "8B5CF6", "EF4444", "0EA5E9", "EAB308", "0F172A"]
const HEX6 = /^[0-9a-fA-F]{6}$/

export function WebsitePage() {
  const { data, error, reload } = useApi<SettingsResponse>("/api/garage/settings")
  const { data: me } = useApi<MeResponse>("/api/garage/me")

  return (
    <>
      <PageHeader title="Website" description="Let customers book online from your own website with a free booking widget." />
      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="space-y-4"><Skeleton className="h-32 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>
      ) : (
        <>
          <WidgetManager
            key={JSON.stringify(data.settings.widget)}
            settings={data.settings}
            garage={data.garage}
            hoursSet={!!me?.garage.openingHours}
            serviceCount={me?.garage.services.length ?? null}
            onSaved={reload}
          />
          <PaymentsCard key={JSON.stringify(data.settings.payments)} payments={data.settings.payments} available={data.paymentsAvailable} stripe={data.stripe} onSaved={reload} />
        </>
      )}
    </>
  )
}

function Card({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </Panel>
  )
}

function WidgetManager({ settings, garage, hoursSet, serviceCount, onSaved }: {
  settings: PortalSettings
  garage: { status: string; slug: string }
  hoursSet: boolean
  serviceCount: number | null
  onSaved: () => void
}) {
  const { toast } = useToast()
  const w = settings.widget
  const [form, setForm] = useState(w)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const [copied, setCopied] = useState<"embed" | "link" | null>(null)
  const [previewTheme, setPreviewTheme] = useState<"light" | "dark">("light")

  const dirty = JSON.stringify(form) !== JSON.stringify(w)
  const live = garage.status === "APPROVED" && w.enabled
  const origin = typeof window === "undefined" ? "" : window.location.origin
  const widgetUrl = `${origin}/widget/${garage.slug}`
  const embed = `<iframe src="${widgetUrl}" title="Book online" width="100%" height="720" style="max-width:460px;border:0;border-radius:16px" loading="lazy"></iframe>`

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }))

  const save = async () => {
    if (!HEX6.test(form.accent)) return setError("Accent must be a 6-digit hex colour, e.g. 1E3A5F")
    setError("")
    setSaving(true)
    const res = await sendJson("/api/garage/settings", "PATCH", { widget: form })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save widget settings")
    toast("Widget settings saved")
    onSaved()
  }

  const toggleEnabled = async (enabled: boolean) => {
    setForm((f) => ({ ...f, enabled }))
    const res = await sendJson("/api/garage/settings", "PATCH", { widget: { enabled } })
    if (!res.ok) {
      setForm((f) => ({ ...f, enabled: !enabled }))
      return toast(res.error ?? "Couldn't update the widget", "error")
    }
    toast(enabled ? "Booking widget switched on" : "Booking widget switched off")
    onSaved()
  }

  const copy = async (what: "embed" | "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(what)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      toast("Couldn't copy — select the text and copy it manually", "error")
    }
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Status */}
      <Panel className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <span className={cn("flex h-10 w-10 items-center justify-center rounded-full", live ? "bg-green-100 text-green-700 dark:bg-green-500/15 dark:text-green-300" : "bg-slate-100 text-slate-500 dark:bg-white/10 dark:text-slate-400")}>
            {live ? <Check className="h-5 w-5" /> : <Clock className="h-5 w-5" />}
          </span>
          <div>
            <p className="font-bold text-slate-900 dark:text-white">{live ? "Your booking widget is live" : w.enabled ? "Switched on, not live yet" : "Your booking widget is off"}</p>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              {garage.status !== "APPROVED" ? "It goes live once your garage is approved." : w.enabled ? "Customers can book at the link below." : "Turn it on to start taking online bookings."}
            </p>
          </div>
        </div>
        <Switch checked={w.enabled} onCheckedChange={toggleEnabled} aria-label="Booking widget enabled" />
      </Panel>

      {(!hoursSet || serviceCount === 0) && (
        <div role="alert" className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <p>
            {!hoursSet && <>Set your <Link href="/garage-dashboard/profile" className="font-semibold underline">opening hours</Link> — without them the widget has no times to offer. </>}
            {serviceCount === 0 && <>Choose the <Link href="/garage-dashboard/profile" className="font-semibold underline">services you offer</Link> so customers have something to book.</>}
          </p>
        </div>
      )}

      <Card title="Share or embed it" description="Paste the code into your website, or just link to the page. It works on any site and any phone.">
        <FieldLabel htmlFor="w-link">Direct link</FieldLabel>
        <div className="mb-4 flex gap-2">
          <TextInput id="w-link" readOnly value={widgetUrl} onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="secondary" className="gap-1.5" onClick={() => copy("link", widgetUrl)}>
            {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === "link" ? "Copied" : "Copy"}
          </Button>
          <Button asChild variant="secondary" aria-label="Open widget in a new tab">
            <a href={widgetUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a>
          </Button>
        </div>
        <FieldLabel htmlFor="w-embed">Embed code</FieldLabel>
        <div className="flex gap-2">
          <Textarea id="w-embed" readOnly rows={3} value={embed} className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
          <Button type="button" variant="secondary" className="h-auto gap-1.5 self-stretch" onClick={() => copy("embed", embed)}>
            {copied === "embed" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />} {copied === "embed" ? "Copied" : "Copy"}
          </Button>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Add <code className="rounded bg-slate-100 px-1 dark:bg-white/10">?theme=dark</code> to the URL to match a dark site, or <code className="rounded bg-slate-100 px-1 dark:bg-white/10">?accent=F97316</code> to override the colour.
        </p>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Settings">
          <div className="space-y-4">
            <div>
              <FieldLabel htmlFor="w-accent">Accent colour</FieldLabel>
              <div className="mb-2 flex flex-wrap gap-2" role="radiogroup" aria-label="Accent colour">
                {SWATCHES.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={form.accent.toUpperCase() === c} aria-label={`#${c}`} onClick={() => set("accent", c)}
                    className={cn("h-7 w-7 cursor-pointer rounded-full ring-offset-2 dark:ring-offset-slate-800", form.accent.toUpperCase() === c ? "ring-2 ring-slate-900 dark:ring-white" : "hover:ring-2 hover:ring-slate-300")}
                    style={{ backgroundColor: `#${c}` }} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-slate-400">#</span>
                <TextInput id="w-accent" value={form.accent} maxLength={6} className="w-28 font-mono uppercase" onChange={(e) => set("accent", e.target.value.replace(/[^0-9a-fA-F]/g, ""))} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <FieldLabel htmlFor="w-lead">Minimum notice (hours)</FieldLabel>
                <TextInput id="w-lead" type="number" min={0} max={168} value={form.leadHours} onChange={(e) => set("leadHours", Math.max(0, Math.min(168, Number(e.target.value) || 0)))} />
              </div>
              <div>
                <FieldLabel htmlFor="w-ahead">Book up to (days ahead)</FieldLabel>
                <TextInput id="w-ahead" type="number" min={1} max={365} value={form.maxDaysAhead} onChange={(e) => set("maxDaysAhead", Math.max(1, Math.min(365, Number(e.target.value) || 1)))} />
              </div>
            </div>
            <div>
              <FieldLabel htmlFor="w-slot">Time slots every</FieldLabel>
              <NativeSelect id="w-slot" value={form.slotMins} onChange={(e) => set("slotMins", Number(e.target.value))}>
                {SLOT_MINUTES.map((m) => <option key={m} value={m}>{m} minutes</option>)}
              </NativeSelect>
            </div>
            <label className="flex cursor-pointer items-start gap-3">
              <Switch checked={form.autoConfirm} onCheckedChange={(v) => set("autoConfirm", v)} aria-label="Confirm bookings automatically" />
              <span>
                <span className="block text-sm font-semibold text-slate-900 dark:text-white">Confirm bookings automatically</span>
                <span className="block text-xs text-slate-500 dark:text-slate-400">Off: new bookings arrive as Pending for you to confirm.</span>
              </span>
            </label>
            <div>
              <FieldLabel htmlFor="w-msg">Message shown after booking (optional)</FieldLabel>
              <Textarea id="w-msg" rows={2} maxLength={300} value={form.successMessage} onChange={(e) => set("successMessage", e.target.value)} placeholder="e.g. Please bring your locking wheel nut key." />
            </div>
            <FieldError>{error}</FieldError>
            <div className="flex gap-2">
              <Button type="button" variant="primary" size="sm" loading={saving} disabled={!dirty} onClick={save}>Save settings</Button>
              {dirty && <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setForm(w); setError("") }}>Discard</Button>}
            </div>
          </div>
        </Card>

        <Card title="Preview">
          <div className="mb-3 flex gap-1 rounded-lg border border-slate-200 p-0.5 dark:border-slate-700 w-fit" role="group" aria-label="Preview theme">
            {(["light", "dark"] as const).map((t) => (
              <button key={t} type="button" aria-pressed={previewTheme === t} onClick={() => setPreviewTheme(t)}
                className={cn("cursor-pointer rounded-md px-3 py-1 text-xs font-medium capitalize", previewTheme === t ? "bg-[#1E3A5F] text-white dark:bg-blue-500" : "text-slate-600 dark:text-slate-300")}>
                {t}
              </button>
            ))}
          </div>
          {live ? (
            <iframe
              key={`${previewTheme}-${w.accent}-${w.slotMins}`}
              title="Booking widget preview"
              src={`/widget/${garage.slug}?theme=${previewTheme}`}
              className="h-[640px] w-full rounded-xl border border-slate-200 dark:border-white/10"
            />
          ) : (
            <p className="rounded-xl bg-slate-50 p-6 text-center text-sm text-slate-500 dark:bg-white/5 dark:text-slate-400">
              The preview appears once your widget is live (garage approved and the widget switched on). Saved changes apply to the preview automatically.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
