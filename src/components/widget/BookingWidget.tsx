"use client"

import { useEffect, useMemo, useState } from "react"
import { useSearchParams } from "next/navigation"
import { useTheme } from "next-themes"
import { ArrowLeft, CalendarCheck, CheckCircle2, Clock, Loader2, Phone, Wrench } from "lucide-react"
import { cn } from "@/lib/utils"
import { addDays, formatCivilDate, formatLondonLongDate, formatLondonTime, todayLondon } from "@/lib/portal/tz"
import { useApi } from "@/hooks/use-api"

interface WidgetService {
  serviceType: string
  label: string
  durationMins: number
  priceLabel: string | null
  notes: string | null
}

interface WidgetConfig {
  garage: { name: string; logo: string | null; phone: string; city: string; address: string; postcode: string }
  settings: { accent: string; leadHours: number; maxDaysAhead: number; slotMins: number; autoConfirm: boolean; successMessage: string; smsAvailable: boolean }
  hoursConfigured: boolean
  services: WidgetService[]
}

interface Slot { start: string; label: string }
type Step = "service" | "time" | "details" | "done"

const HEX6 = /^[0-9a-fA-F]{6}$/

/** Black or white text, whichever reads better on the accent colour. */
function readableOn(hex: string): string {
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return (r * 299 + g * 587 + b * 114) / 1000 > 150 ? "#0f172a" : "#ffffff"
}

const DAYS_SHOWN = 14

const input =
  "h-11 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 dark:border-slate-600 dark:bg-slate-900 dark:text-white"

export function BookingWidget({ slug }: { slug: string }) {
  const search = useSearchParams()
  const { setTheme } = useTheme()

  // Hosts can force a theme (?theme=light|dark) to match their site.
  const themeParam = search.get("theme")
  useEffect(() => {
    if (themeParam === "light" || themeParam === "dark") setTheme(themeParam)
  }, [themeParam, setTheme])

  const { data: config, error } = useApi<WidgetConfig>(`/api/widget/${encodeURIComponent(slug)}`)

  if (error && !config) {
    return (
      <Shell accent="1E3A5F">
        <div className="p-8 text-center">
          <Wrench className="mx-auto mb-3 h-10 w-10 text-slate-300" />
          <p className="font-semibold text-slate-900 dark:text-white">Online booking isn&apos;t available</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Please contact the garage directly to book.</p>
        </div>
      </Shell>
    )
  }
  if (!config) {
    return (
      <Shell accent="1E3A5F">
        <div className="flex justify-center p-12"><Loader2 className="h-6 w-6 animate-spin text-slate-400" /></div>
      </Shell>
    )
  }

  const accentParam = search.get("accent")
  const accent = accentParam && HEX6.test(accentParam) ? accentParam : config.settings.accent
  return <Flow slug={slug} config={config} accent={accent} />
}

function Shell({ accent, children, garage }: { accent: string; children: React.ReactNode; garage?: WidgetConfig["garage"] }) {
  return (
    <div className="min-h-dvh bg-slate-50 p-3 dark:bg-slate-950 sm:p-4" style={{ ["--accent" as string]: `#${accent}` }}>
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-white/10 dark:bg-slate-900">
        {garage && (
          <div className="flex items-center gap-3 border-b border-slate-100 px-5 py-4 dark:border-white/10" style={{ borderTop: `4px solid #${accent}` }}>
            {garage.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={garage.logo} alt="" className="h-10 w-10 rounded-lg object-cover" />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg" style={{ backgroundColor: `#${accent}` }}>
                <Wrench className="h-5 w-5" style={{ color: readableOn(accent) }} />
              </div>
            )}
            <div className="min-w-0">
              <h1 className="truncate text-base font-bold text-slate-900 dark:text-white">{garage.name}</h1>
              <p className="truncate text-xs text-slate-500 dark:text-slate-400">Book online · {garage.city}</p>
            </div>
          </div>
        )}
        {children}
        <p className="border-t border-slate-100 px-5 py-3 text-center text-[11px] text-slate-500 dark:border-white/10 dark:text-slate-400">
          Powered by Quote<span className="text-[#C2410C] dark:text-[#F97316]">MyGarage</span>
        </p>
      </div>
    </div>
  )
}

function Flow({ slug, config, accent }: { slug: string; config: WidgetConfig; accent: string }) {
  const { garage, settings, services } = config
  const [step, setStep] = useState<Step>("service")
  const [service, setService] = useState<WidgetService | null>(null)
  const [date, setDate] = useState<string | null>(null)
  const [slots, setSlots] = useState<Slot[] | null>(null)
  const [slotsLoading, setSlotsLoading] = useState(false)
  const [slot, setSlot] = useState<Slot | null>(null)
  const [notice, setNotice] = useState("")
  const [submitting, setSubmitting] = useState(false)
  const [form, setForm] = useState({ name: "", email: "", phone: "", vrm: "", make: "", model: "", notes: "", website: "" })
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [error, setError] = useState("")
  const [result, setResult] = useState<{ reference: string; scheduledAt: string; status: string; message: string; checkoutUrl?: string | null } | null>(null)

  const today = todayLondon()
  const days = useMemo(() => {
    const count = Math.min(DAYS_SHOWN, settings.maxDaysAhead + 1)
    return Array.from({ length: count }, (_, i) => addDays(today, i))
  }, [today, settings.maxDaysAhead])

  const btn = { backgroundColor: `#${accent}`, color: readableOn(accent) }
  const ring = { ["--tw-ring-color" as string]: `#${accent}` }

  const loadSlots = async (svc: WidgetService, day: string) => {
    setDate(day)
    setSlot(null)
    setSlots(null)
    setSlotsLoading(true)
    try {
      const res = await fetch(`/api/widget/${encodeURIComponent(slug)}/slots?date=${day}&service=${svc.serviceType}`)
      const data = await res.json()
      setSlots(res.ok ? data.slots : [])
    } catch {
      setSlots([])
    } finally {
      setSlotsLoading(false)
    }
  }

  const chooseService = (svc: WidgetService) => {
    setService(svc)
    setStep("time")
    setNotice("")
    loadSlots(svc, date ?? days[0])
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!service || !slot) return
    setSubmitting(true)
    setError("")
    try {
      const res = await fetch(`/api/widget/${encodeURIComponent(slug)}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ service: service.serviceType, start: slot.start, ...form, smsOptIn: config.settings.smsAvailable && smsOptIn }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.status === 409 && data.code === "slot_taken") {
        setSlots(data.slots ?? [])
        setSlot(null)
        setNotice(data.error ?? "That time was just taken — please choose another.")
        setStep("time")
        return
      }
      if (!res.ok) {
        setError(data.details?.[0]?.message ?? data.error ?? "Something went wrong — please try again.")
        return
      }
      setResult(data)
      setStep("done")
      // Stripe's checkout can't be framed, and this widget usually lives in an iframe: take the whole window there.
      // If the browser blocks that, the "Pay deposit" button below does the same on a click.
      if (data.checkoutUrl) {
        try {
          ;(window.top ?? window).location.href = data.checkoutUrl
        } catch {
          /* blocked: the button handles it */
        }
      }
    } catch {
      setError("Network error — please try again.")
    } finally {
      setSubmitting(false)
    }
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((f) => ({ ...f, [k]: e.target.value }))

  if (!config.hoursConfigured) {
    return (
      <Shell accent={accent} garage={garage}>
        <div className="p-6 text-center">
          <p className="font-semibold text-slate-900 dark:text-white">Please call to book</p>
          <a href={`tel:${garage.phone}`} className="mt-3 inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold" style={btn}>
            <Phone className="h-4 w-4" /> {garage.phone}
          </a>
        </div>
      </Shell>
    )
  }

  return (
    <Shell accent={accent} garage={garage}>
      {step !== "service" && step !== "done" && (
        <button type="button" onClick={() => setStep(step === "details" ? "time" : "service")} className="flex cursor-pointer items-center gap-1.5 px-5 pt-4 text-sm font-medium text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white">
          <ArrowLeft className="h-4 w-4" /> Back
        </button>
      )}

      {/* 1 — service */}
      {step === "service" && (
        <div className="p-5">
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-slate-500">What do you need?</h2>
          {services.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">No services are available to book online right now. Please call {garage.phone}.</p>
          ) : (
            <ul className="space-y-2">
              {services.map((s) => (
                <li key={s.serviceType}>
                  <button type="button" onClick={() => chooseService(s)} className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-xl border border-slate-200 px-4 py-3 text-left transition-colors hover:border-slate-400 dark:border-slate-700 dark:hover:border-slate-500">
                    <span className="min-w-0">
                      <span className="block font-semibold text-slate-900 dark:text-white">{s.label}</span>
                      <span className="block text-xs text-slate-500 dark:text-slate-400">
                        About {s.durationMins >= 60 ? `${Math.round((s.durationMins / 60) * 10) / 10}h` : `${s.durationMins} min`}{s.notes ? ` · ${s.notes}` : ""}
                      </span>
                    </span>
                    {s.priceLabel && <span className="flex-shrink-0 text-sm font-bold text-slate-900 dark:text-white">{s.priceLabel}</span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 2 — date and time */}
      {step === "time" && service && (
        <div className="p-5">
          <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-slate-400">Choose a time</h2>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">{service.label}</p>
          {notice && <p role="alert" className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{notice}</p>}

          <div className="-mx-1 mb-4 flex gap-2 overflow-x-auto px-1 pb-2" role="listbox" aria-label="Date">
            {days.map((d) => {
              const dt = new Date(`${d}T12:00:00Z`)
              const selected = d === date
              return (
                <button
                  key={d}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => loadSlots(service, d)}
                  className={cn("flex w-14 flex-shrink-0 cursor-pointer flex-col items-center rounded-xl border px-2 py-2 text-xs transition-colors", selected ? "border-transparent" : "border-slate-200 text-slate-700 hover:border-slate-400 dark:border-slate-700 dark:text-slate-300")}
                  style={selected ? btn : undefined}
                >
                  <span className="font-medium uppercase opacity-80">{dt.toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" })}</span>
                  <span className="text-base font-bold">{dt.toLocaleDateString("en-GB", { day: "numeric", timeZone: "UTC" })}</span>
                  <span className="opacity-80">{dt.toLocaleDateString("en-GB", { month: "short", timeZone: "UTC" })}</span>
                </button>
              )
            })}
          </div>

          {slotsLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
          ) : slots && slots.length > 0 ? (
            <div className="grid grid-cols-4 gap-2" role="listbox" aria-label="Time">
              {slots.map((s) => (
                <button
                  key={s.start}
                  type="button"
                  role="option"
                  aria-selected={slot?.start === s.start}
                  onClick={() => { setSlot(s); setStep("details") }}
                  className="cursor-pointer rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-800 transition-colors hover:border-slate-400 dark:border-slate-700 dark:text-slate-200"
                >
                  {s.label}
                </button>
              ))}
            </div>
          ) : (
            <p className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              No times available on {date ? formatCivilDate(date) : "that day"}. Try another day.
            </p>
          )}
        </div>
      )}

      {/* 3 — details */}
      {step === "details" && service && slot && (
        <form onSubmit={submit} className="space-y-3 p-5" noValidate>
          <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm dark:bg-white/5">
            <p className="font-semibold text-slate-900 dark:text-white">{service.label}</p>
            <p className="mt-0.5 flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
              <CalendarCheck className="h-4 w-4" /> {formatLondonLongDate(slot.start)} at {formatLondonTime(slot.start)}
            </p>
          </div>

          <div>
            <label htmlFor="w-name" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Your name *</label>
            <input id="w-name" className={input} style={ring} value={form.name} onChange={set("name")} autoComplete="name" required />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="w-email" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Email *</label>
              <input id="w-email" type="email" className={input} style={ring} value={form.email} onChange={set("email")} autoComplete="email" required />
            </div>
            <div>
              <label htmlFor="w-phone" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Phone *</label>
              <input id="w-phone" type="tel" className={input} style={ring} value={form.phone} onChange={set("phone")} autoComplete="tel" required />
            </div>
          </div>
          {config.settings.smsAvailable && (
            <label className="flex cursor-pointer items-start gap-2 text-xs text-slate-600 dark:text-slate-300">
              <input type="checkbox" className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer" checked={smsOptIn} onChange={(e) => setSmsOptIn(e.target.checked)} />
              Text me a reminder and any changes to this booking (UK mobiles only)
            </label>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <label htmlFor="w-vrm" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Registration *</label>
              <input id="w-vrm" className={cn(input, "font-mono uppercase tracking-wider")} style={ring} value={form.vrm} onChange={(e) => setForm((f) => ({ ...f, vrm: e.target.value.toUpperCase() }))} maxLength={12} required />
            </div>
            <div>
              <label htmlFor="w-make" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Make</label>
              <input id="w-make" className={input} style={ring} value={form.make} onChange={set("make")} />
            </div>
            <div>
              <label htmlFor="w-model" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Model</label>
              <input id="w-model" className={input} style={ring} value={form.model} onChange={set("model")} />
            </div>
          </div>
          <div>
            <label htmlFor="w-notes" className="mb-1 block text-xs font-semibold text-slate-500 dark:text-slate-400">Anything we should know?</label>
            <textarea id="w-notes" rows={2} maxLength={500} className={cn(input, "h-auto resize-none py-2")} style={ring} value={form.notes} onChange={set("notes")} />
          </div>

          {/* Honeypot: invisible to people, tempting to bots. */}
          <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label>Website<input tabIndex={-1} autoComplete="off" value={form.website} onChange={set("website")} /></label>
          </div>

          {error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>}
          <button type="submit" disabled={submitting} className="flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-xl text-sm font-bold transition-opacity disabled:opacity-60" style={btn}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {settings.autoConfirm ? "Confirm booking" : "Request booking"}
          </button>
          <p className="text-center text-[11px] text-slate-500 dark:text-slate-400">We&apos;ll only use your details to deal with this booking.</p>
        </form>
      )}

      {/* 4 — done */}
      {step === "done" && result && service && (
        <div className="p-6 text-center">
          <CheckCircle2 className="mx-auto mb-3 h-12 w-12" style={{ color: `#${accent}` }} />
          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{result.status === "CONFIRMED" ? "You're booked in!" : "Booking requested"}</h2>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            {service.label} · {formatLondonLongDate(result.scheduledAt)} at {formatLondonTime(result.scheduledAt)}
          </p>
          <p className="mx-auto mt-3 inline-block rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-sm font-bold tracking-wider text-slate-900 dark:bg-white/10 dark:text-white">{result.reference}</p>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{result.message}</p>
          {result.checkoutUrl && (
            <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="font-semibold">One more step: pay your deposit</p>
              <p className="mt-0.5 text-xs">Your slot is held for 30 minutes while you pay.</p>
              <a href={result.checkoutUrl} target="_top" rel="noopener" className="mt-3 inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold" style={btn}>
                Pay deposit securely
              </a>
            </div>
          )}
          <p className="mt-4 flex items-center justify-center gap-1.5 text-xs text-slate-500 dark:text-slate-400"><Clock className="h-3.5 w-3.5" /> A confirmation has been emailed to you.</p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Need to change it? Call {garage.phone}.</p>
        </div>
      )}
    </Shell>
  )
}
