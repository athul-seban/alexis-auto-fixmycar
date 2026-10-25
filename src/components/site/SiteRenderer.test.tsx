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
    locations: [loc()], reviews: [], services: ["MOT", "FULL_SERVICE"], trust: { rating: null, reviewCount: 0, verified: false }, updatedAt: "2026-10-22T10:00:00.000Z", ...over,
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
    expect(out).toMatch(/Mon<\/dt><dd[^>]*>09:00 to 17:30/)
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

const PHOTO = "https://x.public.blob.vercel-storage.com/orgs/o1/hero.jpg"
const PHOTO2 = "https://x.public.blob.vercel-storage.com/orgs/o1/about.jpg"
const PHOTO3 = "https://x.public.blob.vercel-storage.com/orgs/o1/contact.jpg"

/** The hero section's markup only (up to the next section). */
const heroOf = (out: string) => out.match(/<section id="top"[\s\S]*?<\/section>/)?.[0] ?? ""
const withPro = (mut: (p: PublicSite["content"]["pro"]) => void, base = site()) => {
  mut(base.content.pro)
  return base
}

describe("SiteRenderer: the banner photo", () => {
  it("is a solid brand colour with no image until a photo is chosen", () => {
    const hero = heroOf(html(site()))
    expect(hero).not.toContain("<img")
    expect(hero).toContain("text-[var(--on-brand)]")
  })

  it("lays a dark layer over the photo, white text on it, and the photo behind everything", () => {
    const s = site()
    s.content.hero.imageUrl = PHOTO
    const hero = heroOf(html(s))
    expect(hero).toContain(`src="${PHOTO}"`)
    expect(hero).toContain("bg-black/60")
    expect(hero).toContain("text-white")
    expect(hero).toContain("-z-10")
  })

  it("has a darker layer and a brand-colour layer, and never an option with no layer", () => {
    const s = site()
    s.content.hero.imageUrl = PHOTO
    s.content.hero.overlay = "darker"
    expect(heroOf(html(s))).toContain("bg-black/75")
    s.content.hero.overlay = "brand"
    const brand = heroOf(html(s))
    expect(brand).toContain("color-mix(in srgb, var(--brand) 88%, transparent)")
    expect(brand).toContain("text-[var(--on-brand)]") // text colour follows the brand layer, so it stays readable on any brand
    expect(brand).not.toContain("bg-black/")
  })

  it("centres the words when asked", () => {
    const s = site()
    s.content.hero.align = "center"
    const hero = heroOf(html(s))
    expect(hero).toContain("text-center")
    expect(hero).toContain("justify-center")
    expect(heroOf(html(site()))).not.toContain("text-center")
  })

  it("keeps the phone number and the main button in the hero", () => {
    const hero = heroOf(html(site()))
    expect(hero).toContain("Call 01904 123456")
    expect(hero).toContain("Book online")
  })
})

describe("SiteRenderer: the trust line comes from the marketplace, not from the business", () => {
  it("shows the rating, the review count and verification when there are some", () => {
    const hero = heroOf(html(site({ trust: { rating: 4.8, reviewCount: 124, verified: true } })))
    expect(hero).toContain("<strong>4.8</strong> from 124 reviews on Quote My Garage")
    expect(hero).toContain("Verified by Quote My Garage")
  })

  it("says 'review' for one and omits a rating nobody has given", () => {
    expect(heroOf(html(site({ trust: { rating: 5, reviewCount: 1, verified: false } })))).toContain("from 1 review on")
    const none = heroOf(html(site()))
    expect(none).not.toContain("Quote My Garage")
    expect(none).not.toContain("<strong>")
    expect(heroOf(html(site({ trust: { rating: null, reviewCount: 0, verified: true } })))).toContain("Verified")
  })

  it("repeats the average above the reviews", () => {
    const out = html(site({ trust: { rating: 4.6, reviewCount: 30, verified: false }, reviews: [{ id: "r1", rating: 5, comment: "Fantastic, honest and quick service.", name: "Pat", location: "Acme York", date: "2026-10-01T00:00:00.000Z" }] }))
    expect(out).toContain("4.6</strong> average from 30 reviews")
  })
})

describe("SiteRenderer: the advanced ('Website Pro') options", () => {
  it("draws nothing of them by default", () => {
    const out = html(site())
    expect(out).not.toContain('aria-label="Notice"')
    expect(out).toContain("Bookings and quotes by")
    expect(out).not.toContain("min-h-[42rem]")
  })

  it("splits the hero into words and a framed photo, with no full-bleed background", () => {
    const s = site()
    s.content.hero.imageUrl = PHOTO
    const hero = heroOf(html(withPro((p) => (p.heroLayout = "split"), s)))
    expect(hero.match(/<img/g)).toHaveLength(1) // one picture, beside the text
    expect(hero).toContain("aspect-[4/3]")
    expect(hero).not.toContain("bg-black/")
    expect(hero).toContain("text-[var(--on-brand)]")
  })

  it("falls back to the normal hero when 'split' is chosen but there is no photo", () => {
    const hero = heroOf(html(withPro((p) => (p.heroLayout = "split"))))
    expect(hero).not.toContain("<img")
    expect(hero).not.toContain("lg:grid-cols")
  })

  it("sets the hero's height and where the photo is anchored", () => {
    const s = site()
    s.content.hero.imageUrl = PHOTO
    const hero = heroOf(html(withPro((p) => ((p.heroHeight = "tall"), (p.heroFocus = "top")), s)))
    expect(hero).toContain("min-h-[42rem]")
    expect(hero).toContain("object-top")
    expect(heroOf(html(withPro((p) => (p.heroHeight = "compact"))))).toContain("min-h-[22rem]")
  })

  it("shows an announcement bar, as a safe link only when given an https address", () => {
    const plain = html(withPro((p) => (p.announcement = { show: true, text: "Closed Monday for stock-take", href: "" })))
    expect(plain).toContain('aria-label="Notice"')
    expect(plain).toContain("Closed Monday for stock-take")
    expect(plain).not.toMatch(/aria-label="Notice"[^>]*>\s*<a /)

    const linked = html(withPro((p) => (p.announcement = { show: true, text: "Winter checks", href: "https://acme.example/winter" })))
    expect(linked).toContain('href="https://acme.example/winter"')
    expect(linked).toContain('rel="noopener noreferrer"')

    for (const href of ["javascript:alert(1)", "http://acme.example", "//evil.example", 'https://x" onclick="alert(1)']) {
      const bad = html(withPro((p) => (p.announcement = { show: true, text: "Notice", href })))
      expect(bad, href).not.toContain(`href="${href}"`)
      expect(scriptSurface(bad), href).toEqual([])
    }
  })

  it("hides the announcement when switched off or empty", () => {
    expect(html(withPro((p) => (p.announcement = { show: false, text: "Hello", href: "" })))).not.toContain('aria-label="Notice"')
    expect(html(withPro((p) => (p.announcement = { show: true, text: "", href: "" })))).not.toContain('aria-label="Notice"')
  })

  it("adds a photo beside the About text and behind the contact band", () => {
    const s = site()
    s.content.about = { show: true, title: "About", body: "We fix cars." }
    const out = html(withPro((p) => ((p.aboutImageUrl = PHOTO2), (p.contactImageUrl = PHOTO3)), s))
    expect(out).toContain(`src="${PHOTO2}"`)
    expect(out).toContain(`src="${PHOTO3}"`)
    expect(out.match(/<section id="contact"[\s\S]*?<\/section>/)?.[0]).toContain("bg-black/70") // dark enough for any picture
    expect(html(site())).not.toContain(PHOTO2)
  })

  it("removes the platform credit line only when asked", () => {
    expect(html(site())).toContain("Bookings and quotes by")
    const out = html(withPro((p) => (p.hideCredit = true)))
    expect(out).not.toContain("Bookings and quotes by")
    expect(out).toContain("© 2026 Acme Motors.")
  })

  it("escapes the announcement text like every other field", () => {
    const out = html(withPro((p) => (p.announcement = { show: true, text: '<img src=x onerror=alert(1)>', href: "" })))
    expect(scriptSurface(out)).toEqual([])
    expect(out).toContain("&lt;img")
  })
})

describe("SiteRenderer: the page's own design", () => {
  it("lists services with an icon each, not as a stack of cards", () => {
    const out = html(site({ services: ["MOT", "TYRES", "AIR_CON"] }))
    const services = out.match(/<section id="services"[\s\S]*?<\/section>/)?.[0] ?? ""
    expect(services.match(/<svg/g)).toHaveLength(3)
    expect(services).toContain("MOT Test")
    expect(services).not.toContain("shadow")
  })

  it("makes each location's phone number the biggest thing in it, as a call link, beside its opening hours", () => {
    const out = html(site())
    const locations = out.match(/<section id="locations"[\s\S]*?<\/section>/)?.[0] ?? ""
    expect(locations).toMatch(/<a href="tel:01904123456"[^>]*text-2xl/)
    expect(locations).toContain("Opening hours")
    expect(locations).toContain("md:grid-cols-2") // a single location lays out in two columns
  })

  it("keeps a call button and the main action one tap away on a phone", () => {
    const out = html(site())
    const bar = out.match(/<div role="region" aria-label="Quick actions"[\s\S]*?<\/div>/)?.[0] ?? ""
    expect(bar).toContain("md:hidden")
    expect(bar).toContain('href="tel:01904123456"')
    expect(bar).toContain(`href="${APP}/widget/acme-york"`)
    expect(out).toContain("pb-24") // so the bar never covers the footer
  })

  it("has no call button when no location is live, only the main action", () => {
    const out = html(site({ locations: [] }))
    expect(out).not.toContain("tel:")
    expect(out).toContain('aria-label="Quick actions"')
  })

  it("gives the phone number its own large treatment in the contact band", () => {
    const contact = html(site()).match(/<section id="contact"[\s\S]*?<\/section>/)?.[0] ?? ""
    expect(contact).toMatch(/<a href="tel:01904123456"[^>]*text-4xl/)
  })

  it("respects reduced motion (smooth scrolling is off for people who ask)", () => {
    expect(html(site())).toContain("motion-reduce:scroll-auto")
  })

  it("never uses an em dash or a middot to join facts, nor all-caps labels", () => {
    const out = html(site({ trust: { rating: 4.8, reviewCount: 12, verified: true } }))
    expect(out).not.toContain(" — ")
    expect(out).not.toContain(" · ")
    expect(out).not.toContain("uppercase")
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
