"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { AppOnDeviceCard } from "@/components/shared/AppOnDeviceCard"

interface Account {
  name: string | null
  email: string
  phone: string | null
  smsOptIn: boolean
  hasPassword: boolean
}

function ProfileForm({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const { toast } = useToast()
  const [name, setName] = useState(account.name ?? "")
  const [phone, setPhone] = useState(account.phone ?? "")
  const [smsOptIn, setSmsOptIn] = useState(account.smsOptIn)
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await sendJson("/api/account", "PATCH", { name, phone: phone || null, smsOptIn })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast("Profile saved")
    onSaved()
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <FieldLabel htmlFor="acc-name">Name</FieldLabel>
        <TextInput id="acc-name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
      </div>
      <div>
        <FieldLabel htmlFor="acc-email">Email</FieldLabel>
        <TextInput id="acc-email" value={account.email} readOnly disabled />
      </div>
      <div>
        <FieldLabel htmlFor="acc-phone">Phone</FieldLabel>
        <TextInput id="acc-phone" type="tel" inputMode="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </div>
      <label className="flex cursor-pointer items-start gap-3">
        <Switch checked={smsOptIn} onCheckedChange={setSmsOptIn} aria-label="Text me about my bookings" />
        <span>
          <span className="block text-sm font-semibold text-slate-900 dark:text-white">Text me about my bookings</span>
          <span className="block text-xs text-slate-500 dark:text-slate-400">Reminders and changes from garages that offer texts. Needs a UK mobile number above; you can switch this off any time.</span>
        </span>
      </label>
      <FieldError>{error}</FieldError>
      <Button type="submit" variant="primary" loading={busy}>
        Save changes
      </Button>
    </form>
  )
}

function PasswordForm() {
  const { toast } = useToast()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await sendJson("/api/account/change-password", "POST", { current, next })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't change password")
    toast("Password changed")
    setCurrent("")
    setNext("")
  }

  return (
    <form onSubmit={save} className="space-y-4">
      <div>
        <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
        <TextInput id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
      </div>
      <div>
        <FieldLabel htmlFor="pw-next">New password (8+ characters)</FieldLabel>
        <TextInput id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
      </div>
      <FieldError>{error}</FieldError>
      <Button type="submit" variant="primary" loading={busy} disabled={!current || next.length < 8}>
        Change password
      </Button>
    </form>
  )
}

export function OwnerSettingsPage() {
  const { data, loading, error, reload } = useApi<Account>("/api/account")

  return (
    <>
      <PageHeader title="Settings" description="Your contact details and password." />
      {error && !data && (
        <p role="alert" className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
      {loading && !data ? (
        <Skeleton className="h-64 w-full max-w-xl" />
      ) : (
        data && (
          <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel className="p-4 sm:p-6">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Profile</h2>
              <ProfileForm account={data} onSaved={reload} />
            </Panel>
            <Panel className="p-4 sm:p-6">
              <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">Password</h2>
              {data.hasPassword ? <PasswordForm /> : <p className="text-sm text-slate-500 dark:text-slate-400">You sign in with Google, so there&apos;s no password to manage here.</p>}
            </Panel>
            <AppOnDeviceCard />
          </div>
        )
      )}
    </>
  )
}
