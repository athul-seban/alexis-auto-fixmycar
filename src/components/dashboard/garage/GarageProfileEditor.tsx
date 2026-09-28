"use client"

import { useState, useEffect, useRef } from "react"
import { Loader2, Upload, X, Shield } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getServiceLabel } from "@/lib/utils"

const ALL_SERVICES = [
  "MOT", "FULL_SERVICE", "INTERIM_SERVICE", "MINOR_SERVICE", "REPAIR", "DIAGNOSTICS",
  "TYRES", "BRAKES", "CLUTCH", "CAMBELT", "EXHAUST", "BATTERY", "WINDSCREEN", "AIR_CON", "ELECTRIC_SERVICE", "OTHER",
]

interface GarageData {
  id: string
  name: string
  description: string | null
  phone: string
  email: string
  website: string | null
  address: string
  city: string
  postcode: string
  isMobile: boolean
  services: string[]
  logo: string | null
  images: string[]
  isVerified: boolean
  verificationBadges: string[]
}

export function GarageProfileEditor() {
  const [garage, setGarage] = useState<GarageData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [uploadError, setUploadError] = useState("")
  const logoInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    fetch("/api/garage/me")
      .then((res) => res.json())
      .then((data) => setGarage(data.garage))
      .finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="py-16 flex justify-center"><Loader2 className="h-8 w-8 animate-spin text-slate-300 dark:text-slate-600" /></div>
  }
  if (!garage) return <p className="text-sm text-slate-500 dark:text-slate-400">Failed to load profile.</p>

  const update = <K extends keyof GarageData>(key: K, value: GarageData[K]) => {
    setGarage((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const toggleService = (service: string) => {
    setGarage((prev) => {
      if (!prev) return prev
      const has = prev.services.includes(service)
      return { ...prev, services: has ? prev.services.filter((s) => s !== service) : [...prev.services, service] }
    })
  }

  const handleSave = async () => {
    if (!garage) return
    setSaving(true)
    setSaved(false)
    try {
      const res = await fetch(`/api/garages/${garage.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: garage.name,
          description: garage.description,
          phone: garage.phone,
          email: garage.email,
          website: garage.website,
          address: garage.address,
          city: garage.city,
          postcode: garage.postcode,
          isMobile: garage.isMobile,
          services: garage.services,
        }),
      })
      if (res.ok) setSaved(true)
    } finally {
      setSaving(false)
    }
  }

  const handleUpload = async (file: File, kind: "logo" | "gallery") => {
    setUploadError("")
    const formData = new FormData()
    formData.append("file", file)
    formData.append("kind", kind)
    const res = await fetch("/api/upload", { method: "POST", body: formData })
    const data = await res.json()
    if (!res.ok) {
      setUploadError(data.error ?? "Upload failed")
      return
    }
    if (kind === "logo") update("logo", data.url)
    else update("images", [...garage.images, data.url])
  }

  const removeImage = async (url: string) => {
    update("images", garage.images.filter((img) => img !== url))
    await fetch(`/api/upload?url=${encodeURIComponent(url)}`, { method: "DELETE" })
  }

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-gray-200 dark:border-white/10 p-6 space-y-6">
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">Garage Profile Settings</h2>
        <p className="text-slate-500 dark:text-slate-400 text-sm">Manage your public profile visible to customers.</p>
        {garage.isVerified && (
          <div className="flex flex-wrap gap-2 mt-3">
            <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-500/20 text-blue-700 dark:text-blue-400">
              <Shield className="h-3 w-3" /> Verified
            </span>
            {garage.verificationBadges.map((b) => (
              <span key={b} className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-slate-300">
                {b.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}
      </div>

      {uploadError && <p className="text-xs text-red-600 dark:text-red-400">{uploadError}</p>}

      {/* Logo */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Logo</label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center overflow-hidden">
            {garage.logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={garage.logo} alt="Logo" className="w-full h-full object-cover" />
            ) : (
              <span className="text-slate-400 dark:text-slate-500 text-xs">No logo</span>
            )}
          </div>
          <input
            ref={logoInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "logo")}
          />
          <Button size="sm" variant="outline" className="gap-1.5" onClick={() => logoInputRef.current?.click()}>
            <Upload className="h-3.5 w-3.5" />
            Upload Logo
          </Button>
        </div>
      </div>

      {/* Gallery */}
      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Photos</label>
        <div className="grid grid-cols-4 gap-2 mb-2">
          {garage.images.map((img) => (
            <div key={img} className="relative group aspect-square rounded-lg overflow-hidden bg-slate-100 dark:bg-slate-700">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img} alt="Garage" className="w-full h-full object-cover" />
              <button
                onClick={() => removeImage(img)}
                className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleUpload(e.target.files[0], "gallery")}
        />
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => galleryInputRef.current?.click()}>
          <Upload className="h-3.5 w-3.5" />
          Add Photo
        </Button>
      </div>

      {/* Basic fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Field label="Garage Name" value={garage.name} onChange={(v) => update("name", v)} />
        <Field label="Phone" value={garage.phone} onChange={(v) => update("phone", v)} />
        <Field label="Email" value={garage.email} onChange={(v) => update("email", v)} />
        <Field label="Website" value={garage.website ?? ""} onChange={(v) => update("website", v)} />
        <Field label="Address" value={garage.address} onChange={(v) => update("address", v)} />
        <Field label="City" value={garage.city} onChange={(v) => update("city", v)} />
        <Field label="Postcode" value={garage.postcode} onChange={(v) => update("postcode", v)} />
      </div>

      <div>
        <label className="flex items-center gap-2.5 cursor-pointer w-fit">
          <input type="checkbox" checked={garage.isMobile} onChange={(e) => update("isMobile", e.target.checked)} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900" />
          <span className="text-sm text-slate-700 dark:text-slate-300">Mobile mechanic (I travel to customers)</span>
        </label>
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Description</label>
        <textarea
          value={garage.description ?? ""}
          onChange={(e) => update("description", e.target.value)}
          rows={4}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] resize-none"
        />
      </div>

      <div>
        <label className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2 block">Services Offered</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {ALL_SERVICES.map((s) => (
            <label key={s} className="flex items-center gap-2 cursor-pointer text-sm text-slate-700 dark:text-slate-300">
              <input type="checkbox" checked={garage.services.includes(s)} onChange={() => toggleService(s)} className="w-4 h-4 rounded border-slate-300 dark:border-slate-600 dark:bg-slate-900" />
              {getServiceLabel(s)}
            </label>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Button loading={saving} onClick={handleSave}>Save Changes</Button>
        {saved && <span className="text-sm text-green-600 dark:text-green-400">Saved</span>}
      </div>
    </div>
  )
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1 block">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full h-10 px-3 rounded-lg border border-slate-200 dark:border-slate-700 dark:bg-slate-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-[#1E3A5F]"
      />
    </div>
  )
}
