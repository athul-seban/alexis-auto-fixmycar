import { isMessageKey, sectionOf, type MessageKey } from "./messages"

// What an admin may put in each editable string. Text is rendered by React (escaped), and the legal-page bodies go
// through the safe Markdown-subset parser, so none of this can inject HTML; these rules just stop broken values
// (a malformed link, a 50 kB headline) from reaching the live site.

export const MAX_LEN = 2_000
export const MAX_BODY_LEN = 60_000

export const isBodyKey = (key: string) => key.startsWith("legal.") && key.endsWith(".body")

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const isHttpUrl = (v: string) => {
  try {
    const u = new URL(v)
    return u.protocol === "https:" || u.protocol === "http:"
  } catch {
    return false
  }
}

/** An error message if `text` is not acceptable for `key`; null if fine. Empty text is always allowed (it clears an optional value). */
export function validateContent(key: string, text: string): string | null {
  if (!isMessageKey(key)) return "Unknown content key"
  const max = isBodyKey(key) ? MAX_BODY_LEN : MAX_LEN
  if (text.length > max) return `Too long (maximum ${max.toLocaleString("en-GB")} characters)`
  const t = text.trim()
  if (t === "") return null

  if (key === "footer.email" && !EMAIL.test(t)) return "Enter a valid email address"
  if (key === "footer.phone" && !/^[+\d][\d\s()+-]{5,24}$/.test(t)) return "Enter a valid phone number"
  if (key.startsWith("footer.social.") && !isHttpUrl(t)) return "Enter the full web address, starting with https://"
  if (key === "site.noticeLink" && !(t.startsWith("/") && !t.startsWith("//")) && !isHttpUrl(t)) return "Use a full web address (https://…) or a site path starting with /"
  return null
}

/** Marks the places a solicitor must complete in a legal-page outline. Text containing it can be drafted, never published. */
export const PLACEHOLDER_MARK = "[[" 

/**
 * Extra checks that apply only when text goes live. Legal pages are the business's legal statements, so an outline
 * with unfinished `[[…]]` markers, or one nobody confirmed as reviewed, must not be published.
 */
export function validateForPublish(key: string, text: string, opts: { confirmedReviewed?: boolean } = {}): string | null {
  if (!isBodyKey(key) || text.trim() === "") return null
  if (text.includes(PLACEHOLDER_MARK)) return "This text still has [[…]] markers to complete. Finish and remove them before publishing."
  if (!opts.confirmedReviewed) return "Confirm that a solicitor has reviewed this text before publishing."
  return null
}

/** A heading skeleton for a UK marketplace's legal page. It contains no legal wording: every section is a marker to complete. */
export function legalOutline(slug: string): string {
  const sections: Record<string, string[]> = {
    privacy: ["Who we are", "What personal data we collect", "Why we use it and our lawful basis", "Who we share it with (garages, payment, email and SMS providers)", "How long we keep it", "Your rights", "Cookies", "Contact us and the ICO"],
    terms: ["About Quote My Garage and who these terms are with", "Using the service as a vehicle owner", "Quotes and bookings", "Deposits, cancellations and refunds", "Reviews", "Garages and their responsibilities", "Our liability", "Complaints and disputes", "Changes to these terms", "Governing law"],
    cookies: ["What cookies are", "The cookies we use and why", "How to manage cookies", "Contact us"],
  }
  return (sections[slug] ?? ["Overview"]).map((h) => `## ${h}\n\n${PLACEHOLDER_MARK}Solicitor to complete]]`).join("\n\n") + "\n"
}

/** Section grouping and labels for the editor. */
export const SECTION_LABELS: Record<string, string> = {
  nav: "Navigation",
  svc: "Service names",
  hero: "Home: top banner and search",
  howit: "Home: how it works",
  cat: "Home: browse by service",
  stats: "Home: numbers",
  feat: "Home: featured garages",
  rev: "Home: customer reviews",
  cta: "Garage sign-up pitch",
  forg: "For Garages page",
  how: "How It Works page",
  dir: "Garage directory",
  footer: "Footer",
  site: "Site-wide notice",
  legal: "Legal pages",
  meta: "Search-engine titles",
  lang: "Language switcher",
  email: "Garage emails (English)",
}

export const sectionLabel = (key: string) => SECTION_LABELS[sectionOf(key)] ?? sectionOf(key)

export type { MessageKey }
