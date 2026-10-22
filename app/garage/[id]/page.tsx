import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { cache } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GarageProfilePage } from "@/components/garage/GarageProfilePage"
import { prisma } from "@/lib/prisma"
import { getPublicGarage } from "@/lib/public-garage"
import { parseImageList } from "@/lib/garage-mapper"
import { absoluteUrl } from "@/lib/portal/links"
import { breadcrumbJsonLd, garageJsonLd, jsonLdString, snippet } from "@/lib/seo"
import { slugify } from "@/lib/locations"

interface Props {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ service?: string; reg?: string }>
}

// One query per request, shared by generateMetadata and the page.
const loadGarage = cache((idOrSlug: string) =>
  prisma.garage.findFirst({ where: { OR: [{ id: idOrSlug }, { slug: idOrSlug }], status: "APPROVED" } })
)

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { id } = await props.params
  const garage = await loadGarage(id)
  // Unknown or unapproved garages: don't let a thin "not found" shell into the index.
  if (!garage) return { title: "Garage not found", robots: { index: false, follow: false } }

  const title = `${garage.name} – ${garage.city} garage, quotes & booking`
  const description = snippet(
    garage.description?.trim() ||
      `${garage.name} in ${garage.city}. Compare prices, read customer reviews and book online with Quote My Garage.`
  )
  const url = absoluteUrl(`/garage/${garage.slug}`)
  const image = garage.logo ?? parseImageList(garage.images)[0]
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description, ...(image ? { images: [image] } : {}) },
    twitter: { card: "summary", title, description },
  }
}

export default async function GaragePage(props: Props) {
  const { id } = await props.params
  const query = (await props.searchParams) ?? {}
  const garage = await loadGarage(id)
  // A garage that doesn't exist (or isn't approved) is a real 404, not a 200 page saying "not found": search engines drop a 404
  // but index a thin 200 shell. (generateMetadata above also marks it noindex.)
  if (!garage) notFound()
  // Plain data for the client component (dates become strings, exactly as the JSON API returns them).
  const profile = JSON.parse(JSON.stringify(await getPublicGarage(id)))

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(garageJsonLd(garage, parseImageList(garage.images))) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: jsonLdString(
            breadcrumbJsonLd([
              { name: "Home", path: "/" },
              { name: "Garages", path: "/garages" },
              ...(slugify(garage.city) ? [{ name: garage.city, path: `/garages/${slugify(garage.city)}` }] : []),
              { name: garage.name, path: `/garage/${garage.slug}` },
            ]),
          ),
        }}
      />
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
        <GarageProfilePage
          garage={profile}
          initialService={typeof query.service === "string" ? query.service : undefined}
          initialReg={typeof query.reg === "string" ? query.reg.slice(0, 12) : undefined}
        />
      </main>
      <Footer />
    </>
  )
}
