import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { SiteRenderer } from "@/components/site/SiteRenderer"
import { isTenantLabel } from "@/lib/org/host"
import { siteJsonLd } from "@/lib/site/jsonld"
import { appOrigin, getPublicSite, publicOrigin, requirePublicSite } from "@/lib/site/public-cached"
import { jsonLdString, snippet } from "@/lib/seo"

// A business's website, reached only by the proxy rewriting <label>.<root domain> to here. Opening /sites/<label> on any host
// is a 404 (proxy.ts), and unknown, unpublished or switched-off sites are real 404s that search engines drop.

type Props = { params: Promise<{ label: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { label } = await params
  // The label must look like one a business could own; anything else never reaches the database.
  if (!isTenantLabel(label)) return { robots: { index: false, follow: false } }
  const result = await getPublicSite(label)
  if (result.state !== "ok") return { title: "Page not found", robots: { index: false, follow: false } }

  const { site } = result
  const origin = publicOrigin(label)
  const title = site.content.seo.title || site.businessName
  const description = snippet(site.content.seo.description || site.content.hero.subheadline || `${site.businessName}: MOTs, servicing and repairs.`, 160)
  return {
    title: { absolute: title },
    description,
    ...(origin ? { metadataBase: new URL(origin), alternates: { canonical: origin } } : {}),
    // The platform's own favicon would be wrong here; use the business's logo when it has one.
    ...(site.logo ? { icons: { icon: site.logo, apple: site.logo } } : {}),
    openGraph: { type: "website", siteName: site.businessName, title, description, ...(origin ? { url: origin } : {}) },
    twitter: { card: "summary_large_image", title, description },
    robots: { index: true, follow: true },
  }
}

export default async function SitePage({ params }: Props) {
  const { label } = await params
  if (!isTenantLabel(label)) notFound()
  const site = await requirePublicSite(label)
  const origin = publicOrigin(label) ?? appOrigin()
  const sameAs = Object.values(site.content.social).filter(Boolean)

  const jsonLd = siteJsonLd({
    origin,
    businessName: site.businessName,
    description: site.content.seo.description || null,
    logoUrl: site.logo,
    sameAs,
    locations: site.locations.map((l) => ({
      slug: l.slug, name: l.name, phone: l.phone, address: l.address, city: l.city, postcode: l.postcode, latitude: l.latitude, longitude: l.longitude, openingHours: l.openingHoursRaw,
    })),
  })

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(jsonLd) }} />
      <SiteRenderer site={site} appOrigin={appOrigin()} />
    </>
  )
}
