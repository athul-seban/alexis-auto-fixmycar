import { z } from "zod"
import { isOwnOrgImageUrl } from "@/lib/image-sniff"

// What a business's website says. Everything is PLAIN TEXT: it is rendered as React text nodes (so it can never become
// HTML or script), apart from the About body, which goes through the Markdown subset in src/lib/articles.ts that produces
// React elements and only safe links. Every field has a length cap and the whole document is capped at 64 KB.
//
// Locations are not stored here: the page shows the business's live locations, so an edit to an address or opening hours
// is on the website at once and can't drift out of step.

export const MAX_CONTENT_BYTES = 64 * 1024
export const MAX_GALLERY_IMAGES = 12
export const MAX_FAQ_ITEMS = 12

const text = (max: number) => z.string().trim().max(max)
/** A web address on https, or empty. */
const link = z
  .string()
  .trim()
  .max(300)
  .refine((v) => v === "" || /^https:\/\/[^\s"'<>\\]+$/i.test(v), "Use a full address starting with https://")

export const siteContentSchema = z.object({
  seo: z.object({ title: text(70), description: text(160) }),
  hero: z.object({ headline: text(90), subheadline: text(220), ctaLabel: text(30), imageUrl: z.string().trim().max(500).nullable() }),
  about: z.object({ show: z.boolean(), title: text(60), body: text(4000) }),
  services: z.object({ show: z.boolean(), title: text(60), intro: text(300) }),
  locations: z.object({ title: text(60), intro: text(300) }),
  gallery: z.object({ show: z.boolean(), title: text(60), images: z.array(z.object({ url: z.string().trim().max(500), alt: text(120) })).max(MAX_GALLERY_IMAGES) }),
  reviews: z.object({ show: z.boolean(), title: text(60) }),
  faq: z.object({ show: z.boolean(), title: text(60), items: z.array(z.object({ q: text(150), a: text(600) })).max(MAX_FAQ_ITEMS) }),
  contact: z.object({
    title: text(60),
    message: text(300),
    email: text(200).refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address"),
    showHours: z.boolean(),
  }),
  social: z.object({ facebook: link, instagram: link, x: link, youtube: link, tiktok: link }),
})
export type SiteContent = z.infer<typeof siteContentSchema>

/** Which sites each social link may point at (so a "Facebook" button can't go anywhere else). */
export const SOCIAL_HOSTS: Record<keyof SiteContent["social"], string[]> = {
  facebook: ["facebook.com", "fb.com"],
  instagram: ["instagram.com"],
  x: ["x.com", "twitter.com"],
  youtube: ["youtube.com", "youtu.be"],
  tiktok: ["tiktok.com"],
}

/** Starting text for a new site, built from the business's name. Plain, honest and easy to replace. */
export function defaultContent(businessName: string): SiteContent {
  return {
    seo: { title: businessName.slice(0, 70), description: `${businessName}: MOTs, servicing and repairs. Book online or get a quote.`.slice(0, 160) },
    hero: { headline: businessName.slice(0, 90), subheadline: "MOTs, servicing and repairs you can trust.", ctaLabel: "Book online", imageUrl: null },
    about: { show: true, title: "About us", body: "" },
    services: { show: true, title: "What we do", intro: "" },
    locations: { title: "Find us", intro: "" },
    gallery: { show: false, title: "Our workshop", images: [] },
    reviews: { show: true, title: "What customers say" },
    faq: { show: false, title: "Questions", items: [] },
    contact: { title: "Get in touch", message: "", email: "", showHours: true },
    social: { facebook: "", instagram: "", x: "", youtube: "", tiktok: "" },
  }
}

/** Reads stored content: each section that is missing or invalid falls back to the default, so one bad field never takes the site down. */
export function parseContent(json: string | null | undefined, businessName: string): SiteContent {
  const defaults = defaultContent(businessName)
  let raw: unknown = {}
  try {
    raw = JSON.parse(json || "{}")
  } catch {
    /* defaults */
  }
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {}
  const out = { ...defaults }
  for (const key of Object.keys(siteContentSchema.shape) as (keyof SiteContent)[]) {
    const section = siteContentSchema.shape[key].safeParse(r[key])
    if (section.success) (out as Record<string, unknown>)[key] = section.data
  }
  return out
}

/** The document's size once saved. */
export const contentBytes = (content: unknown): number => new TextEncoder().encode(JSON.stringify(content)).length

/**
 * What the schema can't know: the images must be this business's own uploads, social links must go to the network they are
 * labelled as, and the document must fit. Empty list means it can be saved.
 */
export function contentProblems(content: SiteContent, organisationId: string): string[] {
  const problems: string[] = []
  if (contentBytes(content) > MAX_CONTENT_BYTES) problems.push("The website is too long. Shorten some text or remove some photos.")

  const images = [content.hero.imageUrl, ...content.gallery.images.map((i) => i.url)].filter((u): u is string => !!u)
  if (images.some((u) => !isOwnOrgImageUrl(u, organisationId))) problems.push("Photos must be uploaded here; you can't link to another website's image.")

  for (const key of Object.keys(SOCIAL_HOSTS) as (keyof SiteContent["social"])[]) {
    const value = content.social[key]
    if (!value) continue
    try {
      const host = new URL(value).hostname.toLowerCase().replace(/^www\./, "")
      if (!SOCIAL_HOSTS[key].some((h) => host === h || host.endsWith(`.${h}`))) problems.push(`The ${key === "x" ? "X" : key[0].toUpperCase() + key.slice(1)} link must go to ${SOCIAL_HOSTS[key][0]}.`)
    } catch {
      problems.push(`The ${key} link isn't a valid address.`)
    }
  }
  return problems
}

/** What has to be filled in before a site can go live. */
export function publishProblems(content: SiteContent): string[] {
  const missing: string[] = []
  if (!content.hero.headline) missing.push("a headline")
  if (!content.seo.title) missing.push("a page title for search engines")
  if (!content.seo.description) missing.push("a short description for search engines")
  return missing
}
