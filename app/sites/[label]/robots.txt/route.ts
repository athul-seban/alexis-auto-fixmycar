import { isTenantLabel } from "@/lib/org/host"
import { getPublicSite, publicOrigin } from "@/lib/site/public-cached"

// robots.txt of ONE business site. A live site is open to crawlers and points at its own sitemap; anything else is a 404.

// Explicitly dynamic, like the sitemap: the answer depends on whether the site is live right now, never on the build.
export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ label: string }> }) {
  const { label } = await params
  if (!isTenantLabel(label)) return new Response("Not found", { status: 404 })
  const result = await getPublicSite(label)
  const origin = publicOrigin(label)
  if (result.state !== "ok" || !origin) return new Response("Not found", { status: 404 })
  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" } })
}
