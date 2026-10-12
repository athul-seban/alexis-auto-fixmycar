"use client"

import { createContext, useContext } from "react"

export interface LegalLink {
  slug: string
  title: string
}

const LegalLinksContext = createContext<LegalLink[]>([])

/** The legal pages that are actually published (set once in the root layout), so notices never link to a 404. */
export function LegalLinksProvider({ links, children }: { links: LegalLink[]; children: React.ReactNode }) {
  return <LegalLinksContext.Provider value={links}>{children}</LegalLinksContext.Provider>
}

/**
 * "By continuing you agree to our Terms and Privacy Policy" under a form that collects personal data. It names only
 * the pages that exist, and renders nothing until at least one is published.
 */
export function ConsentNotice({ action = "continuing", className }: { action?: string; className?: string }) {
  const links = useContext(LegalLinksContext)
  const terms = links.find((l) => l.slug === "terms")
  const privacy = links.find((l) => l.slug === "privacy")
  if (!terms && !privacy) return null

  const anchor = (l: LegalLink) => (
    <a key={l.slug} href={`/${l.slug}`} target="_blank" rel="noopener noreferrer" className="underline">{l.title}</a>
  )
  return (
    <p className={className ?? "text-xs leading-relaxed text-slate-500 dark:text-slate-400"}>
      {terms && privacy ? (
        <>By {action} you agree to our {anchor(terms)} and have read our {anchor(privacy)}.</>
      ) : terms ? (
        <>By {action} you agree to our {anchor(terms)}.</>
      ) : (
        <>See how we use your details in our {anchor(privacy!)}.</>
      )}
    </p>
  )
}
