"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import type { PortalSettings } from "@/lib/portal/portal-settings"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { TechniciansCard } from "@/components/garage-portal/settings/TechniciansCard"

interface SettingsResponse {
  settings: PortalSettings
  account: { name: string | null; email: string | null; hasPassword: boolean }
}

export function SettingsPage() {
  const { data, error, reload } = useApi<SettingsResponse>("/api/garage/settings")

  return (
    <>
      <PageHeader title="Settings" description="Your team, notifications and account." />
      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-600 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <TechniciansCard />
          <CapacityCard key={data.settings.bays ?? "auto"} bays={data.settings.bays ?? null} onSaved={reload} />
          <NotificationsCard settings={data.settings} onSaved={reload} />
          <AccountCard account={data.account} />
        </div>
      )}
    </>
  )
}

const NOTIFICATION_ROWS: { key: keyof PortalSettings["notifications"]; title: string; description: string }[] = [
  { key: "emailNewBooking", title: "New bookings", description: "Email me when a customer books through the marketplace or my website widget." },
  { key: "emailCancellation", title: "Cancellations", description: "Email me when a customer cancels a booking." },
  { key: "emailReview", title: "New reviews", description: "Email me when a customer leaves a review." },
]

function NotificationsCard({ settings, onSaved }: { settings: PortalSettings; onSaved: () => void }) {
  const { toast } = useToast()
  const [busy, setBusy] = useState<string | null>(null)

  const toggle = async (key: keyof PortalSettings["notifications"], value: boolean) => {
    setBusy(key)
    const res = await sendJson("/api/garage/settings", "PATCH", { notifications: { [key]: value } })
    setBusy(null)
    if (!res.ok) return toast(res.error ?? "Couldn't save that setting", "error")
    toast("Notification settings saved")
    onSaved()
  }

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Email notifications</h2>
      <p className="mb-2 mt-0.5 text-sm text-slate-500 dark:text-slate-400">In-app notifications (the bell) are always on.</p>
      <ul className="divide-y divide-slate-100 dark:divide-white/10">
        {NOTIFICATION_ROWS.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{r.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{r.description}</p>
            </div>
            <Switch checked={settings.notifications[r.key]} disabled={busy === r.key} onCheckedChange={(v) => toggle(r.key, v)} aria-label={r.title} />
          </li>
        ))}
      </ul>
    </Panel>
  )
}

function CapacityCard({ bays, onSaved }: { bays: number | null; onSaved: () => void }) {
  const { toast } = useToast()
  const [value, setValue] = useState(bays?.toString() ?? "")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const dirty = value !== (bays?.toString() ?? "")

  const save = async () => {
    const n = value === "" ? null : Number(value)
    if (n !== null && (!Number.isInteger(n) || n < 1 || n > 50)) return setError("Enter a whole number from 1 to 50, or leave blank")
    setError("")
    setSaving(true)
    const res = await sendJson("/api/garage/settings", "PATCH", { bays: n })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast("Capacity saved")
    onSaved()
  }

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Capacity</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        How many jobs can you run at the same time? Leave blank to use your number of active technicians (minimum 1).
        Your diary and booking widget stop offering a slot once it&apos;s full.
      </p>
      <div className="flex items-end gap-3">
        <div className="w-40">
          <FieldLabel htmlFor="bays">Concurrent jobs</FieldLabel>
          <TextInput id="bays" type="number" min={1} max={50} placeholder="Automatic" value={value} onChange={(e) => setValue(e.target.value)} />
        </div>
        <Button size="sm" variant="primary" disabled={!dirty} loading={saving} onClick={save}>Save</Button>
      </div>
      <FieldError>{error}</FieldError>
    </Panel>
  )
}

function AccountCard({ account }: { account: SettingsResponse["account"] }) {
  const { toast } = useToast()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (next.length < 8) return setError("Your new password must be at least 8 characters")
    if (next !== confirm) return setError("The new passwords don't match")
    setError("")
    setSaving(true)
    const res = await sendJson("/api/garage/change-password", "POST", { current, next })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't change your password")
    setCurrent(""); setNext(""); setConfirm("")
    toast("Password changed")
  }

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Account</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Signed in as <strong className="text-slate-700 dark:text-slate-200">{account.email}</strong>
      </p>
      {account.hasPassword ? (
        <form onSubmit={submit} noValidate className="space-y-3">
          <p className="text-sm font-semibold text-slate-900 dark:text-white">Change password</p>
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
              <TextInput id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="pw-new">New password</FieldLabel>
              <TextInput id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
            </div>
            <div>
              <FieldLabel htmlFor="pw-confirm">Confirm new password</FieldLabel>
              <TextInput id="pw-confirm" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" size="sm" variant="primary" loading={saving} disabled={!current || !next || !confirm}>Change password</Button>
        </form>
      ) : (
        <p className="text-sm text-slate-500 dark:text-slate-400">You sign in with Google, so there&apos;s no password to manage here.</p>
      )}
    </Panel>
  )
}
