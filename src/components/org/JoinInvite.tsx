"use client"

import { useState } from "react"
import Link from "next/link"
import { signIn, signOut } from "next-auth/react"
import { AlertCircle, CheckCircle, Eye, EyeOff } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import type { InvitePreview } from "@/lib/org/staff-service"

interface Props {
  token: string
  preview: InvitePreview
  /** The email of whoever is signed in right now, if anyone. */
  signedInEmail: string | null
}

function Notice({ title, children, tone = "error" }: { title: string; children: React.ReactNode; tone?: "error" | "ok" }) {
  const Icon = tone === "ok" ? CheckCircle : AlertCircle
  return (
    <div className="py-4 text-center">
      <Icon className={`mx-auto mb-4 h-14 w-14 ${tone === "ok" ? "text-green-500" : "text-red-500"}`} aria-hidden />
      <h1 className="mb-2 text-xl font-bold text-slate-900">{title}</h1>
      <div className="text-sm text-slate-500">{children}</div>
    </div>
  )
}

const DEAD: Record<string, { title: string; body: string }> = {
  invalid: { title: "This link isn't valid", body: "Check you copied the whole link from the email, or ask for a new invitation." },
  expired: { title: "This invitation has expired", body: "Invitations last 7 days. Ask the garage to send you a new one." },
  used: { title: "This invitation has already been used", body: "If that was you, just sign in." },
  revoked: { title: "This invitation was cancelled", body: "Ask the garage to send you a new one." },
}

export function JoinInvite({ token, preview, signedInEmail }: Props) {
  const [name, setName] = useState("")
  const [password, setPassword] = useState("")
  const [confirm, setConfirm] = useState("")
  const [show, setShow] = useState(false)
  const [understand, setUnderstand] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [done, setDone] = useState<null | { converted: boolean }>(null)

  if (preview.state !== "ok") {
    const d = DEAD[preview.state] ?? DEAD.invalid
    return (
      <Notice title={d.title}>
        <p>{d.body}</p>
        <Link href="/login" className="mt-4 inline-block font-semibold text-[#1E3A5F] hover:underline">Go to sign in</Link>
      </Notice>
    )
  }

  const email = preview.email ?? ""
  const business = preview.businessName ?? "this garage"
  const account = preview.account ?? "none"
  const signedInAsInvitee = signedInEmail !== null && signedInEmail.toLowerCase() === email.toLowerCase()

  if (account === "blocked") {
    return (
      <Notice title="This account can't join a garage team">
        <p>The account for {email} can&apos;t be added to a garage team. Contact support if you think that&apos;s a mistake.</p>
      </Notice>
    )
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setError("")
    if (account === "none") {
      if (name.trim().length < 2) return setError("Enter your name.")
      if (password !== confirm) return setError("The passwords don't match.")
    }
    if (account === "customer" && !understand) return setError("Tick the box to confirm you understand.")

    setBusy(true)
    try {
      const res = await fetch(`/api/join/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(account === "none" ? { name, password } : {}), ...(account === "customer" ? { confirmConvert: true } : {}) }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? "Something went wrong.")
      if (account === "none") {
        // A brand-new account: sign them straight in with the password they just chose.
        const result = await signIn("credentials", { email, password, redirect: false })
        window.location.href = result?.error ? "/login" : "/garage-dashboard"
        return
      }
      setDone({ converted: Boolean(data.converted) })
      if (data.converted) await signOut({ redirect: false })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.")
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <Notice title={`You've joined ${business}`} tone="ok">
        {done.converted ? (
          <p>Your account is now a garage account. Sign in again to open the garage portal; your bookings and vehicles are kept.</p>
        ) : (
          <p>You can now use the garage portal.</p>
        )}
        <Link href={done.converted ? "/login?callbackUrl=/garage-dashboard" : "/garage-dashboard"} className="mt-4 inline-block font-semibold text-[#1E3A5F] hover:underline">
          {done.converted ? "Sign in" : "Open the garage portal"}
        </Link>
      </Notice>
    )
  }

  const heading = (
    <>
      <h1 className="mb-1 text-2xl font-bold text-slate-900">Join {business}</h1>
      <p className="mb-6 text-sm text-slate-500">
        {preview.inviterName ? `${preview.inviterName} has` : "You've been"} invited <strong>{email}</strong>
        {preview.roleNames?.length ? ` as ${preview.roleNames.join(", ")}` : ""}.
      </p>
    </>
  )

  const errorBox = error && (
    <div role="alert" className="mb-5 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
      <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden />
      {error}
    </div>
  )

  // Already has an account: it must be the one signed in (the emailed link proves the inbox, not who is at the keyboard).
  if (account !== "none" && !signedInAsInvitee) {
    return (
      <>
        {heading}
        <p className="mb-5 text-sm text-slate-600">
          You already have an account with this email. Sign in as <strong>{email}</strong> to accept{signedInEmail ? ` (you're signed in as ${signedInEmail})` : ""}.
        </p>
        <Link
          href={`/login?callbackUrl=${encodeURIComponent(`/join/${token}`)}`}
          className="inline-flex h-12 w-full items-center justify-center rounded-lg bg-[#1E3A5F] px-6 text-base font-semibold text-white hover:bg-[#2D5A8E]"
        >
          Sign in to accept
        </Link>
      </>
    )
  }

  return (
    <>
      {heading}
      {errorBox}
      <form onSubmit={submit} className="space-y-4">
        {account === "none" ? (
          <>
            <Input label="Your name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" required />
            <div className="relative">
              <Input label="Choose a password" type={show ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters" autoComplete="new-password" required />
              <button type="button" aria-label={show ? "Hide password" : "Show password"} aria-pressed={show} onClick={() => setShow(!show)} className="absolute right-3 top-8 cursor-pointer text-slate-500 hover:text-slate-700">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            <Input label="Confirm password" type={show ? "text" : "password"} value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />
          </>
        ) : account === "customer" ? (
          <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
            <input type="checkbox" className="mt-0.5 h-4 w-4" checked={understand} onChange={(e) => setUnderstand(e.target.checked)} />
            <span>
              This is a customer account. Accepting turns it into a <strong>garage staff account</strong>. Your bookings and vehicles are kept, but you&apos;ll use the garage portal instead of the customer pages while you&apos;re on this team.
            </span>
          </label>
        ) : null}
        <Button type="submit" loading={busy} className="w-full" size="lg">
          {account === "none" ? "Create account and join" : `Join ${business}`}
        </Button>
      </form>
    </>
  )
}
