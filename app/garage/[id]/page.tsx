import type { Metadata } from "next"
import { cache } from "react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { GarageProfilePage } from "@/components/garage/GarageProfilePage"
import { prisma } from "@/lib/prisma"
import { parseImageList } from "@/lib/garage-mapper"
import { absoluteUrl } from "@/lib/portal/links"
import { garageJsonLd, jsonLdString, snippet } from "@/lib/seo"

interface Props {
  params: Promise<{ id: string }>
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
  const garage = await loadGarage(id)

  return (
    <>
      {garage && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdString(garageJsonLd(garage, parseImageList(garage.images))) }}
        />
      )}
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
        <GarageProfilePage slug={id} />
      </main>
      <Footer />
    </>
  )
}
