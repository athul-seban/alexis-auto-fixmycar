import type { GarageContext } from "@/lib/garage-auth"
import { OrgError } from "@/lib/org/org-error"
import { orgFeatureEnabled, type OrgFeature } from "@/lib/org/features"

/** Stops a route when the feature isn't switched on for this business (see features.ts). Looks like "no such page". */
export function requireFeature(ctx: Pick<GarageContext, "organisation">, feature: OrgFeature): void {
  if (!orgFeatureEnabled(feature, ctx.organisation?.id)) throw new OrgError("FEATURE_OFF", "This isn't available yet.")
}
