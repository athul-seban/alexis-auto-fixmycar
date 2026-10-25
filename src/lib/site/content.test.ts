import { describe, expect, it } from "vitest"
import { MAX_CONTENT_BYTES, MAX_FAQ_ITEMS, MAX_GALLERY_IMAGES, contentBytes, contentProblems, defaultContent, defaultPro, parseContent, publishProblems, siteContentSchema } from "./content"

const ORG = "orgabc123"
const own = (name: string) => `https://abc123.public.blob.vercel-storage.com/orgs/${ORG}/${name}`
const base = () => defaultContent("Acme Motors")

describe("defaultContent", () => {
  it("is valid and built from the business name", () => {
    const c = base()
    expect(siteContentSchema.safeParse(c).success).toBe(true)
    expect(c.hero.headline).toBe("Acme Motors")
    expect(c.seo.title).toBe("Acme Motors")
    expect(contentProblems(c, ORG)).toEqual([])
  })

  it("clips a very long business name to the field limits", () => {
    const c = defaultContent("A".repeat(300))
    expect(siteContentSchema.safeParse(c).success).toBe(true)
  })
})

describe("siteContentSchema", () => {
  it("enforces the per-field caps", () => {
    const tooLong = (path: (c: ReturnType<typeof base>) => void) => {
      const c = base()
      path(c)
      return siteContentSchema.safeParse(c).success
    }
    expect(tooLong((c) => (c.seo.title = "x".repeat(71)))).toBe(false)
    expect(tooLong((c) => (c.seo.description = "x".repeat(161)))).toBe(false)
    expect(tooLong((c) => (c.hero.headline = "x".repeat(91)))).toBe(false)
    expect(tooLong((c) => (c.about.body = "x".repeat(4001)))).toBe(false)
    expect(tooLong((c) => (c.faq.items = Array.from({ length: MAX_FAQ_ITEMS + 1 }, () => ({ q: "q", a: "a" }))))).toBe(false)
    expect(tooLong((c) => (c.gallery.images = Array.from({ length: MAX_GALLERY_IMAGES + 1 }, () => ({ url: own("a.jpg"), alt: "" }))))).toBe(false)
    expect(tooLong((c) => (c.about.body = "x".repeat(4000)))).toBe(true)
  })

  it("accepts only https social links and a real email", () => {
    const bad = (mut: (c: ReturnType<typeof base>) => void) => {
      const c = base()
      mut(c)
      return siteContentSchema.safeParse(c).success
    }
    expect(bad((c) => (c.social.facebook = "http://facebook.com/acme"))).toBe(false)
    expect(bad((c) => (c.social.facebook = "javascript:alert(1)"))).toBe(false)
    expect(bad((c) => (c.social.instagram = 'https://instagram.com/"onmouseover="x'))).toBe(false)
    expect(bad((c) => (c.contact.email = "not-an-email"))).toBe(false)
    expect(bad((c) => (c.social.facebook = "https://facebook.com/acme"))).toBe(true)
    expect(bad((c) => (c.contact.email = "hello@acme.example"))).toBe(true)
  })

  it("rejects the wrong types instead of coercing them", () => {
    expect(siteContentSchema.safeParse({ ...base(), about: { show: "yes", title: "", body: "" } }).success).toBe(false)
    expect(siteContentSchema.safeParse({ ...base(), hero: null }).success).toBe(false)
  })
})

describe("parseContent", () => {
  it("falls back to the default for anything stored that is missing or broken, section by section", () => {
    const defaults = base()
    expect(parseContent(null, "Acme Motors")).toEqual(defaults)
    expect(parseContent("not json", "Acme Motors")).toEqual(defaults)
    expect(parseContent("[1,2]", "Acme Motors")).toEqual(defaults)

    const stored = { ...defaults, hero: { ...defaults.hero, headline: "Custom headline" }, about: { show: "nope" } }
    const parsed = parseContent(JSON.stringify(stored), "Acme Motors")
    expect(parsed.hero.headline).toBe("Custom headline") // the good section is kept
    expect(parsed.about).toEqual(defaults.about) // the broken one is replaced
  })
})

describe("contentProblems", () => {
  it("accepts the business's own uploads and refuses everyone else's", () => {
    const ok = base()
    ok.hero.imageUrl = own("hero.jpg")
    ok.gallery.images = [{ url: own("a.jpg"), alt: "Workshop" }]
    expect(contentProblems(ok, ORG)).toEqual([])

    for (const url of ["https://evil.example.com/x.jpg", "http://abc123.public.blob.vercel-storage.com/orgs/orgabc123/a.jpg", `https://abc123.public.blob.vercel-storage.com/orgs/other/a.jpg`, `https://abc123.public.blob.vercel-storage.com/garages/${ORG}/a.jpg`, `https://abc123.public.blob.vercel-storage.com/orgs/${ORG}/../other/a.jpg`]) {
      const c = base()
      c.hero.imageUrl = url
      expect(contentProblems(c, ORG).join(" "), url).toMatch(/uploaded here/)
      const g = base()
      g.gallery.images = [{ url, alt: "" }]
      expect(contentProblems(g, ORG).join(" "), url).toMatch(/uploaded here/)
    }
  })

  it("makes a social link go to the network it is labelled as", () => {
    const c = base()
    c.social.facebook = "https://facebook.com/acme"
    c.social.instagram = "https://www.instagram.com/acme"
    c.social.x = "https://twitter.com/acme"
    c.social.youtube = "https://youtu.be/abc"
    c.social.tiktok = "https://m.tiktok.com/@acme"
    expect(contentProblems(c, ORG)).toEqual([])

    const bad = base()
    bad.social.facebook = "https://evil.example.com/facebook.com"
    bad.social.instagram = "https://facebook.com.evil.example/x"
    expect(contentProblems(bad, ORG)).toHaveLength(2)
  })

  it("refuses a document over 64 KB", () => {
    const c = base()
    // Valid per field, but large in total: lots of long FAQ answers and about text near their limits.
    c.about.body = "a".repeat(4000)
    c.faq.items = Array.from({ length: MAX_FAQ_ITEMS }, () => ({ q: "q".repeat(150), a: "a".repeat(600) }))
    expect(contentBytes(c)).toBeLessThan(MAX_CONTENT_BYTES) // the per-field caps keep a valid document well inside the limit
    // Multi-byte text counts in bytes, not characters.
    c.about.body = "€".repeat(4000)
    expect(contentBytes(c)).toBeGreaterThan(4000 * 3)
    // Force it over with an oversized object the schema would reject anyway: the size check still stops it.
    const huge = { ...c, about: { ...c.about, body: "x".repeat(MAX_CONTENT_BYTES + 1) } }
    expect(contentProblems(huge as typeof c, ORG).join(" ")).toMatch(/too long/)
  })
})

describe("the background and advanced settings", () => {
  it("reads content saved before they existed: the banner gets its defaults and the advanced block is off", () => {
    const old = base() as unknown as Record<string, unknown>
    const oldHero: Record<string, unknown> = { ...base().hero }
    delete oldHero.overlay
    delete oldHero.align
    old.hero = oldHero
    delete old.pro
    const parsed = parseContent(JSON.stringify(old), "Acme Motors")
    expect(parsed.hero).toMatchObject({ overlay: "dark", align: "left" })
    expect(parsed.pro).toEqual(defaultPro())
    expect(parsed.hero.headline).toBe("Acme Motors") // the rest of the hero survived
  })

  it("only accepts the listed choices", () => {
    const set = (mut: (c: ReturnType<typeof base>) => void) => {
      const c = base()
      mut(c)
      return siteContentSchema.safeParse(c).success
    }
    expect(set((c) => (c.hero.overlay = "brand"))).toBe(true)
    expect(set((c) => ((c.hero as { overlay: string }).overlay = "none"))).toBe(false) // no way to remove the dark layer
    expect(set((c) => ((c.hero as { overlay: string }).overlay = "light"))).toBe(false)
    expect(set((c) => ((c.hero as { align: string }).align = "right"))).toBe(false)
    expect(set((c) => ((c.pro as { heroLayout: string }).heroLayout = "carousel"))).toBe(false)
    expect(set((c) => ((c.pro as { heroHeight: string }).heroHeight = "huge"))).toBe(false)
    expect(set((c) => (c.pro.announcement.text = "x".repeat(141)))).toBe(false)
    expect(set((c) => (c.pro.announcement.href = "http://insecure.example"))).toBe(false)
    expect(set((c) => (c.pro.announcement.href = "javascript:alert(1)"))).toBe(false)
    expect(set((c) => (c.pro.announcement.href = "https://acme.example/offer"))).toBe(true)
  })

  it("refuses section photos that aren't the business's own uploads", () => {
    const c = base()
    c.pro.aboutImageUrl = own("about.jpg")
    c.pro.contactImageUrl = own("contact.jpg")
    expect(contentProblems(c, ORG)).toEqual([])
    for (const field of ["aboutImageUrl", "contactImageUrl"] as const) {
      const bad = base()
      bad.pro[field] = "https://evil.example.com/x.jpg"
      expect(contentProblems(bad, ORG).join(" "), field).toMatch(/uploaded here/)
    }
  })
})

describe("publishProblems", () => {
  it("lists what a site still needs", () => {
    expect(publishProblems(base())).toEqual([])
    const c = base()
    c.hero.headline = ""
    c.seo.title = ""
    c.seo.description = ""
    expect(publishProblems(c)).toHaveLength(3)
  })
})
