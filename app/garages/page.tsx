import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { listCities } from "@/lib/locations"
import { absoluteUrl } from "@/lib/portal/links"

// Rendered per request: a build must not depend on (or bake in) the database being reachable.
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Find garages by town and city",
  description: "Browse approved garages by location. Compare reviews, get free quotes and book your MOT, service or repair online.",
  alternates: { canonical: absoluteUrl("/garages") },
}

export default async function GaragesIndexPage() {
  const cities = await listCities()
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">Find garages by location</h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">Browse approved garages in your area, compare customer reviews and request a free quote.</p>
          {cities.length === 0 ? (
            <p className="mt-8 text-slate-500 dark:text-slate-400">
              No garages are listed yet. <Link href="/search" className="font-medium underline">Search instead</Link>.
            </p>
          ) : (
            <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {cities.map((c) => (
                <li key={c.slug}>
                  <Link href={`/garages/${c.slug}`} className="block rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm hover:border-[#1E3A5F] dark:border-white/10 dark:bg-slate-800">
                    <span className="font-semibold text-slate-900 dark:text-white">{c.city}</span>
                    <span className="ml-2 text-slate-500 dark:text-slate-400">{c.count}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>
      <Footer />
    </>
  )
}
