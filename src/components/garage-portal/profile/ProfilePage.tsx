"use client"

import { useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { ExternalLink, ImagePlus, Shield, Trash2, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { SERVICE_TYPES } from "@/lib/constants"
import { normaliseOpeningHours, openingHoursError } from "@/lib/portal/opening-hours"
import { getServiceLabel } from "@/lib/utils"
import type { OpeningHours } from "@/types"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { OpeningHoursEditor } from "@/components/garage-portal/profile/OpeningHoursEditor"

interface Profile {
  id: string
  name: string
  slug: string
  description: string | null
  logo: string | null
  images: string[]
  phone: string
  email: string
  website: string | null
  address: string
  city: string
  postcode: string
  isMobile: boolean
  services: string[]
  status: string
  isVerified: boolean
  verificationBadges: string[]
  openingHours: OpeningHours | null
}

interface FormState {
  name: string
  description: string
  phone: string
  email: string
  website: string
  address: string
  city: string
  postcode: string
  isMobile: boolean
  services: string[]
  openingHours: OpeningHours
}

const toForm = (p: Profile): FormState => ({
  name: p.name,
  description: p.description ?? "",
  phone: p.phone,
  email: p.email,
  website: p.website ?? "",
  address: p.address,
  city: p.city,
  postcode: p.postcode,
  isMobile: p.isMobile,
  services: [...p.services].sort(),
  openingHours: normaliseOpeningHours(p.openingHours),
})

function validate(f: FormState): string | null {
  if (f.name.trim().length < 2) return "Enter your garage name"
  if (f.phone.trim().length < 6) return "Enter a valid phone number"
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return "Enter a valid email address"
  if (f.website.trim() && !/^https?:\/\/\S+$/i.test(f.website.trim())) return "Your website must start with http:// or https://"
  if (f.address.trim().length < 3 || f.city.trim().length < 2 || f.postcode.trim().length < 3) return "Enter your full address, city and postcode"
  return openingHoursError(f.openingHours)
}

export function ProfilePage() {
  const { data, error, reload } = useApi<{ garage: Profile }>("/api/garage/me")

  return (
    <>
      <PageHeader title="Profile" description="Your public listing: details, photos, services and opening hours." />
      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-600 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-48 w-full rounded-xl" />)}</div>
      ) : (
        <ProfileForm key={data.garage.id} profile={data.garage} onSaved={reload} />
      )}
    </>
  )
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">{title}</h2>
      {description && <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      {!description && <div className="mb-4" />}
      {children}
    </Panel>
  )
}

function ProfileForm({ profile, onSaved }: { profile: Profile; onSaved: () => void }) {
  const router = useRouter()
  const { toast } = useToast()
  const [baseline, setBaseline] = useState(() => toForm(profile))
  const [form, setForm] = useState(baseline)
  const [logo, setLogo] = useState(profile.logo)
  const [images, setImages] = useState(profile.images)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [uploading, setUploading] = useState<"logo" | "gallery" | null>(null)
  const logoRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)

  const dirty = JSON.stringify(form) !== JSON.stringify(baseline)
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }))
  const hoursError = openingHoursError(form.openingHours)

  const toggleService = (s: string) =>
    set("services", form.services.includes(s) ? form.services.filter((x) => x !== s) : [...form.services, s].sort())

  const save = async () => {
    const problem = validate(form)
    if (problem) return setError(problem)
    setError(null)
    setSaving(true)
    const res = await sendJson(`/api/garages/${profile.id}`, "PATCH", {
      name: form.name,
      description: form.description.trim() || null,
      phone: form.phone,
      email: form.email,
      website: form.website.trim(),
      address: form.address,
      city: form.city,
      postcode: form.postcode,
      isMobile: form.isMobile,
      services: form.services,
      openingHours: form.openingHours,
    })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save your profile")
    setBaseline(form)
    toast("Profile saved")
    router.refresh() // updates the sidebar name/logo, which come from the server layout
    onSaved()
  }

  const upload = async (file: File, kind: "logo" | "gallery") => {
    setUploading(kind)
    const body = new FormData()
    body.append("file", file)
    body.append("kind", kind)
    const res = await fetch("/api/upload", { method: "POST", body })
    const data = await res.json().catch(() => ({}))
    setUploading(null)
    if (!res.ok) return toast(data.error ?? "Upload failed", "error")
    if (kind === "logo") setLogo(data.url)
    else setImages((prev) => [...prev, data.url])
    toast(kind === "logo" ? "Logo updated" : "Photo added")
    router.refresh()
  }

  const removeImage = async (url: string) => {
    setImages((prev) => prev.filter((i) => i !== url))
    const res = await fetch(`/api/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" })
    if (!res.ok) toast("Couldn't remove that photo", "error")
  }

  return (
    <div className="space-y-6 pb-24">
      {profile.status === "APPROVED" && (
        <a href={`/garage/${profile.slug}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1E3A5F] hover:underline dark:text-blue-300">
          View your public profile <ExternalLink className="h-3.5 w-3.5" />
        </a>
      )}

      <Section title="Branding" description="Your logo and photos appear on your public listing.">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl bg-slate-100 dark:bg-slate-700">
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="Garage logo" className="h-full w-full object-cover" />
            ) : (
              <span className="text-xs text-slate-400">No logo</span>
            )}
          </div>
          <input ref={logoRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "logo")} />
          <Button type="button" size="sm" variant="secondary" className="gap-1.5" loading={uploading === "logo"} onClick={() => logoRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" /> {logo ? "Change logo" : "Upload logo"}
          </Button>
        </div>

        <div className="mt-6">
          <p className="mb-2 text-sm font-semibold text-slate-900 dark:text-white">Photos <span className="font-normal text-slate-400">({images.length}/8)</span></p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-5 lg:grid-cols-6">
            {images.map((url) => (
              <div key={url} className="group relative aspect-square overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-700">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt="Garage" className="h-full w-full object-cover" />
                <button type="button" onClick={() => removeImage(url)} aria-label="Remove photo" className="absolute right-1.5 top-1.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity focus:opacity-100 group-hover:opacity-100">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            {images.length < 8 && (
              <button type="button" onClick={() => galleryRef.current?.click()} disabled={uploading === "gallery"} className="flex aspect-square cursor-pointer flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-slate-200 text-sm text-slate-400 transition-colors hover:border-slate-300 hover:text-slate-500 disabled:opacity-50 dark:border-slate-700">
                <ImagePlus className="h-6 w-6" />
                {uploading === "gallery" ? "Uploading…" : "Add photo"}
              </button>
            )}
          </div>
          <input ref={galleryRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0], "gallery")} />
        </div>
      </Section>

      <Section title="Business details">
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="p-name">Garage name *</FieldLabel>
            <TextInput id="p-name" value={form.name} onChange={(e) => set("name", e.target.value)} maxLength={100} />
          </div>
          <div>
            <FieldLabel htmlFor="p-phone">Phone *</FieldLabel>
            <TextInput id="p-phone" type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="p-email">Email *</FieldLabel>
            <TextInput id="p-email" type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="p-web">Website</FieldLabel>
            <TextInput id="p-web" type="url" placeholder="https://" value={form.website} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <FieldLabel htmlFor="p-address">Address *</FieldLabel>
            <TextInput id="p-address" value={form.address} onChange={(e) => set("address", e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="p-city">City *</FieldLabel>
            <TextInput id="p-city" value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div>
            <FieldLabel htmlFor="p-postcode">Postcode *</FieldLabel>
            <TextInput id="p-postcode" value={form.postcode} onChange={(e) => set("postcode", e.target.value.toUpperCase())} maxLength={10} className="uppercase" />
          </div>
        </div>
        <label className="mt-4 flex w-fit cursor-pointer items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300">
          <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.isMobile} onChange={(e) => set("isMobile", e.target.checked)} />
          Mobile mechanic — I travel to customers
        </label>
        <div className="mt-4">
          <FieldLabel htmlFor="p-desc">About your garage</FieldLabel>
          <Textarea id="p-desc" rows={5} value={form.description} onChange={(e) => set("description", e.target.value)} maxLength={2000} />
          <p className="mt-1 text-right text-xs text-slate-400">{form.description.length}/2000</p>
        </div>
      </Section>

      <Section title="Services offered" description="Customers can only request and book the services you tick here.">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {SERVICE_TYPES.map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2.5 text-sm text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-white/5">
              <input type="checkbox" className="h-4 w-4 rounded border-slate-300" checked={form.services.includes(s)} onChange={() => toggleService(s)} />
              {getServiceLabel(s)}
            </label>
          ))}
        </div>
      </Section>

      <Section title="Opening hours" description="Used for your diary, booking widget availability and public listing. Times are UK time.">
        <OpeningHoursEditor value={form.openingHours} onChange={(h) => set("openingHours", h)} error={hoursError} />
      </Section>

      {profile.isVerified && (
        <Section title="Verification">
          <div className="flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-semibold text-blue-700 dark:bg-blue-500/20 dark:text-blue-300"><Shield className="h-3.5 w-3.5" /> Verified</span>
            {profile.verificationBadges.map((b) => (
              <span key={b} className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 dark:bg-white/10 dark:text-slate-300">{b.replace(/_/g, " ")}</span>
            ))}
          </div>
        </Section>
      )}

      {/* Sticky save bar */}
      <div className={`fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur transition-transform dark:border-white/10 dark:bg-slate-900/95 lg:left-64 ${dirty || error ? "translate-y-0" : "translate-y-full"}`}>
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6 lg:px-8">
          <p className={`flex-1 text-sm ${error ? "text-red-600 dark:text-red-400" : "text-slate-500 dark:text-slate-400"}`} role={error ? "alert" : undefined}>
            {error ?? "You have unsaved changes."}
          </p>
          <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => { setForm(baseline); setError(null) }}>Discard</Button>
          <Button type="button" variant="primary" size="sm" loading={saving} onClick={save}>Save changes</Button>
        </div>
      </div>
    </div>
  )
}
