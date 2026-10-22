import { isTenantLabel } from "@/lib/org/host"
import { getPublicSite, publicOrigin } from "@/lib/site/public-cached"

// The sitemap of ONE business site: its single page. A search engine fetching <label>.<root>/sitemap.xml gets this (the
// proxy rewrites it here); unknown or unpublished sites return a plain 404, not an empty sitemap.

// Without this Next sees a handler that never reads the request and builds it as static, caching each address's answer
// forever: a site taken offline would keep serving its sitemap. The Cache-Control below is what lets a CDN keep it briefly.
export const dynamic = "force-dynamic"

export async function GET(_req: Request, { params }: { params: Promise<{ label: string }> }) {
  const { label } = await params
  if (!isTenantLabel(label)) return new Response("Not found", { status: 404 })
  const result = await getPublicSite(label)
  const origin = publicOrigin(label)
  if (result.state !== "ok" || !origin) return new Response("Not found", { status: 404 })

  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${origin}/</loc><lastmod>${result.site.updatedAt}</lastmod><changefreq>monthly</changefreq><priority>1.0</priority></url>\n</urlset>\n`
  return new Response(xml, { headers: { "Content-Type": "application/xml; charset=utf-8", "Cache-Control": "public, max-age=300, s-maxage=300" } })
}
