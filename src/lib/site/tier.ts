import { effectivePlan, hasFeature, plansEnforced, PLANS, type PlanSubject } from "@/lib/portal/plans"
import { defaultPro, type SiteContent } from "@/lib/site/content"

// Two kinds of website. EVERY business gets the basic one: a full one-page site with a photo background, colours, text,
// locations, reviews and contact. The ADVANCED one ("Website Pro", part of the Premium plan, src/lib/portal/plans.ts) adds
// design options: more hero layouts, section photos, an announcement bar and no platform credit line.
//
// While plans aren't enforced (PLANS_ENFORCED off) the advanced options work for everyone and the builder says it is a
// preview of what will be paid. Once enforced, a business without the plan keeps what it saved but sees the basic design.

export interface SiteTier {
  /** May this business use and show the advanced options right now? */
  advanced: boolean
  /** Are plans being charged for at all? (When not, "advanced" is true for everyone.) */
  enforced: boolean
  /** The plan that includes the advanced website, for the upgrade message. */
  proPlan: { id: string; label: string; priceGbpPerMonth: number }
  /** The business's current plan label. */
  currentPlanLabel: string
}

export function siteTier(billing: PlanSubject): SiteTier {
  const pro = PLANS.PREMIUM
  return {
    advanced: hasFeature(billing, "websitePro"),
    enforced: plansEnforced(),
    proPlan: { id: pro.id, label: pro.label, priceGbpPerMonth: pro.priceGbpPerMonth },
    currentPlanLabel: effectivePlan(billing).label,
  }
}

/** What a basic website shows: the advanced settings put back to their defaults (the saved values stay in the database). */
export function withoutAdvanced(content: SiteContent): SiteContent {
  return { ...content, pro: defaultPro() }
}

/** Content as visitors should see it for this tier. */
export function contentForTier(content: SiteContent, tier: Pick<SiteTier, "advanced">): SiteContent {
  return tier.advanced ? content : withoutAdvanced(content)
}

/**
 * A save from the builder, for this tier. A business that can't use the advanced options can't change them, so its saved
 * advanced settings are kept exactly as they were (and come back if it upgrades), whatever the request says.
 */
export function mergeSavedContent(incoming: SiteContent, previous: SiteContent, tier: Pick<SiteTier, "advanced">): SiteContent {
  return tier.advanced ? incoming : { ...incoming, pro: previous.pro }
}
