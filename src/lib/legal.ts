import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config"
import { getMessages } from "@/lib/i18n/server"
import type { Messages } from "@/lib/i18n/messages"

// Legal pages are written by the business in Admin > Content. A page exists (and is linked, indexed and in the sitemap)
// only once it has a published body; nothing is invented here.

export const LEGAL_PAGES = [
  { slug: "privacy", titleKey: "legal.privacy.title", bodyKey: "legal.privacy.body" },
  { slug: "terms", titleKey: "legal.terms.title", bodyKey: "legal.terms.body" },
  { slug: "cookies", titleKey: "legal.cookies.title", bodyKey: "legal.cookies.body" },
] as const

export type LegalSlug = (typeof LEGAL_PAGES)[number]["slug"]

export interface LegalPage {
  slug: LegalSlug
  title: string
  body: string
  /** True when this language has no text of its own yet and the English text is shown instead. */
  fallback: boolean
}

function resolve(slug: LegalSlug, own: Messages, english: Messages): LegalPage | null {
  const def = LEGAL_PAGES.find((p) => p.slug === slug)
  if (!def) return null
  const ownBody = own[def.bodyKey].trim()
  const enBody = english[def.bodyKey].trim()
  const body = ownBody || enBody
  if (!body) return null
  return { slug, title: ownBody ? own[def.titleKey] : english[def.titleKey], body, fallback: !ownBody }
}

/** One legal page in a language (English text if the language has none), or null when nothing is published. */
export async function getLegalPage(slug: string, locale: Locale): Promise<LegalPage | null> {
  if (!LEGAL_PAGES.some((p) => p.slug === slug)) return null
  const [own, english] = await Promise.all([getMessages(locale), getMessages(DEFAULT_LOCALE)])
  return resolve(slug as LegalSlug, own, english)
}

/** Legal pages that have a published body, for the footer and sitemap. */
export async function liveLegalPages(locale: Locale): Promise<LegalPage[]> {
  const [own, english] = await Promise.all([getMessages(locale), getMessages(DEFAULT_LOCALE)])
  return LEGAL_PAGES.map((p) => resolve(p.slug, own, english)).filter((p): p is LegalPage => p !== null)
}
