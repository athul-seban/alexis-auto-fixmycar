// Staff management, extra locations and business websites ship dark: they are switched on per deployment with
//
//   ORG_FEATURES=staff,locations,sites     (or "all")
//   ORG_BETA_IDS=<organisation id>,<organisation id>     optional: only these businesses get them
//
// In production nothing is on unless ORG_FEATURES says so, so deploying changes nobody's experience. Outside production
// (local dev, tests, previews of a branch run locally) everything is on unless ORG_FEATURES is set to something else, so
// the screens can be built and tested without ceremony.

export type OrgFeature = "staff" | "locations" | "sites"

type Env = Record<string, string | undefined>

const list = (v: string | undefined) => (v ?? "").split(",").map((s) => s.trim()).filter(Boolean)

export function orgFeatureEnabled(feature: OrgFeature, organisationId?: string | null, env: Env = process.env): boolean {
  const configured = env.ORG_FEATURES
  const production = env.NODE_ENV === "production"

  if (configured === undefined || configured.trim() === "") {
    if (production) return false // dark by default where it matters
  } else {
    const on = list(configured)
    if (!on.includes("all") && !on.includes(feature)) return false
  }

  const beta = list(env.ORG_BETA_IDS)
  if (beta.length === 0) return true
  return !!organisationId && beta.includes(organisationId)
}
