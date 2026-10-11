import type { MetadataRoute } from "next"
import { prisma } from "@/lib/prisma"
import { absoluteUrl } from "@/lib/portal/links"
import { LANDING_SERVICES, listCities, slugify } from "@/lib/locations"
import { parseServiceList } from "@/lib/garage-mapper"
import { LOCALES, LOCALE_META, localePath } from "@/lib/i18n/config"
import { getLegalPage, LEGAL_PAGES } from "@/lib/legal"

// Built on request, never at deploy time: a build must not depend on the database being reachable (CI has an empty
// one, and a deploy shouldn't fail because the database is briefly down). Crawlers hit this rarely, and the CDN can
// cache the response, so there is no need for it to be prerendered.
export const dynamic = "force-dynamic"

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const untranslated = ["/search", "/post-job", "/blog"]
  const pages: MetadataRoute.Sitemap = [
    // Translated pages: one entry per language, each listing all the others (hreflang).
    ...["/", "/how-it-works", "/for-garages", "/garages"].flatMap((path) =>
      LOCALES.map((l) => ({
        url: absoluteUrl(localePath(l, path)),
        changeFrequency: path === "/" ? ("daily" as const) : ("weekly" as const),
        priority: path === "/" ? 1 : 0.7,
        alternates: { languages: Object.fromEntries(LOCALES.map((x) => [LOCALE_META[x].htmlLang, absoluteUrl(localePath(x, path))])) },
      }))
    ),
    ...untranslated.map((path) => ({ url: absoluteUrl(path), changeFrequency: "weekly" as const, priority: 0.7 })),
  ]

  try {
    const [garages, articles, cities] = await Promise.all([
      prisma.garage.findMany({ where: { status: "APPROVED" }, select: { slug: true, updatedAt: true, city: true, services: true } }),
      prisma.article.findMany({ where: { status: "PUBLISHED" }, select: { slug: true, updatedAt: true } }),
      listCities(),
    ])
    // City pages exist for every city with a garage; city + service pages only where a garage there offers the service.
    const offered = new Set<string>()
    for (const g of garages) {
      const city = slugify(g.city)
      for (const t of parseServiceList(g.services) as string[]) {
        const svc = LANDING_SERVICES.find((s) => s.type === t)
        if (svc && city) offered.add(`${city}/${svc.slug}`)
      }
    }
    // Legal pages exist only once the business has published them; a language without its own text is left out
    // (it would just repeat the English page).
    const legal: MetadataRoute.Sitemap = []
    for (const def of LEGAL_PAGES) {
      for (const l of LOCALES) {
        const page = await getLegalPage(def.slug, l)
        if (page && !page.fallback) legal.push({ url: absoluteUrl(localePath(l, `/${def.slug}`)), changeFrequency: "yearly", priority: 0.3 })
      }
    }
    return [
      ...pages,
      ...legal,
      ...cities.map((c) => ({ url: absoluteUrl(`/garages/${c.slug}`), changeFrequency: "weekly" as const, priority: 0.7 })),
      ...[...offered].sort().map((path) => ({ url: absoluteUrl(`/garages/${path}`), changeFrequency: "weekly" as const, priority: 0.6 })),
      ...articles.map((a) => ({ url: absoluteUrl(`/blog/${a.slug}`), lastModified: a.updatedAt, changeFrequency: "monthly" as const, priority: 0.6 })),
      ...garages.map((g) => ({ url: absoluteUrl(`/garage/${g.slug}`), lastModified: g.updatedAt, changeFrequency: "weekly" as const, priority: 0.8 })),
    ]
  } catch (err) {
    // Serve the static pages rather than a 500: a partial sitemap is better than none.
    console.error("[sitemap] couldn't load garages:", err)
    return pages
  }
}
