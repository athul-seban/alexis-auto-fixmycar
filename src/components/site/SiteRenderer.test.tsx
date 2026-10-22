import { describe, expect, it } from "vitest"
import { renderToStaticMarkup } from "react-dom/server"
import { defaultContent } from "@/lib/site/content"
import type { PublicLocation, PublicSite } from "@/lib/site/public"
import { DEFAULT_THEME } from "@/lib/site/theme"
import { SiteRenderer } from "./SiteRenderer"

const APP = "https://quotemygarage.com"

const loc = (over: Partial<PublicLocation> = {}): PublicLocation => ({
  id: "g1", slug: "acme-york", name: "Acme York", phone: "01904 123456", email: "york@acme.example", address: "12 Micklegate", city: "York", postcode: "YO1 6JX",
  latitude: 53.95, longitude: -1.08, openingHoursRaw: null, services: ["MOT", "FULL_SERVICE"], bookable: true,
  openingHours: { monday: { open: true, from: "09:00", to: "17:30" }, tuesday: { open: false, from: "", to: "" }, wednesday: { open: true, from: "09:00", to: "17:30" }, thursday: { open: true, from: "09:00", to: "17:30" }, friday: { open: true, from: "09:00", to: "17:30" }, saturday: { open: false, from: "", to: "" }, sunday: { open: false, from: "", to: "" } },
  ...over,
})

function site(over: Partial<PublicSite> = {}): PublicSite {
  return {
    siteId: "s1", organisationId: "o1", label: "acme", businessName: "Acme Motors", logo: null, theme: DEFAULT_THEME, content: defaultContent("Acme Motors"),
    locations: [loc()], reviews: [], services: ["MOT", "FULL_SERVICE"], updatedAt: "2026-10-22T10:00:00.000Z", ...over,
  }
}
const html = (s: PublicSite, preview = false) => renderToStaticMarkup(<SiteRenderer site={s} appOrigin={APP} preview={preview} />)

/** What a browser would actually build from the markup: any element or attribute that could run script. */
function scriptSurface(markup: string): string[] {
  const doc = new DOMParser().parseFromString(markup, "text/html")
  const found: string[] = []
  doc.querySelectorAll("script, iframe, object, embed, link, meta, base, form").forEach((e) => found.push(`<${e.tagName.toLowerCase()}>`))
  doc.querySelectorAll("*").forEach((e) => {
    for (const a of Array.from(e.attributes)) {
      if (/^on/i.test(a.name)) found.push(`${e.tagName.toLowerCase()}[${a.name}]`)
      if (/^(href|src)$/i.test(a.name) && /^\s*(javascript|data|vbscript):/i.test(a.value)) found.push(`${e.tagName.toLowerCase()}[${a.name}=${a.value.slice(0, 20)}]`)
    }
  })
  return found
}

describe("SiteRenderer: hostile content is only ever text", () => {
  it("escapes markup in every text field", () => {
    const evil = `<script>alert("x")</script><img src=x onerror=alert(1)>`
    const s = site()
    s.content.hero.headline = evil
    s.content.hero.subheadline = evil
    s.content.about.body = evil
    s.content.services.intro = evil
    s.content.contact.message = evil
    s.content.faq = { show: true, title: evil, items: [{ q: evil, a: evil }] }
    s.businessName = evil
    s.locations = [loc({ name: evil, address: evil })]
    const out = html(s)
    expect(scriptSurface(out)).toEqual([]) // no script, no event-handler attribute, no javascript: link
    expect(out).not.toContain("<script>")
    expect(out).toContain("&lt;script&gt;") // it is shown as text instead
  })

  it("never turns Markdown links into script or off-site hijacks", () => {
    const s = site()
    s.content.about = { show: true, title: "About", body: "[a](javascript:alert(1)) [b](/\\evil.com) [c](//evil.com) [d](https://ok.example/x) [e](/search?q=mot)" }
    const out = html(s)
    expect(scriptSurface(out)).toEqual([])
    expect(out).not.toMatch(/href="javascript:/i)
    expect(out).not.toMatch(/href="\/\\evil/)
    expect(out).not.toMatch(/href="\/\/evil/)
    expect(out).toContain('href="https://ok.example/x"')
    expect(out).toContain('rel="noopener noreferrer nofollow"')
    expect(out).toContain(`href="${APP}/search?q=mot"`) // a path on the site becomes a link to the main site
  })

  it("only draws photos it was given as plain addresses, with alt text, never as markup", () => {
    const s = site()
    s.content.gallery = { show: true, title: "Gallery", images: [{ url: "https://x.public.blob.vercel-storage.com/orgs/o1/a.jpg", alt: 'Workshop" onload="alert(1)' }] }
    const out = html(s)
    expect(out).toContain('alt="Workshop&quot; onload=&quot;alert(1)"')
    expect(scriptSurface(out)).toEqual([]) // the quote can't close the attribute and start another
  })

  it("puts nothing from the content into a style attribute except validated theme values", () => {
    const out = html(site({ theme: { brand: "#1E3A5F", accent: "#C2410C", font: "serif", radius: "lg" } }))
    const style = out.match(/<div style="([^"]*)"/)?.[1] ?? ""
    expect(style).toContain("--brand:#1E3A5F")
    expect(style).toContain("--radius:20px")
    expect(style).not.toMatch(/url\(|expression|javascript/i)
  })
})

describe("SiteRenderer: what visitors see", () => {
  it("shows the headline, the business, a skip link and landmarks", () => {
    const out = html(site())
    expect(out).toContain("<h1")
    expect(out).toContain("Acme Motors")
    expect(out).toContain('href="#main"')
    expect(out).toMatch(/<main id="main"/)
    expect(out).toMatch(/<footer/)
  })

  it("offers online booking when a location takes it, straight to that location's booking page", () => {
    const out = html(site())
    expect(out).toContain(`href="${APP}/widget/acme-york"`)
    expect(out).toContain("Book online")
    expect(out).toContain(`href="${APP}/garage/acme-york"`) // and a quote
  })

  it("falls back to quotes when no location takes online booking", () => {
    const out = html(site({ locations: [loc({ bookable: false })] }))
    expect(out).not.toContain("/widget/")
    expect(out).toContain("Get a quote")
  })

  it("with several locations, lists each with its own anchor, address, hours and links", () => {
    const leeds = loc({ id: "g2", slug: "acme-leeds", name: "Acme Leeds", city: "Leeds", postcode: "LS1 1AA", bookable: false })
    const out = html(site({ locations: [loc(), leeds] }))
    expect(out).toContain('id="location-acme-york"')
    expect(out).toContain('id="location-acme-leeds"')
    expect(out).toContain("Acme Leeds")
    expect(out).toContain('href="#locations"') // the main button leads to the list when there is a choice
    expect(out).toMatch(/Mon<\/dt><dd[^>]*>09:00–17:30/)
    expect(out).toContain("Closed")
    expect(out).toContain("tel:01904123456")
    expect(out).toMatch(/google\.com\/maps\/search/)
  })

  it("hides hours when switched off, and sections that are switched off or empty", () => {
    const s = site()
    s.content.contact.showHours = false
    s.content.services.show = false
    s.content.reviews.show = true // on, but nothing to show
    s.content.faq = { show: true, title: "Questions", items: [] }
    const out = html(s)
    expect(out).not.toContain("Opening hours")
    expect(out).not.toContain('id="services"')
    expect(out).not.toContain('id="reviews"')
    expect(out).not.toContain('id="faq"')
    expect(out).not.toContain('id="about"') // empty about is not drawn
  })

  it("shows reviews with first names and a link to read them all on the marketplace", () => {
    const out = html(site({ reviews: [{ id: "r1", rating: 5, comment: "Fantastic, honest and quick service.", name: "Pat", location: "Acme York", date: "2026-10-01T00:00:00.000Z" }] }))
    expect(out).toContain("Fantastic, honest and quick service.")
    expect(out).toContain("Pat")
    expect(out).toContain('aria-label="5 out of 5 stars"')
    expect(out).toContain("Read all reviews on Quote My Garage")
  })

  it("shows social links only when set, opening safely", () => {
    const s = site()
    s.content.social.facebook = "https://facebook.com/acme"
    const out = html(s)
    expect(out).toContain('href="https://facebook.com/acme"')
    expect(out).toContain('rel="noopener noreferrer me"')
    expect(out).not.toContain("Instagram")
  })

  it("marks a preview, and a live page has no banner", () => {
    expect(html(site(), true)).toContain("Preview: this is your draft")
    expect(html(site(), false)).not.toContain("Preview: this is your draft")
  })

  it("words the banner for an admin reviewing the business's draft, not as 'your draft'", () => {
    const out = renderToStaticMarkup(<SiteRenderer site={site()} appOrigin={APP} preview previewFor="admin" />)
    expect(out).toContain("Admin review")
    expect(out).not.toContain("your draft")
  })

  it("uses the business's logo only as an image", () => {
    const out = html(site({ logo: "https://x.public.blob.vercel-storage.com/orgs/o1/logo.png" }))
    expect(out).toContain('src="https://x.public.blob.vercel-storage.com/orgs/o1/logo.png"')
  })
})

describe("SiteRenderer: colour is derived, never typed in", () => {
  it("uses CSS variables for every brand colour so contrast comes from deriveTheme", () => {
    const out = html(site({ theme: { brand: "#FFEE00", accent: "#0000AA", font: "sans", radius: "md" } }))
    expect(out).toContain("--on-brand:#000000") // dark text on a yellow brand
    expect(out).toContain("--on-accent:#FFFFFF") // light text on a dark blue accent
    expect(out).not.toMatch(/style="[^"]*background:#/i) // no hard-coded colours in the markup
  })
})
