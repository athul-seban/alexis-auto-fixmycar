import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { absoluteUrl } from "@/lib/portal/links"

// Built on request, never at deploy time: a build must not depend on the database being reachable (CI has an empty
// one, and a deploy shouldn't fail because the database is briefly down). Crawlers hit this rarely, and the CDN can
// cache the response, so there is no need for it to be prerendered.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const pages: MetadataRoute.Sitemap = ["/", "/search", "/how-it-works", "/for-garages", "/post-job", "/blog"].map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }))

  try {
    const [garages, articles] = await Promise.all([
      prisma.garage.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true } }),
      prisma.article.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
    ])
    return [
      ...pages,
      ...articles.map((a) => ({ url: absoluteUrl(`/blog/${a.slug}`), lastModified: a.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
      ...garages.map((g) => ({ url: absoluteUrl(`/garage/${g.slug}`), lastModified: g.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ]
  } catch (err) {
    // Serve the static pages rather than a 500: a partial sitemap is better than none.
    console.error("[sitemap] couldn't load garages:", err)
    return pages
  }
}
