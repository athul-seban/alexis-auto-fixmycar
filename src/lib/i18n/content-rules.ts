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
