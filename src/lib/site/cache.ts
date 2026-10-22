import { revalidateTag } from "next/cache"
import { prisma } from "@/lib/prisma"

// Public site data is cached for a minute (unstable_cache in the site page) so a busy site doesn't hit the database on
// every view. Anything that changes what a site shows (publishing, taking it down, an admin decision, a location's address
// or opening hours) calls invalidateSite(), which drops the cached copy for every address the site has had.

export const siteLabelTag = (label: string) => `site-label:${label}`

/** Best-effort: outside a request (scripts, unit tests) there is no cache to clear and that is fine. Never throws. */
export async function invalidateSite(organisationId: string): Promise<void> {
  try {
    const domains = await prisma.siteDomain.findMany({ where: { site: { organisationId } }, select: { host: true } })
    // expire: 0 drops the copy at once. The default ("max") serves the stale copy to the next visitor while it refreshes,
    // which would show an owner their old site straight after they publish.
    for (const d of domains) revalidateTag(siteLabelTag(d.host), { expire: 0 })
  } catch {
    /* nothing cached, or not inside a request */
  }
}

/** The location changed (address, hours, status): refresh its business's site, if it has one. */
export async function invalidateSiteForGarage(garageId: string): Promise<void> {
  try {
    const g = await prisma.garage.findUnique({ where: { id: garageId }, select: { organisationId: true } })
    if (g?.organisationId) await invalidateSite(g.organisationId)
  } catch {
    /* best effort */
  }
}
