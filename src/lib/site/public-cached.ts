import { unstable_cache } from "next/cache"
import { notFound, permanentRedirect } from "next/navigation"
import { siteOrigin } from "@/lib/org/host"
import { siteLabelTag } from "@/lib/site/cache"
import { loadPublicSite, type PublicSite, type PublicSiteResult } from "@/lib/site/public"

// A site is cached for a minute per address, and dropped the moment something that changes it is saved (see cache.ts). The
// cache stores only what visitors may see, never drafts.

export const SITE_CACHE_SECONDS = 60

/**
 * Part of every cache key. The cache outlives a deploy (it lives on disk locally and in the platform's data cache), so after
 * the shape of what is cached changes, the old entries would be handed to code that expects the new shape and crash it. Raise
 * this number whenever PublicSite (src/lib/site/public.ts) or the content it carries gains, loses or renames a field.
 */
export const SITE_CACHE_VERSION = 2

export function getPublicSite(label: string): Promise<PublicSiteResult> {
  return unstable_cache(() => loadPublicSite(label), ["public-site", `v${SITE_CACHE_VERSION}`, label], { tags: [siteLabelTag(label)], revalidate: SITE_CACHE_SECONDS })()
}

/** The published site for an address, or a real 404; an old address redirects (301/308) to the current one. */
export async function requirePublicSite(label: string): Promise<PublicSite> {
  const result = await getPublicSite(label)
  if (result.state === "missing") notFound()
  if (result.state === "redirect") {
    const target = siteOrigin(result.label, process.env.NEXT_PUBLIC_ROOT_DOMAIN, process.env.NEXT_PUBLIC_APP_URL)
    if (!target) notFound()
    permanentRedirect(target) // built from the stored label and the configured domain, never from the request
  }
  return result.site
}

export const appOrigin = (): string => (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/+$/, "")

/** The site's own address, or null when websites aren't configured. */
export const publicOrigin = (label: string): string | null => siteOrigin(label, process.env.NEXT_PUBLIC_ROOT_DOMAIN, process.env.NEXT_PUBLIC_APP_URL)
