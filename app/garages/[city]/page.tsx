import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LocationLanding } from "@/components/seo/LocationLanding"
import { getCityGarages, servicesOffered } from "@/lib/locations"
import { absoluteUrl } from "@/lib/portal/links"

interface Props {
  params: Promise<{ city: string }>
}

// Built on first request and cached for an hour: no database access at build time.
export const revalidate = 3600

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { city: slug } = await props.params
  const found = await getCityGarages(slug)
  if (!found || found.garages.length === 0) return { title: "Garages not found", robots: { index: false, follow: false } }
  const { city, garages } = found
  const n = garages.length
  const title = `Car garages in ${city} - compare quotes, reviews & book online`
  const description = `Compare ${n} approved garage${n === 1 ? "" : "s"} in ${city}. Read customer reviews, get free quotes and book your MOT, service or repair online.`
  const url = absoluteUrl(`/garages/${slug}`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description },
    twitter: { card: "summary", title, description },
  }
}

export default async function CityPage(props: Props) {
  const { city: slug } = await props.params
  const found = await getCityGarages(slug)
  if (!found || found.garages.length === 0) notFound()
  return <LocationLanding city={found.city} citySlug={slug} garages={found.garages} services={servicesOffered(found.garages)} />
}
