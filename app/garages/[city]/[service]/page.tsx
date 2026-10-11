import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { LocationLanding } from "@/components/seo/LocationLanding"
import { getCityGarages, serviceBySlug, servicesOffered } from "@/lib/locations"
import { absoluteUrl } from "@/lib/portal/links"
import { getServiceLabel } from "@/lib/utils"

interface Props {
  params: Promise<{ city: string; service: string }>
}

export const revalidate = 3600

async function load(props: Props) {
  const { city: citySlug, service: serviceSlug } = await props.params
  const service = serviceBySlug(serviceSlug)
  if (!service) return null
  const found = await getCityGarages(citySlug, service.type)
  if (!found || found.garages.length === 0) return null
  return { ...found, citySlug, serviceSlug, serviceType: service.type }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const data = await load(props)
  if (!data) return { title: "Garages not found", robots: { index: false, follow: false } }
  const label = getServiceLabel(data.serviceType)
  const n = data.garages.length
  const title = `${label} in ${data.city} - compare garages & book online`
  const description = `Compare ${n} garage${n === 1 ? "" : "s"} offering ${label.toLowerCase()} in ${data.city}. Read reviews, get free quotes and book online with Quote My Garage.`
  const url = absoluteUrl(`/garages/${data.citySlug}/${data.serviceSlug}`)
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { type: "website", url, title, description },
    twitter: { card: "summary", title, description },
  }
}

export default async function CityServicePage(props: Props) {
  const data = await load(props)
  if (!data) notFound()
  return <LocationLanding city={data.city} citySlug={data.citySlug} garages={data.garages} serviceType={data.serviceType} services={servicesOffered(data.garages)} />
}
