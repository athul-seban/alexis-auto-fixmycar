// Garage subscription plans. THE one place to change plan names, prices, limits and which features each plan unlocks.
//
// Nothing here is enforced until PLANS_ENFORCED=true, so deploying this code changes no garage's experience: switch
// it on once the plan details below are agreed and the Stripe prices (STRIPE_PRICE_PRO / STRIPE_PRICE_PREMIUM) exist.

export type PlanId = "FREE" | "PRO" | "PREMIUM"

export type PlanFeature = "insights" | "sms" | "deposits" | "widget"

export interface PlanDef {
  id: PlanId
  label: string
  /** Shown to garages; the real price is the Stripe Price the env var below points at. */
  priceGbpPerMonth: number
  /** Env var holding the Stripe Price id for this plan (none for the free plan). */
  priceEnv: string | null
  /** Marketplace job requests a garage may answer per calendar month before pay-per-lead credits are used. null = no limit. */
  leadsPerMonth: number | null
  features: Record<PlanFeature, boolean>
  blurb: string
}

export const PLANS: Record<PlanId, PlanDef> = {
  FREE: {
    id: "FREE",
    label: "Free",
    priceGbpPerMonth: 0,
    priceEnv: null,
    leadsPerMonth: 3,
    features: { insights: false, sms: false, deposits: false, widget: true },
    blurb: "A listing and your first few leads each month.",
  },
  PRO: {
    id: "PRO",
    label: "Pro",
    priceGbpPerMonth: 29,
    priceEnv: "STRIPE_PRICE_PRO",
    leadsPerMonth: 20,
    features: { insights: true, sms: true, deposits: true, widget: true },
    blurb: "More leads, online deposits, text reminders and insights.",
  },
  PREMIUM: {
    id: "PREMIUM",
    label: "Premium",
    priceGbpPerMonth: 59,
    priceEnv: "STRIPE_PRICE_PREMIUM",
    leadsPerMonth: null,
    features: { insights: true, sms: true, deposits: true, widget: true },
    blurb: "Unlimited leads and everything in Pro.",
  },
}

export const PLAN_IDS = Object.keys(PLANS) as PlanId[]

/** Price of a pay-per-lead credit bundle, in pence, and how many credits it holds. */
export const CREDIT_PACK = { credits: 10, pricePence: 2500, label: "10 lead credits" } as const

export const plansEnforced = () => process.env.PLANS_ENFORCED === "true"

export const isPlanId = (v: unknown): v is PlanId => typeof v === "string" && v in PLANS

/** Stripe subscription statuses that still entitle the garage to its plan (past_due keeps access while Stripe retries). */
const ENTITLED = new Set(["active", "trialing", "past_due"])

export interface PlanSubject {
  plan: string
  subscriptionStatus: string | null
}

/** The plan a garage actually gets: its subscribed plan while the subscription is live, otherwise FREE. */
export function effectivePlan(g: PlanSubject): PlanDef {
  if (isPlanId(g.plan) && g.plan !== "FREE" && g.subscriptionStatus && ENTITLED.has(g.subscriptionStatus)) return PLANS[g.plan]
  return PLANS.FREE
}

/** Does this garage's plan unlock a feature? Always true while plans aren't being enforced. */
export function hasFeature(g: PlanSubject, feature: PlanFeature): boolean {
  return !plansEnforced() || effectivePlan(g).features[feature]
}

export type LeadDecision = { allowed: true; useCredit: boolean } | { allowed: false; reason: "LIMIT_REACHED" }

/** May the garage answer another lead this month, and does it cost a credit? */
export function leadDecision(g: PlanSubject & { leadCredits: number }, usedThisMonth: number): LeadDecision {
  if (!plansEnforced()) return { allowed: true, useCredit: false }
  const limit = effectivePlan(g).leadsPerMonth
  if (limit === null || usedThisMonth < limit) return { allowed: true, useCredit: false }
  if (g.leadCredits > 0) return { allowed: true, useCredit: true }
  return { allowed: false, reason: "LIMIT_REACHED" }
}

/** First instant of the calendar month containing `now` (UTC). */
export function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
}

export const isFeatured = (g: { featuredUntil: Date | null }, now = new Date()) =>
  Boolean(g.featuredUntil && g.featuredUntil.getTime() > now.getTime())

/** How long a featured placement lasts per purchase, and its price in pence. */
export const FEATURED_PRODUCT = { days: 30, pricePence: 4900, label: "Featured listing — 30 days" } as const

/** New end date for a featured placement: extends the current one if still running, otherwise starts now. */
export function extendFeatured(current: Date | null, now: Date, days: number = FEATURED_PRODUCT.days): Date {
  const base = current && current.getTime() > now.getTime() ? current : now
  return new Date(base.getTime() + days * 86_400_000)
}
