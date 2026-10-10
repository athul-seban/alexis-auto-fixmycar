"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { Skeleton } from "@/components/ui/skeleton"
import { TextInput } from "@/components/ui/form-controls"
import { useApi } from "@/hooks/use-api"
import { formatCurrency, formatDate, getServiceLabel, timeAgo } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"
import { StatusPill } from "@/components/garage-portal/shared/StatusPill"

interface FoundUser {
  id: string
  name: string | null
  email: string
  phone: string | null
  role: string
  suspendedAt: string | null
  garage: { name: string } | null
}
interface Detail {
  user: FoundUser & { createdAt: string; lockedUntil: string | null; failedLoginAttempts: number; smsOptIn: boolean }
  garage: { name: string; status: string; isVerified: boolean; plan: string; subscriptionStatus: string | null; leadCredits: number; city: string } | null
  bookings: { id: string; reference: string | null; serviceType: string; status: string; scheduledAt: string; totalPrice: number; paymentStatus: string; source: string; customerName: string | null; garage: { name: string } }[]
  quotes: { id: string; serviceType: string; status: string; price: number | null; createdAt: string }[]
  vehicles: { id: string; registration: string; make: string; model: string; motDueDate: string | null }[]
  reviews: { id: string; rating: number; comment: string; createdAt: string; disputeStatus: string | null }[]
  jobRequests: { id: string; serviceType: string; status: string; city: string; createdAt: string }[]
  messageCount: number
}

function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

function Section({ title, empty, children }: { title: string; empty?: boolean; children: React.ReactNode }) {
  return (
    <Panel className="p-4 sm:p-5">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{title}</h3>
      {empty ? <p className="text-sm text-slate-500 dark:text-slate-400">Nothing yet.</p> : children}
    </Panel>
  )
}

/** Look up an account by email, name, phone or garage name and see their recent activity. Read-only; every open is audited. */
export function AdminSupportPage() {
  const [q, setQ] = useState("")
  const term = useDebounced(q.trim())
  const [selected, setSelected] = useState<string | null>(null)

  const results = useApi<{ users: FoundUser[] }>(term.length >= 3 ? `/api/admin/support?q=${encodeURIComponent(term)}` : null)
  const detail = useApi<Detail>(selected ? `/api/admin/support?userId=${encodeURIComponent(selected)}` : null)

  return (
    <>
      <PageHeader title="Support lookup" description="Find a customer or garage and see what they see. Read-only — opening an account is recorded in the audit log." />

      <Panel className="mb-6 p-4">
        <label htmlFor="support-q" className="mb-1.5 block text-sm font-semibold text-slate-700 dark:text-slate-300">Email, name, phone or garage</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <TextInput id="support-q" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" placeholder="Type at least 3 characters" autoComplete="off" />
        </div>
        {results.data && results.data.users.length === 0 && term.length >= 3 && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">No accounts match.</p>}
        {results.data && results.data.users.length > 0 && (
          <ul className="mt-3 divide-y divide-slate-100 dark:divide-white/10" aria-label="Matching accounts">
            {results.data.users.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => setSelected(u.id)} aria-pressed={selected === u.id} className="flex w-full cursor-pointer items-center justify-between gap-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-white/5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{u.garage?.name ?? u.name ?? u.email}</span>
                    <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{u.email}{u.phone ? ` · ${u.phone}` : ""}</span>
                  </span>
                  <span className="flex flex-shrink-0 items-center gap-2">
                    {u.suspendedAt && <StatusPill status="SUSPENDED" />}
                    <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">{u.role.toLowerCase()}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {selected && !detail.data && (detail.loading ? <Skeleton className="h-64 w-full rounded-xl" /> : detail.error && <p role="alert" className="text-sm text-red-700 dark:text-red-400">{detail.error}</p>)}

      {detail.data && selected && (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Account">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-slate-500 dark:text-slate-400">Name</dt><dd>{detail.data.user.name ?? "—"}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Email</dt><dd className="break-all">{detail.data.user.email}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Phone</dt><dd>{detail.data.user.phone ?? "—"}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Role</dt><dd>{detail.data.user.role.toLowerCase()}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Joined</dt><dd>{formatDate(detail.data.user.createdAt)}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Texts</dt><dd>{detail.data.user.smsOptIn ? "Opted in" : "Not opted in"}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Sign-in</dt>
              <dd>{detail.data.user.suspendedAt ? "Suspended" : detail.data.user.lockedUntil && new Date(detail.data.user.lockedUntil) > new Date() ? "Locked after failed attempts" : "Normal"}</dd>
              <dt className="text-slate-500 dark:text-slate-400">Messages</dt><dd>{detail.data.messageCount}</dd>
            </dl>
          </Section>

          {detail.data.garage && (
            <Section title="Garage">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-slate-500 dark:text-slate-400">Name</dt><dd>{detail.data.garage.name} ({detail.data.garage.city})</dd>
                <dt className="text-slate-500 dark:text-slate-400">Listing</dt><dd><StatusPill status={detail.data.garage.status} /> {detail.data.garage.isVerified && "· Verified"}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Plan</dt><dd>{detail.data.garage.plan.toLowerCase()}{detail.data.garage.subscriptionStatus ? ` (${detail.data.garage.subscriptionStatus})` : ""}</dd>
                <dt className="text-slate-500 dark:text-slate-400">Lead credits</dt><dd>{detail.data.garage.leadCredits}</dd>
              </dl>
            </Section>
          )}

          <Section title="Recent bookings" empty={detail.data.bookings.length === 0}>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-white/10">
              {detail.data.bookings.map((b) => (
                <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{b.reference ?? b.id.slice(0, 8)} · {getServiceLabel(b.serviceType)} · {detail.data!.garage ? (b.customerName ?? "Customer") : b.garage.name}<span className="block text-xs text-slate-500 dark:text-slate-400">{formatDate(b.scheduledAt)} · {formatCurrency(b.totalPrice)} · payment {b.paymentStatus.toLowerCase()}</span></span>
                  <StatusPill status={b.status} />
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Recent quotes" empty={detail.data.quotes.length === 0}>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-white/10">
              {detail.data.quotes.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                  <span>{getServiceLabel(x.serviceType)}<span className="block text-xs text-slate-500 dark:text-slate-400">{timeAgo(x.createdAt)}{x.price ? ` · ${formatCurrency(x.price)}` : ""}</span></span>
                  <StatusPill status={x.status} />
                </li>
              ))}
            </ul>
          </Section>

          {!detail.data.garage && (
            <Section title="Vehicles" empty={detail.data.vehicles.length === 0}>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-white/10">
                {detail.data.vehicles.map((v) => (
                  <li key={v.id} className="py-2">{v.registration} · {v.make} {v.model}{v.motDueDate && <span className="text-xs text-slate-500 dark:text-slate-400"> · MOT due {formatDate(v.motDueDate)}</span>}</li>
                ))}
              </ul>
            </Section>
          )}

          {!detail.data.garage && (
            <Section title="Job requests (as a guest, by email)" empty={detail.data.jobRequests.length === 0}>
              <ul className="divide-y divide-slate-100 text-sm dark:divide-white/10">
                {detail.data.jobRequests.map((j) => (
                  <li key={j.id} className="flex items-center justify-between gap-2 py-2"><span>{getServiceLabel(j.serviceType)} · {j.city}<span className="block text-xs text-slate-500 dark:text-slate-400">{timeAgo(j.createdAt)}</span></span><StatusPill status={j.status} /></li>
                ))}
              </ul>
            </Section>
          )}

          <Section title="Reviews" empty={detail.data.reviews.length === 0}>
            <ul className="divide-y divide-slate-100 text-sm dark:divide-white/10">
              {detail.data.reviews.map((r) => (
                <li key={r.id} className="py-2"><span className="font-semibold">{r.rating}★</span> <span className="text-slate-600 dark:text-slate-300">{r.comment.slice(0, 120)}</span>{r.disputeStatus && <span className="ml-2 text-xs text-yellow-700 dark:text-yellow-300">dispute {r.disputeStatus.toLowerCase()}</span>}</li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </>
  )
}
