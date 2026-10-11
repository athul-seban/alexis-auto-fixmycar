import Link from "next/link"
import { MapPin, Shield, Star } from "lucide-react"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { breadcrumbJsonLd, garageListJsonLd, jsonLdString } from "@/lib/seo"
import { getServiceLabel } from "@/lib/utils"
import { SERVICE_BLURBS, slugForService, type LandingGarage } from "@/lib/locations"

interface Props {
  city: string
  citySlug: string
  garages: LandingGarage[]
  /** Set on /garages/<city>/<service>. */
  serviceType?: string
  /** Services offered somewhere in this city (for the city page's links). */
  services: string[]
}

export function LocationLanding({ city, citySlug, garages, serviceType, services }: Props) {
  const serviceLabel = serviceType ? getServiceLabel(serviceType) : null
  const heading = serviceLabel ? `${serviceLabel} in ${city}` : `Car garages in ${city}`
  const n = garages.length
  const searchHref = `/search?location=${encodeURIComponent(city)}${serviceType ? `&service=${serviceType}` : ""}`
  const crumbs = [
    { name: "Home", path: "/" },
    { name: "Garages", path: "/garages" },
    { name: city, path: `/garages/${citySlug}` },
    ...(serviceLabel && serviceType ? [{ name: serviceLabel, path: `/garages/${citySlug}/${slugForService(serviceType)}` }] : []),
  ]

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(garageListJsonLd(garages)) }} />
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500 dark:text-slate-400">
            <ol className="flex flex-wrap items-center gap-1.5">
              {crumbs.map((c, i) => (
                <li key={c.path} className="flex items-center gap-1.5">
                  {i > 0 && <span aria-hidden>/</span>}
                  {i === crumbs.length - 1 ? (
                    <span aria-current="page" className="font-medium text-slate-700 dark:text-slate-200">
                      {c.name}
                    </span>
                  ) : (
                    <Link href={c.path} className="hover:underline">
                      {c.name}
                    </Link>
                  )}
                </li>
              ))}
            </ol>
          </nav>

          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">{heading}</h1>
          <p className="mt-3 max-w-3xl text-slate-600 dark:text-slate-300">
            {serviceLabel
              ? `Compare ${n} garage${n === 1 ? "" : "s"} offering ${serviceLabel.toLowerCase()} in ${city}. `
              : `Compare ${n} approved garage${n === 1 ? "" : "s"} in ${city}. `}
            Read customer reviews, then request a free quote or book online — no obligation.
          </p>
          {serviceType && SERVICE_BLURBS[serviceType] && <p className="mt-3 max-w-3xl text-sm text-slate-600 dark:text-slate-300">{SERVICE_BLURBS[serviceType]}</p>}

          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/post-job" className="rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-bold text-slate-900 hover:bg-[#EA580C]">
              Get free quotes
            </Link>
            <Link href={searchHref} className="rounded-lg border-2 border-[#1E3A5F] px-5 py-2.5 text-sm font-bold text-[#1E3A5F] hover:bg-[#1E3A5F] hover:text-white dark:border-white/30 dark:text-white dark:hover:bg-white/10">
              Search {city}
            </Link>
          </div>

          <h2 className="mt-10 text-xl font-bold text-slate-900 dark:text-white">
            {n} garage{n === 1 ? "" : "s"} in {city}
          </h2>
          <ul className="mt-4 grid gap-4 md:grid-cols-2">
            {garages.map((g) => (
              <li key={g.id}>
                <Link
                  href={`/garage/${g.slug}`}
                  className="block h-full rounded-2xl border border-[#E8EDF5] bg-white p-5 transition-shadow hover:shadow-md dark:border-white/10 dark:bg-slate-800"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-bold text-slate-900 dark:text-white">{g.name}</h3>
                    {g.isVerified && (
                      <span className="inline-flex flex-shrink-0 items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-2 py-0.5 text-[10px] font-bold text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-300">
                        <Shield aria-hidden className="h-2.5 w-2.5" /> Verified
                      </span>
                    )}
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <MapPin aria-hidden className="h-3 w-3" /> {g.address}, {g.postcode}
                    {g.isMobile ? " · Mobile service" : ""}
                  </p>
                  {g.description && <p className="mt-2 line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{g.description}</p>}
                  <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                    {g.reviews > 0 ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-slate-800 dark:text-slate-100">
                        <Star aria-hidden className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                        {g.rating.toFixed(1)} <span className="font-normal text-slate-500 dark:text-slate-400">({g.reviews} review{g.reviews === 1 ? "" : "s"})</span>
                      </span>
                    ) : (
                      <span className="text-slate-500 dark:text-slate-400">New on Quote My Garage</span>
                    )}
                    <span className="truncate text-slate-500 dark:text-slate-400">{g.services.slice(0, 3).join(" · ")}</span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>

          {!serviceType && services.length > 0 && (
            <section className="mt-12" aria-labelledby="services-heading">
              <h2 id="services-heading" className="text-xl font-bold text-slate-900 dark:text-white">
                Popular services in {city}
              </h2>
              <ul className="mt-4 flex flex-wrap gap-2">
                {services.map((t) => (
                  <li key={t}>
                    <Link href={`/garages/${citySlug}/${slugForService(t)}`} className="inline-block rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:border-[#1E3A5F] dark:border-white/10 dark:bg-slate-800 dark:text-slate-200">
                      {getServiceLabel(t)} in {city}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {serviceType && (
            <p className="mt-10 text-sm text-slate-600 dark:text-slate-300">
              <Link href={`/garages/${citySlug}`} className="font-medium text-[#1E3A5F] hover:underline dark:text-blue-300">
                See all garages in {city} →
              </Link>
            </p>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}

