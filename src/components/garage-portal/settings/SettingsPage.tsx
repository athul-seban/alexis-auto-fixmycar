"use client"

import { useState } from "react"
import { signOut } from "next-auth/react"
import { Button } from "@/components/ui/button"
import { FieldError, FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import type { PortalSettings } from "@/lib/portal/portal-settings"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { AppOnDeviceCard } from "@/components/shared/AppOnDeviceCard"
import { TechniciansCard } from "@/components/garage-portal/settings/TechniciansCard"

interface SettingsResponse {
  settings: PortalSettings
  account: { name: string | null; email: string | null; hasPassword: boolean }
  smsAvailable: boolean
}

export function SettingsPage() {
  const { data, error, reload } = useApi<SettingsResponse>("/api/garage/settings")

  return (
    <>
      <PageHeader title="Settings" description="Your team, notifications and account." />
      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="space-y-4">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 w-full rounded-xl" />)}</div>
      ) : (
        <div className="max-w-3xl space-y-6">
          <TechniciansCard />
          <CapacityCard key={data.settings.bays ?? "auto"} bays={data.settings.bays ?? null} onSaved={reload} />
          <QuoteRequestsCard key={`${data.settings.quotes.responseHours}-${data.settings.quotes.onExpiry}`} quotes={data.settings.quotes} onSaved={reload} />
          <NotificationsCard settings={data.settings} smsAvailable={data.smsAvailable} onSaved={reload} />
          <AppOnDeviceCard />
          <AccountCard account={data.account} />
        </div>
      )}
    </>
  )
}

const NOTIFICATION_ROWS: { key: keyof PortalSettings["notifications"]; title: string; description: string }[] = [
  { key: "emailNewBooking", title: "New bookings", description: "Email me when a customer books through the marketplace or my website widget." },
  { key: "emailCancellation", title: "Cancellations", description: "Email me when a customer cancels a booking." },
  { key: "emailEnquiry", title: "New quote requests", description: "Email me when a customer asks for a quote that matches my garage." },
  { key: "customerEmails", title: "Emails to customers", description: "Email customers when you confirm, cancel or move their booking." },
  { key: "reviewRequests", title: "Ask for reviews", description: "Email customers a review request a day after a job is marked completed." },
  { key: "emailReview", title: "New reviews", description: "Email me when a customer leaves a review." },
  { key: "emailMessage", title: "Customer messages", description: "Email me when a customer sends a message about a quote or booking." },
  { key: "smsCustomer", title: "Text my customers", description: "Send a 24-hour reminder and booking updates by SMS to customers who agreed to texts. SMS is billed per message." },
]

function NotificationsCard({ settings, smsAvailable, onSaved }: { settings: PortalSettings; smsAvailable: boolean; onSaved: () => void }) {
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
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Notifications</h2>
      <p className="mb-2 mt-0.5 text-sm text-slate-500 dark:text-slate-400">In-app notifications (the bell) are always on.</p>
      <ul className="divide-y divide-slate-100 dark:divide-white/10">
        {NOTIFICATION_ROWS.map((r) => (
          <li key={r.key} className="flex items-center justify-between gap-4 py-3.5">
            <div>
              <p className="font-semibold text-slate-900 dark:text-white">{r.title}</p>
              <p className="text-sm text-slate-500 dark:text-slate-400">{r.description}</p>
            </div>
            <Switch checked={settings.notifications[r.key]} disabled={busy === r.key || (r.key === "smsCustomer" && !smsAvailable && !settings.notifications.smsCustomer)} onCheckedChange={(v) => toggle(r.key, v)} aria-label={r.title} />
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

const RESPONSE_HOURS = [1, 2, 4, 8, 12, 24, 48, 72, 168]
const hoursLabel = (h: number) => (h === 168 ? "7 days" : h >= 48 ? `${h / 24} days` : h === 1 ? "1 hour" : `${h} hours`)

function QuoteRequestsCard({ quotes, onSaved }: { quotes: PortalSettings["quotes"]; onSaved: () => void }) {
  const { toast } = useToast()
  const [hours, setHours] = useState(quotes.responseHours)
  const [onExpiry, setOnExpiry] = useState(quotes.onExpiry)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")
  const dirty = hours !== quotes.responseHours || onExpiry !== quotes.onExpiry
  const options = RESPONSE_HOURS.includes(hours) ? RESPONSE_HOURS : [...RESPONSE_HOURS, hours].sort((a, b) => a - b)

  const save = async () => {
    setError("")
    setSaving(true)
    const res = await sendJson("/api/garage/settings", "PATCH", { quotes: { responseHours: hours, onExpiry } })
    setSaving(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast("Quote settings saved")
    onSaved()
  }

  return (
    <Panel className="p-5 sm:p-6">
      <h2 className="text-lg font-bold text-slate-900 dark:text-white">Quote requests</h2>
      <p className="mb-4 mt-0.5 text-sm text-slate-500 dark:text-slate-400">
        Services with a fixed price and “Quote instantly” on (see Pricing) are answered straight away. For everything else you have this long to send a price.
        Customer details are only shared once the customer accepts your quote.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <FieldLabel htmlFor="quote-hours">Time to send a quote</FieldLabel>
          <NativeSelect id="quote-hours" value={hours} onChange={(e) => setHours(Number(e.target.value))}>
            {options.map((h) => <option key={h} value={h}>{hoursLabel(h)}</option>)}
          </NativeSelect>
        </div>
        <div>
          <FieldLabel htmlFor="quote-expiry">If you don&apos;t reply in time</FieldLabel>
          <NativeSelect id="quote-expiry" value={onExpiry} onChange={(e) => setOnExpiry(e.target.value as typeof onExpiry)}>
            <option value="EXPIRE">Close the request</option>
            <option value="ESTIMATE">Send my “from” prices as an estimate</option>
          </NativeSelect>
        </div>
      </div>
      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
        An estimate is only sent when every service in the request has a price on your Pricing page; otherwise the request closes.
      </p>
      <div className="mt-4">
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
    toast("Password changed. Please sign in again.")
    // Changing the password ends every session, including this one, so go straight to the sign-in page.
    await signOut({ callbackUrl: "/login" })
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
