import Link from "next/link"
import type { Metadata } from "next"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { prisma } from "@/lib/prisma"
import { excerptOf, readingMinutes } from "@/lib/articles"
import { formatDate } from "@/lib/utils"

// Read on request: a build must not depend on the database being reachable (same reason as the sitemap).
export const dynamic = "force-dynamic"

export const metadata: Metadata = {
  title: "Guides & blog",
  description: "Plain-English guides to MOTs, servicing, repairs and getting a fair price from a garage.",
  alternates: { canonical: "/blog" },
}

export default async function BlogPage() {
  let articles: { slug: string; title: string; excerpt: string | null; body: string; publishedAt: Date | null }[] = []
  try {
    articles = await prisma.article.findMany({
      where: { status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 50,
      select: { slug: true, title: true, excerpt: true, body: true, publishedAt: true },
    })
  } catch (err) {
    console.error("[blog] couldn't load articles:", err)
  }

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-4xl font-bold tracking-tight text-slate-900 dark:text-white">Guides &amp; blog</h1>
        <p className="mt-2 text-lg text-slate-600 dark:text-slate-300">Plain-English help with MOTs, servicing, repairs and getting a fair price.</p>

        {articles.length === 0 ? (
          <p className="mt-10 text-slate-500 dark:text-slate-400">No guides yet — check back soon.</p>
        ) : (
          <ul className="mt-10 divide-y divide-slate-200 dark:divide-white/10">
            {articles.map((a) => (
              <li key={a.slug} className="py-6">
                <Link href={`/blog/${a.slug}`} className="group block">
                  <h2 className="text-xl font-bold text-slate-900 group-hover:text-[#1E3A5F] dark:text-white dark:group-hover:text-orange-400">{a.title}</h2>
                  <p className="mt-1 text-slate-600 dark:text-slate-300">{excerptOf(a)}</p>
                  <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {a.publishedAt && <>{formatDate(a.publishedAt)} · </>}
                    {readingMinutes(a.body)} min read
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
      <Footer />
    </>
  )
}
