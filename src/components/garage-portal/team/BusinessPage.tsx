"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface Business {
  name: string
  legalName: string | null
  vatNumber: string | null
  contactEmail: string | null
  contactPhone: string | null
  website: string | null
  description: string | null
  locationCount: number
}

export function BusinessPage() {
  const { data, error, reload } = useApi<{ business: Business }>("/api/garage/business")
  return (
    <>
      <PageHeader title="Business details" description="The company behind your locations. Customers see your location listings; these details are for invoices and for us." />
      {error && !data ? (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">{error}</p>
      ) : !data ? (
        <Skeleton className="h-96 w-full max-w-2xl rounded-xl" />
      ) : (
        <BusinessForm key={data.business.name + data.business.vatNumber} business={data.business} onSaved={reload} />
      )}
    </>
  )
}

function BusinessForm({ business, onSaved }: { business: Business; onSaved: () => void }) {
  const { toast } = useToast()
  const [f, setF] = useState({
    name: business.name,
    legalName: business.legalName ?? "",
    vatNumber: business.vatNumber ?? "",
    contactEmail: business.contactEmail ?? "",
    contactPhone: business.contactPhone ?? "",
    website: business.website ?? "",
    description: business.description ?? "",
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }))

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setError("")
    const blank = (v: string) => (v.trim() ? v.trim() : null)
    const res = await sendJson("/api/garage/business", "PATCH", {
      name: f.name.trim(),
      legalName: blank(f.legalName),
      vatNumber: blank(f.vatNumber),
      contactEmail: blank(f.contactEmail),
      contactPhone: blank(f.contactPhone),
      website: blank(f.website),
      description: blank(f.description),
    })
    setSaving(false)
    if (!res.ok) {
      const first = (res.data as { details?: { message?: string }[] } | null)?.details?.[0]?.message
      return setError(first ?? res.error ?? "Couldn't save")
    }
    toast("Business details saved")
    onSaved()
  }

  return (
    <Panel className="max-w-2xl p-5 sm:p-6">
      <form onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="biz-name">Business name *</FieldLabel>
            <TextInput id="biz-name" value={f.name} onChange={set("name")} maxLength={100} />
          </div>
          <div>
            <FieldLabel htmlFor="biz-legal">Registered company name</FieldLabel>
            <TextInput id="biz-legal" value={f.legalName} onChange={set("legalName")} maxLength={150} />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="biz-vat">VAT number</FieldLabel>
          <TextInput id="biz-vat" value={f.vatNumber} onChange={set("vatNumber")} placeholder="GB123456789" autoCapitalize="characters" />
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            One number for the whole business: it appears on the invoices of all {business.locationCount} {business.locationCount === 1 ? "location" : "locations"}.
          </p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="biz-email">Contact email</FieldLabel>
            <TextInput id="biz-email" type="email" value={f.contactEmail} onChange={set("contactEmail")} />
          </div>
          <div>
            <FieldLabel htmlFor="biz-phone">Contact phone</FieldLabel>
            <TextInput id="biz-phone" type="tel" value={f.contactPhone} onChange={set("contactPhone")} />
          </div>
        </div>
        <div>
          <FieldLabel htmlFor="biz-web">Website</FieldLabel>
          <TextInput id="biz-web" type="url" value={f.website} onChange={set("website")} placeholder="https://" />
        </div>
        <div>
          <FieldLabel htmlFor="biz-desc">About the business</FieldLabel>
          <textarea
            id="biz-desc"
            value={f.description}
            onChange={set("description")}
            rows={4}
            maxLength={2000}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#1E3A5F] dark:border-slate-700 dark:bg-slate-900 dark:text-white dark:focus:ring-blue-400"
          />
        </div>
        <FieldError>{error}</FieldError>
        <Button type="submit" variant="primary" loading={saving}>
          Save details
        </Button>
      </form>
    </Panel>
  )
}
