import type { Metadata } from "next"
import Link from "next/link"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { listCities } from "@/lib/locations"
import { getLocale, getT } from "@/lib/i18n/server"
import { localePath } from "@/lib/i18n/config"

// Rendered per request: a build must not depend on (or bake in) the database being reachable.
export const dynamic = "force-dynamic"

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT()
  return { title: t("dir.meta.title"), description: t("dir.meta.description") }
}

export default async function GaragesIndexPage() {
  const [cities, t, locale] = await Promise.all([listCities(), getT(), getLocale()])
  return (
    <>
      <Header />
      <main className="min-h-screen bg-[#F8FAFC] dark:bg-slate-950">
        <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white md:text-4xl">{t("dir.title")}</h1>
          <p className="mt-3 max-w-2xl text-slate-600 dark:text-slate-300">{t("dir.subtitle")}</p>
          {cities.length === 0 ? (
            <p className="mt-8 text-slate-500 dark:text-slate-400">
              {t("dir.empty")}{" "}
              <Link href="/search" className="font-medium underline">
                {t("dir.search")}
              </Link>
              .
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
