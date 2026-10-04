import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { absoluteUrl } from "@/lib/portal/links"

// Regenerate hourly rather than on every crawl; approved garages change rarely.
export const revalidate = 3600

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const garages = await prisma.garage.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true } })

  const pages: MetadataRoute.Sitemap = ["/", "/search", "/how-it-works", "/for-garages", "/post-job"].map((path) => ({
    url: absoluteUrl(path),
    changeFrequency: path === "/" ? "daily" : "weekly",
    priority: path === "/" ? 1 : 0.7,
  }))

  return [
    ...pages,
    ...garages.map((g) => ({ url: absoluteUrl(`/garage/${g.slug}`), lastModified: g.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
  ]
}
