"use client"

import { useState } from "react"
import { useSearchParams } from "next/navigation"
import { Check, CreditCard, Sparkles, Ticket } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { StatTile } from "@/components/ui/stat-tile"
import { sendJson, useApi } from "@/hooks/use-api"
import { cn } from "@/lib/utils"
import { PageHeader, Panel } from "@/components/garage-portal/shared/PageHeader"

interface PlanRow {
  id: "FREE" | "PRO" | "PREMIUM"
  label: string
  priceGbpPerMonth: number
  leadsPerMonth: number | null
  blurb: string
  features: Record<string, boolean>
  purchasable: boolean
}
interface BillingResponse {
  available: boolean
  enforced: boolean
  plan: { id: PlanRow["id"]; label: string; leadsPerMonth: number | null }
  subscription: { status: string | null; periodEnd: string | null; hasCustomer: boolean }
  leads: { usedThisMonth: number; credits: number }
  featured: { active: boolean; until: string | null }
  plans: PlanRow[]
  products: { credits: { credits: number; pricePence: number; label: string }; featured: { days: number; pricePence: number; label: string } }
  transactions: { id: string; delta: number; reason: string; createdAt: string }[]
}

const FEATURE_LABELS: Record<string, string> = {
  insights: "Insights & reports",
  sms: "Text reminders",
  deposits: "Online deposits",
  widget: "Booking widget",
}
const REASONS: Record<string, string> = { PURCHASE: "Bought", LEAD: "Used on a lead", GRANT: "Granted", REFUND: "Returned" }
const pounds = (pence: number) => `£${(pence / 100).toFixed(pence % 100 === 0 ? 0 : 2)}`
const date = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "")

export function BillingPage() {
  const { data, error, reload } = useApi<BillingResponse>("/api/garage/billing")
  const params = useSearchParams()
  const returned = params.get("billing")
  const [busy, setBusy] = useState<string | null>(null)
  const [actionError, setActionError] = useState("")

  async function go(action: string, extra: Record<string, string> = {}) {
    setBusy(action + (extra.plan ?? ""))
    setActionError("")
    const res = await sendJson<{ url: string }>("/api/garage/billing", "POST", { action, ...extra })
    if (!res.ok || !res.data) {
      setBusy(null)
      return setActionError(res.error ?? "Couldn't start checkout")
    }
    window.location.assign(res.data.url) // Stripe-hosted page
  }

  return (
    <>
      <PageHeader title="Plan & billing" description="Your subscription, lead credits and featured placement." />

      {returned && returned !== "cancelled" && (
        <p role="status" className="mb-4 rounded-lg bg-green-50 p-3 text-sm text-green-800 dark:bg-green-500/10 dark:text-green-300">
          Thanks — payment received. Your account updates within a few moments.{" "}
          <button className="font-semibold underline" onClick={reload}>Refresh</button>
        </p>
      )}
      {actionError && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{actionError}</p>}

      {error && !data ? (
        <Panel className="p-6 text-center text-sm text-red-700 dark:text-red-400" role="alert">{error}</Panel>
      ) : !data ? (
        <div className="space-y-4"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-64 w-full rounded-xl" /></div>
      ) : (
        <div className="space-y-6">
          {!data.available && (
            <p role="status" className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              Billing isn&apos;t switched on for the platform yet, so plans and credits can&apos;t be bought. Check back soon.
            </p>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <StatTile label="Current plan" value={data.plan.label} icon={CreditCard} tone="blue" hint={data.subscription.periodEnd ? `Renews ${date(data.subscription.periodEnd)}` : undefined} />
            <StatTile
              label="Leads answered this month"
              value={data.plan.leadsPerMonth === null ? `${data.leads.usedThisMonth} (no limit)` : `${data.leads.usedThisMonth} of ${data.plan.leadsPerMonth}`}
              icon={Ticket}
              tone="purple"
              hint={data.enforced ? "Past the limit, each lead uses one credit." : "Limits aren't being applied yet."}
            />
            <StatTile label="Lead credits" value={data.leads.credits} icon={Sparkles} tone="orange" />
          </div>

          <section aria-labelledby="plans-h">
            <h2 id="plans-h" className="mb-3 text-lg font-bold text-slate-900 dark:text-white">Plans</h2>
            <div className="grid gap-4 md:grid-cols-3">
              {data.plans.map((p) => {
                const current = p.id === data.plan.id
                return (
                  <Panel key={p.id} className={cn("flex flex-col p-5", current && "ring-2 ring-[#1E3A5F]")}>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">{p.label}</h3>
                    <p className="mt-1 text-2xl font-bold text-slate-900 dark:text-white">
                      {`£${p.priceGbpPerMonth}`}
                      {p.priceGbpPerMonth > 0 && <span className="text-sm font-normal text-slate-500 dark:text-slate-400"> /month</span>}
                    </p>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{p.blurb}</p>
                    <ul className="mt-3 flex-1 space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
                      <li className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden />{p.leadsPerMonth === null ? "Unlimited leads" : `${p.leadsPerMonth} leads a month`}</li>
                      {Object.entries(p.features).filter(([, on]) => on).map(([k]) => (
                        <li key={k} className="flex items-center gap-2"><Check className="h-4 w-4 text-green-600" aria-hidden />{FEATURE_LABELS[k] ?? k}</li>
                      ))}
                    </ul>
                    <div className="mt-4">
                      {current ? (
                        data.subscription.hasCustomer && p.id !== "FREE" ? (
                          <Button variant="outline" className="w-full" loading={busy === "portal"} onClick={() => go("portal")}>Manage subscription</Button>
                        ) : (
                          <p className="text-center text-sm font-semibold text-slate-500 dark:text-slate-400">Your plan</p>
                        )
                      ) : p.id === "FREE" ? (
                        data.subscription.hasCustomer ? <Button variant="outline" className="w-full" loading={busy === "portal"} onClick={() => go("portal")}>Downgrade in billing portal</Button> : null
                      ) : (
                        <Button className="w-full" disabled={!data.available || !p.purchasable} loading={busy === "subscribe" + p.id} onClick={() => go("subscribe", { plan: p.id })}>
                          Choose {p.label}
                        </Button>
                      )}
                    </div>
                  </Panel>
                )
              })}
            </div>
          </section>

          <div className="grid gap-4 md:grid-cols-2">
            <Panel className="p-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Lead credits</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Answer more customer requests than your plan includes. One credit is used each time you quote on a lead past your monthly limit.
              </p>
              <Button className="mt-4" disabled={!data.available} loading={busy === "credits"} onClick={() => go("credits")}>
                Buy {data.products.credits.credits} credits — {pounds(data.products.credits.pricePence)}
              </Button>
              {data.transactions.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 text-sm dark:divide-white/10" aria-label="Recent credit activity">
                  {data.transactions.map((t) => (
                    <li key={t.id} className="flex justify-between py-1.5">
                      <span className="text-slate-600 dark:text-slate-300">{REASONS[t.reason] ?? t.reason} · {date(t.createdAt)}</span>
                      <span className={cn("font-semibold", t.delta > 0 ? "text-green-700 dark:text-green-400" : "text-slate-700 dark:text-slate-300")}>{t.delta > 0 ? `+${t.delta}` : t.delta}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel className="p-5">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Featured listing</h2>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                Appear at the top of search results and area pages, labelled &ldquo;Featured&rdquo;, for {data.products.featured.days} days.
              </p>
              {data.featured.active && <p className="mt-3 text-sm font-semibold text-green-700 dark:text-green-400">Featured until {date(data.featured.until)}</p>}
              <Button className="mt-4" disabled={!data.available} loading={busy === "featured"} onClick={() => go("featured")}>
                {data.featured.active ? "Extend" : "Feature my garage"} — {pounds(data.products.featured.pricePence)}
              </Button>
            </Panel>
          </div>
        </div>
      )}
    </>
  )
}
