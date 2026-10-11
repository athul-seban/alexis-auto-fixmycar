import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { ArticleBody } from "@/components/shared/ArticleBody"
import { getLegalPage } from "@/lib/legal"
import { getLocale, getT } from "@/lib/i18n/server"

// /privacy, /terms and /cookies: written by the business under Admin > Content. A page that has no published text
// is a real 404 (not a placeholder), so nothing is indexed or linked until it exists.
interface Props {
  params: Promise<{ legalSlug: string }>
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { legalSlug } = await props.params
  const page = await getLegalPage(legalSlug, await getLocale())
  if (!page) return { title: "Page not found", robots: { index: false, follow: false } }
  // English text shown under a French/German URL is a duplicate, so keep it out of the index.
  return { title: page.title, ...(page.fallback ? { robots: { index: false, follow: true } } : {}) }
}

export default async function LegalPage(props: Props) {
  const { legalSlug } = await props.params
  const locale = await getLocale()
  const page = await getLegalPage(legalSlug, locale)
  if (!page) notFound()
  const t = await getT(locale)

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">{page.title}</h1>
        {page.fallback && <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">{t("legal.fallback")}</p>}
        <div className="mt-8">
          <ArticleBody body={page.body} />
        </div>
      </main>
      <Footer />
    </>
  )
}
