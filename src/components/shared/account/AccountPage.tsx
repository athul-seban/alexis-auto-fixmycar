"use client"

import { useRef, useState } from "react"
import { signOut, useSession } from "next-auth/react"
import { Camera, LogOut } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { FieldError, FieldLabel, TextInput } from "@/components/ui/form-controls"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/components/ui/toast"
import { sendJson, useApi } from "@/hooks/use-api"
import { getInitials } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { AppOnDeviceCard } from "@/components/shared/AppOnDeviceCard"

export interface Account {
  name: string | null
  email: string
  phone: string | null
  image: string | null
  role: string
  smsOptIn: boolean
  emailNotifications: boolean
  marketingOptIn: boolean
  hasPassword: boolean
  createdAt: string
}

const ROLE_LABEL: Record<string, string> = { OWNER: "Customer", GARAGE: "Garage", ADMIN: "Administrator" }

function Heading({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-white">{children}</h2>
}

function ToggleRow({ checked, onChange, title, hint }: { checked: boolean; onChange: (v: boolean) => void; title: string; hint: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={title} />
      <span>
        <span className="block text-sm font-semibold text-slate-900 dark:text-white">{title}</span>
        <span className="block text-xs text-slate-500 dark:text-slate-400">{hint}</span>
      </span>
    </label>
  )
}

function ProfilePanel({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const { toast } = useToast()
  const { update } = useSession()
  const fileRef = useRef<HTMLInputElement>(null)
  const [name, setName] = useState(account.name ?? "")
  const [phone, setPhone] = useState(account.phone ?? "")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const [photoBusy, setPhotoBusy] = useState(false)

  async function save(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError("")
    const res = await sendJson("/api/account", "PATCH", { name, phone: phone || null })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast("Profile saved")
    await update()
    onSaved()
  }

  async function upload(file: File) {
    setPhotoBusy(true)
    setError("")
    const body = new FormData()
    body.append("file", file)
    try {
      const res = await fetch("/api/account/avatar", { method: "POST", body })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) return setError(json.error ?? "Couldn't upload photo")
      toast("Photo updated")
      await update()
      onSaved()
    } finally {
      setPhotoBusy(false)
      if (fileRef.current) fileRef.current.value = ""
    }
  }

  async function removePhoto() {
    setPhotoBusy(true)
    const res = await sendJson("/api/account", "PATCH", { image: null })
    setPhotoBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't remove photo")
    toast("Photo removed")
    await update()
    onSaved()
  }

  return (
    <Panel className="p-4 sm:p-6">
      <Heading>Profile</Heading>
      <div className="mb-5 flex items-center gap-4">
        <Avatar className="h-16 w-16">
          {account.image && <AvatarImage src={account.image} alt="" />}
          <AvatarFallback className="text-lg">{getInitials(account.name ?? account.email)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-white">{account.name ?? account.email}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {ROLE_LABEL[account.role] ?? account.role} · Member since {new Date(account.createdAt).toLocaleDateString("en-GB", { month: "long", year: "numeric" })}
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              aria-label="Choose profile photo"
              onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])}
            />
            <Button type="button" variant="outline" size="sm" loading={photoBusy} onClick={() => fileRef.current?.click()}>
              <Camera className="mr-1.5 h-4 w-4" /> {account.image ? "Change photo" : "Add photo"}
            </Button>
            {account.image && (
              <Button type="button" variant="ghost" size="sm" disabled={photoBusy} onClick={removePhoto}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
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
        <FieldError>{error}</FieldError>
        <Button type="submit" variant="primary" loading={busy}>
          Save changes
        </Button>
      </form>
    </Panel>
  )
}

function PasswordPanel({ hasPassword }: { hasPassword: boolean }) {
  const { toast } = useToast()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [confirm, setConfirm] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const mismatch = confirm.length > 0 && confirm !== next

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (next !== confirm) return setError("The new passwords don't match.")
    setBusy(true)
    setError("")
    const res = await sendJson("/api/account/change-password", "POST", { current, next })
    setBusy(false)
    if (!res.ok) return setError(res.error ?? "Couldn't change password")
    toast("Password changed")
    setCurrent("")
    setNext("")
    setConfirm("")
  }

  return (
    <Panel className="p-4 sm:p-6">
      <Heading>Password</Heading>
      {!hasPassword ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">You sign in with Google, so there&apos;s no password to manage here.</p>
      ) : (
        <form onSubmit={save} className="space-y-4">
          <div>
            <FieldLabel htmlFor="pw-current">Current password</FieldLabel>
            <TextInput id="pw-current" type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
          </div>
          <div>
            <FieldLabel htmlFor="pw-next">New password (8+ characters)</FieldLabel>
            <TextInput id="pw-next" type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" />
          </div>
          <div>
            <FieldLabel htmlFor="pw-confirm">Confirm new password</FieldLabel>
            <TextInput id="pw-confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" />
            {mismatch && <p className="mt-1 text-xs text-red-700 dark:text-red-400">Passwords don&apos;t match.</p>}
          </div>
          <FieldError>{error}</FieldError>
          <Button type="submit" variant="primary" loading={busy} disabled={!current || next.length < 8 || next !== confirm}>
            Change password
          </Button>
        </form>
      )}
    </Panel>
  )
}

function NotificationsPanel({ account, onSaved }: { account: Account; onSaved: () => void }) {
  const { toast } = useToast()
  const [error, setError] = useState("")
  const isOwner = account.role === "OWNER"

  async function set(field: "smsOptIn" | "emailNotifications" | "marketingOptIn", value: boolean) {
    setError("")
    const res = await sendJson("/api/account", "PATCH", { [field]: value })
    if (!res.ok) return setError(res.error ?? "Couldn't save")
    toast("Preference saved")
    onSaved()
  }

  return (
    <Panel className="p-4 sm:p-6">
      <Heading>Notifications</Heading>
      <div className="space-y-4">
        {account.role !== "ADMIN" && (
          <ToggleRow
            checked={account.emailNotifications}
            onChange={(v) => set("emailNotifications", v)}
            title="Email me about my account"
            hint={isOwner ? "Message alerts and MOT / service reminders. Booking confirmations and manage links are always sent." : "Message alerts and reminders. Garage-specific alerts are managed in Settings below."}
          />
        )}
        {isOwner && (
          <ToggleRow
            checked={account.smsOptIn}
            onChange={(v) => set("smsOptIn", v)}
            title="Text me about my bookings"
            hint="Reminders and changes from garages that offer texts. Needs a UK mobile number in your profile."
          />
        )}
        <ToggleRow checked={account.marketingOptIn} onChange={(v) => set("marketingOptIn", v)} title="Tips and offers" hint="Occasional news from Quote My Garage. Off by default." />
        <FieldError>{error}</FieldError>
      </div>
    </Panel>
  )
}

function SecurityPanel() {
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)

  async function signOutEverywhere() {
    const res = await sendJson("/api/account/sessions", "DELETE")
    if (!res.ok) return toast(res.error ?? "Couldn't sign out other devices")
    await signOut({ callbackUrl: "/login" })
  }

  return (
    <Panel className="p-4 sm:p-6">
      <Heading>Security</Heading>
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">Lost a device or used a shared computer? Signing out everywhere ends every session, including this one.</p>
      <Button type="button" variant="outline" onClick={() => setConfirmOpen(true)}>
        <LogOut className="mr-1.5 h-4 w-4" /> Sign out everywhere
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Sign out everywhere?"
        description="You'll be signed out on every device, including this one, and will need to sign in again."
        confirmLabel="Sign out everywhere"
        onConfirm={signOutEverywhere}
      />
    </Panel>
  )
}

/** The signed-in user's own account screen — shared by the customer, garage and admin portals. */
export function AccountPage({ title = "Account", description = "Your profile, password and notifications." }: { title?: string; description?: string }) {
  const { data, loading, error, reload } = useApi<Account>("/api/account")

  return (
    <>
      <PageHeader title={title} description={description} />
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
            <ProfilePanel account={data} onSaved={reload} />
            <div className="space-y-6">
              <PasswordPanel hasPassword={data.hasPassword} />
              <NotificationsPanel account={data} onSaved={reload} />
            </div>
            <SecurityPanel />
            <AppOnDeviceCard />
          </div>
        )
      )}
    </>
  )
}
