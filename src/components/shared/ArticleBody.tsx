import Link from "next/link"
import { parseArticleBody, type Inline } from "@/lib/articles"

function Inlines({ parts }: { parts: Inline[] }) {
  return (
    <>
      {parts.map((p, i) => {
        switch (p.type) {
          case "strong":
            return <strong key={i}>{p.text}</strong>
          case "em":
            return <em key={i}>{p.text}</em>
          case "link":
            return p.href.startsWith("/") ? (
              <Link key={i} href={p.href} className="font-medium text-[#1E3A5F] underline dark:text-orange-400">{p.text}</Link>
            ) : (
              <a key={i} href={p.href} rel="noopener noreferrer nofollow" className="font-medium text-[#1E3A5F] underline dark:text-orange-400">{p.text}</a>
            )
          default:
            return <span key={i}>{p.text}</span>
        }
      })}
    </>
  )
}

/** Renders the article Markdown subset as React elements. Author text can never become raw HTML. */
export function ArticleBody({ body }: { body: string }) {
  return (
    <div className="space-y-4 text-base leading-relaxed text-slate-700 dark:text-slate-300">
      {parseArticleBody(body).map((b, i) => {
        switch (b.type) {
          case "h2":
            return <h2 key={i} className="pt-4 text-2xl font-bold text-slate-900 dark:text-white">{b.text}</h2>
          case "h3":
            return <h3 key={i} className="pt-2 text-xl font-bold text-slate-900 dark:text-white">{b.text}</h3>
          case "p":
            return <p key={i}><Inlines parts={b.inline} /></p>
          case "quote":
            return <blockquote key={i} className="border-l-4 border-[#F97316] pl-4 italic"><Inlines parts={b.inline} /></blockquote>
          case "ul":
            return <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((it, j) => <li key={j}><Inlines parts={it} /></li>)}</ul>
          case "ol":
            return <ol key={i} className="list-decimal space-y-1 pl-6">{b.items.map((it, j) => <li key={j}><Inlines parts={it} /></li>)}</ol>
        }
      })}
    </div>
  )
}
