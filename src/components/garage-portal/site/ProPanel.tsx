"use client"

import Link from "next/link"
import { Check, Lock, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Panel } from "@/components/garage-portal/shared/PageHeader"
import { cn } from "@/lib/utils"
import type { SiteTier } from "@/lib/site/tier"

// The advanced website ("Website Pro") in the builder: a card that says what it is and what it costs, and a gate that shows the
// advanced controls in the places they belong while locking them for a business that doesn't have the plan.

const BASIC = [
  "Your own address, like yourgarage.example.com",
  "A banner photo under a dark or brand-colour layer, so the words always read",
  "Your colours, font and corner style",
  "About you, services, every location with its opening hours, reviews, photos and questions",
  "Call and book buttons that stay on screen on a phone",
]

const PRO = [
  "Everything in Basic",
  "A split banner: your words beside a framed photo",
  "Banner height and where the photo is anchored",
  "A photo beside your About text and behind your contact details",
  "A notice bar for holiday hours and offers",
  "Remove the “Bookings and quotes by Quote My Garage” line",
]

const SOON = ["Your own domain name, like www.yourgarage.co.uk"]

export const money = (n: number) => `£${n}`

/** Where this business stands, in a sentence. */
export function tierSummary(tier: SiteTier): string {
  const plan = `${tier.proPlan.label} plan (${money(tier.proPlan.priceGbpPerMonth)} a month)`
  if (!tier.enforced) return `Website Pro is part of the ${plan}. Plans aren't being charged yet, so everything in it is free to use for now.`
  if (tier.advanced) return `Website Pro is included in your ${tier.currentPlanLabel} plan.`
  return `Website Pro is part of the ${plan}. You're on ${tier.currentPlanLabel}, so your website uses the Basic design. You can still choose the settings below to see what they do; they apply once you upgrade.`
}

export function ProBadge({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 dark:bg-amber-500/15 dark:text-amber-200", className)}>
      <Sparkles className="h-3 w-3" aria-hidden /> Website Pro
    </span>
  )
}

function Status({ tier }: { tier: SiteTier }) {
  const [label, tone] = !tier.enforced ? ["Free for now", "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"] : tier.advanced ? ["Active", "bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-300"] : ["Not on your plan", "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200"]
  return <span className={cn("rounded-full px-2.5 py-1 text-xs font-semibold", tone)}>{label}</span>
}

function List({ items, soon }: { items: string[]; soon?: boolean }) {
  return (
    <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300">
      {items.map((t) => (
        <li key={t} className="flex gap-2">
          <Check className={cn("mt-0.5 h-4 w-4 flex-shrink-0", soon ? "text-slate-400" : "text-green-600 dark:text-green-400")} aria-hidden />
          <span>
            {t}
            {soon ? <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-600 dark:bg-white/10 dark:text-slate-300">Coming soon</span> : null}
          </span>
        </li>
      ))}
    </ul>
  )
}

/** The comparison card: Basic (every plan) against Website Pro, with the price and the way to upgrade. */
export function ProPanel({ tier }: { tier: SiteTier }) {
  const locked = tier.enforced && !tier.advanced
  return (
    <Panel className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-slate-900 dark:text-white">Basic or Website Pro</h2>
        <Status tier={tier} />
      </div>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{tierSummary(tier)}</p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <section aria-labelledby="site-basic" className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <h3 id="site-basic" className="text-base font-bold text-slate-900 dark:text-white">Basic</h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">On every plan</p>
          <List items={BASIC} />
        </section>
        <section aria-labelledby="site-pro" className={cn("rounded-xl border-2 p-4", locked ? "border-amber-300 dark:border-amber-500/40" : "border-[#1E3A5F] dark:border-blue-400")}>
          <h3 id="site-pro" className="flex flex-wrap items-center gap-2 text-base font-bold text-slate-900 dark:text-white">
            Website Pro <ProBadge />
          </h3>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            {money(tier.proPlan.priceGbpPerMonth)} a month, as part of the {tier.proPlan.label} plan
          </p>
          <List items={PRO} />
          <div className="mt-3 border-t border-slate-200 pt-3 dark:border-white/10">
            <List items={SOON} soon />
          </div>
        </section>
      </div>

      {locked ? (
        <div className="mt-4">
          <Button asChild variant="primary">
            <Link href="/garage-dashboard/billing">See plans and upgrade</Link>
          </Button>
        </div>
      ) : null}
    </Panel>
  )
}

/**
 * A block of advanced controls. For a business without the plan the controls are shown but locked (a disabled fieldset
 * disables everything inside it), with a note and the way to upgrade. The server ignores their changes either way.
 */
export function ProGate({ tier, title, children, className }: { tier: SiteTier; title: string; children: React.ReactNode; className?: string }) {
  const locked = tier.enforced && !tier.advanced
  return (
    <fieldset disabled={locked} className={cn("min-w-0 rounded-xl border border-dashed border-amber-300 bg-amber-50/40 p-4 dark:border-amber-500/40 dark:bg-amber-500/5", className)}>
      <legend className="flex items-center gap-2 px-1 text-sm font-bold text-slate-900 dark:text-white">
        {title} <ProBadge />
        {locked ? <Lock className="h-3.5 w-3.5 text-slate-500" aria-label="Locked" /> : null}
      </legend>
      {locked ? (
        <p className="mb-3 text-xs text-slate-600 dark:text-slate-300">
          Part of the {tier.proPlan.label} plan.{" "}
          <Link href="/garage-dashboard/billing" className="font-semibold text-[#1E3A5F] underline underline-offset-2 dark:text-blue-300">See plans</Link>
        </p>
      ) : null}
      <div className={cn("space-y-4", locked && "opacity-60")}>{children}</div>
    </fieldset>
  )
}
