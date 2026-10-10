import Link from "next/link"
import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { Header } from "@/components/layout/Header"
import { Footer } from "@/components/layout/Footer"
import { ArticleBody } from "@/components/shared/ArticleBody"
import { prisma } from "@/lib/prisma"
import { excerptOf, readingMinutes } from "@/lib/articles"
import { articleJsonLd, jsonLdString, snippet } from "@/lib/seo"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

type Props = { params: Promise<{ slug: string }> }

// Drafts are 404s on the public site: only PUBLISHED articles load here.
const load = (slug: string) => prisma.article.findFirst({ where: { slug, status: "PUBLISHED" } })

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { slug } = await props.params
  const article = await load(slug).catch(() => null)
  if (!article) return { title: "Guide not found", robots: { index: false } }
  const description = snippet(article.metaDescription?.trim() || excerptOf(article))
  return {
    title: article.metaTitle?.trim() || article.title,
    description,
    alternates: { canonical: `/blog/${article.slug}` },
    openGraph: { type: "article", title: article.metaTitle?.trim() || article.title, description, publishedTime: article.publishedAt?.toISOString() },
  }
}

export default async function ArticlePage(props: Props) {
  const { slug } = await props.params
  const article = await load(slug)
  if (!article || !article.publishedAt) notFound()

  return (
    <>
      <Header />
      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: jsonLdString(articleJsonLd({ slug: article.slug, title: article.title, excerpt: excerptOf(article), publishedAt: article.publishedAt, updatedAt: article.updatedAt })),
          }}
        />
        <Link href="/blog" className="text-sm font-medium text-[#1E3A5F] hover:underline dark:text-orange-400">← All guides</Link>
        <h1 className="mt-4 text-4xl font-bold tracking-tight text-slate-900 dark:text-white">{article.title}</h1>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
          {formatDate(article.publishedAt)} · {readingMinutes(article.body)} min read
        </p>
        <div className="mt-8">
          <ArticleBody body={article.body} />
        </div>
        <aside className="mt-12 rounded-2xl bg-[#1E3A5F] p-6 text-white">
          <h2 className="text-xl font-bold">Need a garage?</h2>
          <p className="mt-1 text-blue-100">Describe the job once and compare quotes from local garages.</p>
          <Link href="/post-job" className="mt-4 inline-block rounded-lg bg-[#F97316] px-5 py-2.5 text-sm font-bold text-slate-900">Get free quotes</Link>
        </aside>
      </main>
      <Footer />
    </>
  )
}
