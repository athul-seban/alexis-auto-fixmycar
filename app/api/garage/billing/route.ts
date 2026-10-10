import { NextResponse } from "next/server"
import { z } from "zod"
import { prisma } from "@/lib/prisma"
import { withGarage } from "@/lib/garage-auth"
import { stripeConfigured } from "@/lib/stripe"
import {
  BillingError,
  createBillingPortal,
  createCreditsCheckout,
  createFeaturedCheckout,
  createSubscriptionCheckout,
} from "@/lib/portal/billing-service"
import { CREDIT_PACK, effectivePlan, FEATURED_PRODUCT, isFeatured, monthStart, PLANS, PLAN_IDS, plansEnforced, type PlanId } from "@/lib/portal/plans"

/** Where the garage stands: plan, lead usage this month, credits, featured status, and what is on sale. */
export const GET = withGarage("Garage billing GET", async (_req, { garage }) => {
  const now = new Date()
  const [usedThisMonth, transactions] = await Promise.all([
    prisma.jobResponse.count({ where: { garageId: garage.id, createdAt: { gte: monthStart(now) } } }),
    prisma.leadCreditTransaction.findMany({ where: { garageId: garage.id }, orderBy: { createdAt: "desc" }, take: 10 }),
  ])
  const plan = effectivePlan(garage)
  return NextResponse.json({
    available: stripeConfigured(),
    enforced: plansEnforced(),
    plan: { id: plan.id, label: plan.label, leadsPerMonth: plan.leadsPerMonth },
    subscription: { status: garage.subscriptionStatus, periodEnd: garage.subscriptionPeriodEnd, hasCustomer: Boolean(garage.stripeCustomerId) },
    leads: { usedThisMonth, credits: garage.leadCredits },
    featured: { active: isFeatured(garage, now), until: garage.featuredUntil },
    plans: PLAN_IDS.map((id) => ({
      id,
      label: PLANS[id].label,
      priceGbpPerMonth: PLANS[id].priceGbpPerMonth,
      leadsPerMonth: PLANS[id].leadsPerMonth,
      blurb: PLANS[id].blurb,
      features: PLANS[id].features,
      purchasable: id !== "FREE" && Boolean(PLANS[id].priceEnv && process.env[PLANS[id].priceEnv!]),
    })),
    products: { credits: CREDIT_PACK, featured: FEATURED_PRODUCT },
    transactions,
  })
})

const actionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("subscribe"), plan: z.enum(["PRO", "PREMIUM"]) }),
  z.object({ action: z.literal("portal") }),
  z.object({ action: z.literal("credits") }),
  z.object({ action: z.literal("featured") }),
])

/** Start a Stripe-hosted checkout (or open the billing portal); the response is the URL to send the garage to. */
export const POST = withGarage(
  "Garage billing POST",
  async (req, { garage }) => {
    const input = actionSchema.parse(await req.json().catch(() => ({})))
    try {
      let url: string
      switch (input.action) {
        case "subscribe":
          url = await createSubscriptionCheckout(garage, input.plan as PlanId)
          break
        case "portal":
          url = await createBillingPortal(garage)
          break
        case "credits":
          url = await createCreditsCheckout(garage)
          break
        case "featured":
          if (garage.status !== "APPROVED") return NextResponse.json({ error: "Your listing must be live before it can be featured." }, { status: 409 })
          url = await createFeaturedCheckout(garage)
          break
      }
      return NextResponse.json({ url })
    } catch (err) {
      if (err instanceof BillingError) return NextResponse.json({ error: err.message, code: err.code }, { status: 409 })
      throw err
    }
  },
  { write: true }
)
