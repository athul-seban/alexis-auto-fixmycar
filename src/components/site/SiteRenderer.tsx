/* eslint-disable @next/next/no-img-element -- uploaded site photos come from our own blob store and are sized by the page */
import { parseArticleBody, type Inline } from "@/lib/articles"
import { locationAnchor } from "@/lib/site/jsonld"
import type { PublicLocation, PublicSite } from "@/lib/site/public"
import { deriveTheme, themeCssVars } from "@/lib/site/theme"
import { getServiceLabel } from "@/lib/utils"

// A business website, drawn from validated content. Rules that keep it safe and accessible:
//  - every piece of text is a React text node (never raw HTML); links are built from validated values only;
//  - colours come from CSS variables derived in src/lib/site/theme.ts, which guarantees 4.5:1 text contrast;
//  - the page makes no requests of its own to the platform: booking and quotes link out to the main site.

export interface SiteRendererProps {
  site: PublicSite
  /** The main site's address (https://quotemygarage.com), where booking and quotes live. */
  appOrigin: string
  /** Show the "preview, not published" banner. */
  preview?: boolean
  /** Who is looking at the preview: the owner sees "your draft", an admin reviewing it sees the business's. */
  previewFor?: "owner" | "admin"
}

const DAYS = [
  ["monday", "Mon"],
  ["tuesday", "Tue"],
  ["wednesday", "Wed"],
  ["thursday", "Thu"],
  ["friday", "Fri"],
  ["saturday", "Sat"],
  ["sunday", "Sun"],
] as const

const SOCIAL_LABEL = { facebook: "Facebook", instagram: "Instagram", x: "X", youtube: "YouTube", tiktok: "TikTok" } as const

const section = "scroll-mt-20 px-4 py-14 sm:px-6"
const inner = "mx-auto w-full max-w-5xl"
const h2 = "text-2xl font-bold tracking-tight sm:text-3xl"
const btn = "inline-flex min-h-11 items-center justify-center rounded-[var(--radius)] px-5 py-2.5 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
const btnPrimary = `${btn} bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-dark)]`
const btnBrand = `${btn} bg-[var(--brand)] text-[var(--on-brand)] hover:bg-[var(--brand-dark)]`
const btnLight = `${btn} border-2 border-current bg-transparent hover:bg-white/10`
const link = "font-medium text-[var(--brand-text)] underline underline-offset-2 hover:no-underline"

const Inlines = ({ parts, appOrigin }: { parts: Inline[]; appOrigin: string }) => (
  <>
    {parts.map((p, i) => {
      if (p.type === "strong") return <strong key={i}>{p.text}</strong>
      if (p.type === "em") return <em key={i}>{p.text}</em>
      if (p.type === "link") {
        const internal = p.href.startsWith("/")
        return (
          <a key={i} href={internal ? `${appOrigin}${p.href}` : p.href} {...(internal ? {} : { rel: "noopener noreferrer nofollow", target: "_blank" })} className={link}>
            {p.text}
          </a>
        )
      }
      return <span key={i}>{p.text}</span>
    })}
  </>
)

function Markdown({ body, appOrigin }: { body: string; appOrigin: string }) {
  return (
    <div className="space-y-4 text-base leading-relaxed">
      {parseArticleBody(body).map((b, i) => {
        switch (b.type) {
          case "h2":
            return <h3 key={i} className="pt-2 text-xl font-bold">{b.text}</h3>
          case "h3":
            return <h4 key={i} className="pt-1 text-lg font-semibold">{b.text}</h4>
          case "p":
            return <p key={i}><Inlines parts={b.inline} appOrigin={appOrigin} /></p>
          case "quote":
            return <blockquote key={i} className="border-l-4 border-[var(--accent)] pl-4 italic"><Inlines parts={b.inline} appOrigin={appOrigin} /></blockquote>
          case "ul":
            return <ul key={i} className="list-disc space-y-1 pl-6">{b.items.map((it, j) => <li key={j}><Inlines parts={it} appOrigin={appOrigin} /></li>)}</ul>
          case "ol":
            return <ol key={i} className="list-decimal space-y-1 pl-6">{b.items.map((it, j) => <li key={j}><Inlines parts={it} appOrigin={appOrigin} /></li>)}</ol>
        }
      })}
    </div>
  )
}

const mapsUrl = (l: PublicLocation) => `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${l.name}, ${l.address}, ${l.city} ${l.postcode}`)}`
const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`

function Hours({ l }: { l: PublicLocation }) {
  if (!l.openingHours) return null
  return (
    <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm" aria-label={`Opening hours, ${l.name}`}>
      {DAYS.map(([key, short]) => {
        const d = l.openingHours![key]
        return (
          <div key={key} className="contents">
            <dt className="font-medium">{short}</dt>
            <dd className="tabular-nums">{d?.open ? `${d.from}–${d.to}` : "Closed"}</dd>
          </div>
        )
      })}
    </dl>
  )
}

function Stars({ n }: { n: number }) {
  return (
    <span role="img" aria-label={`${n} out of 5 stars`} className="text-[var(--accent-text)]">
      {"★".repeat(n)}
      <span aria-hidden className="text-slate-300">{"★".repeat(Math.max(0, 5 - n))}</span>
    </span>
  )
}

export function SiteRenderer({ site, appOrigin, preview = false, previewFor = "owner" }: SiteRendererProps) {
  const { content: c, locations, reviews, services } = site
  const d = deriveTheme(site.theme)
  const multiple = locations.length > 1
  const first = locations[0]
  const bookable = locations.filter((l) => l.bookable)
  // One bookable location: straight to its booking page. Otherwise let the visitor pick on the page.
  const primaryHref = bookable.length === 1 ? `${appOrigin}/widget/${bookable[0].slug}` : bookable.length > 1 ? `#locations` : first ? `${appOrigin}/garage/${first.slug}` : appOrigin
  const primaryLabel = bookable.length > 0 ? c.hero.ctaLabel || "Book online" : "Get a quote"

  const nav: { href: string; label: string }[] = [
    ...(c.about.show && c.about.body ? [{ href: "#about", label: c.about.title || "About" }] : []),
    ...(c.services.show && services.length > 0 ? [{ href: "#services", label: c.services.title || "Services" }] : []),
    { href: "#locations", label: multiple ? "Locations" : "Find us" },
    ...(c.reviews.show && reviews.length > 0 ? [{ href: "#reviews", label: "Reviews" }] : []),
    ...(c.faq.show && c.faq.items.length > 0 ? [{ href: "#faq", label: "FAQ" }] : []),
    { href: "#contact", label: "Contact" },
  ]
  const social = (Object.keys(SOCIAL_LABEL) as (keyof typeof SOCIAL_LABEL)[]).filter((k) => c.social[k])

  return (
    <div style={{ ...themeCssVars(d), fontFamily: "var(--font)" } as React.CSSProperties} className="min-h-screen bg-white text-slate-800">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:shadow-lg">
        Skip to content
      </a>
      {preview && (
        <div role="status" className="sticky top-0 z-50 bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-black">
          {previewFor === "admin" ? "Admin review: this is the business's saved draft, which may differ from what visitors see." : "Preview: this is your draft, only you can see it. It isn't published."}
        </div>
      )}

      <header className="sticky top-0 z-40 border-b border-black/10 bg-[var(--brand)] text-[var(--on-brand)]" style={preview ? { top: "2.25rem" } : undefined}>
        <div className={`${inner} flex items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
          <a href="#top" className="flex min-w-0 items-center gap-3 font-bold">
            {site.logo ? <img src={site.logo} alt="" width={40} height={40} className="h-10 w-10 flex-shrink-0 rounded-[var(--radius)] bg-white object-contain" /> : null}
            <span className="truncate text-lg">{site.businessName}</span>
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-5 text-sm font-medium md:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="underline-offset-4 hover:underline">{n.label}</a>
            ))}
          </nav>
          <a href={primaryHref} className={`${btnPrimary} hidden sm:inline-flex`}>{primaryLabel}</a>
        </div>
        <nav aria-label="Sections (small screens)" className="flex gap-4 overflow-x-auto border-t border-white/10 px-4 py-2 text-sm font-medium md:hidden">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="whitespace-nowrap underline-offset-4 hover:underline">{n.label}</a>
          ))}
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section id="top" className="relative isolate overflow-hidden bg-[var(--brand)] text-[var(--on-brand)]">
          {c.hero.imageUrl ? (
            <>
              <img src={c.hero.imageUrl} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover" />
              <div aria-hidden className="absolute inset-0 -z-10 bg-black/60" />
            </>
          ) : null}
          <div className={`${inner} px-4 py-20 sm:px-6 sm:py-28 ${c.hero.imageUrl ? "text-white" : ""}`}>
            <h1 className="max-w-3xl text-4xl font-extrabold tracking-tight sm:text-5xl">{c.hero.headline || site.businessName}</h1>
            {c.hero.subheadline ? <p className="mt-4 max-w-2xl text-lg opacity-95">{c.hero.subheadline}</p> : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={primaryHref} className={btnPrimary}>{primaryLabel}</a>
              <a href={first ? `${appOrigin}/garage/${first.slug}` : appOrigin} className={btnLight}>Get a quote</a>
            </div>
          </div>
        </section>

        {c.about.show && c.about.body ? (
          <section id="about" className={section}>
            <div className={inner}>
              <h2 className={h2}>{c.about.title || "About us"}</h2>
              <div className="mt-5 max-w-3xl"><Markdown body={c.about.body} appOrigin={appOrigin} /></div>
            </div>
          </section>
        ) : null}

        {c.services.show && services.length > 0 ? (
          <section id="services" className={`${section} bg-[var(--brand-tint)]`}>
            <div className={inner}>
              <h2 className={h2}>{c.services.title || "What we do"}</h2>
              {c.services.intro ? <p className="mt-3 max-w-3xl text-base leading-relaxed">{c.services.intro}</p> : null}
              <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {services.map((s) => (
                  <li key={s} className="rounded-[var(--radius)] border border-black/10 bg-white px-4 py-3 font-medium">{getServiceLabel(s)}</li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        <section id="locations" className={section}>
          <div className={inner}>
            <h2 className={h2}>{c.locations.title || (multiple ? "Our locations" : "Find us")}</h2>
            {c.locations.intro ? <p className="mt-3 max-w-3xl text-base leading-relaxed">{c.locations.intro}</p> : null}
            <ul className={`mt-6 grid gap-5 ${multiple ? "md:grid-cols-2" : ""}`}>
              {locations.map((l) => (
                <li key={l.id} id={locationAnchor(l.slug)} className="scroll-mt-24 rounded-[var(--radius)] border border-black/10 p-5">
                  <h3 className="text-lg font-bold">{l.name}</h3>
                  <address className="mt-2 not-italic">
                    {l.address}
                    <br />
                    {l.city} {l.postcode}
                  </address>
                  <p className="mt-2">
                    <a href={telHref(l.phone)} className={link}>{l.phone}</a>
                  </p>
                  {c.contact.showHours ? <Hours l={l} /> : null}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {l.bookable ? <a href={`${appOrigin}/widget/${l.slug}`} className={btnBrand}>Book online</a> : null}
                    <a href={`${appOrigin}/garage/${l.slug}`} className={`${btn} border-2 border-[var(--brand)] text-[var(--brand-text)] hover:bg-[var(--brand-tint)]`}>Get a quote</a>
                    <a href={mapsUrl(l)} target="_blank" rel="noopener noreferrer" className={`${btn} text-[var(--brand-text)] underline underline-offset-4`}>Directions</a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {c.gallery.show && c.gallery.images.length > 0 ? (
          <section id="gallery" className={`${section} bg-[var(--brand-tint)]`}>
            <div className={inner}>
              <h2 className={h2}>{c.gallery.title || "Gallery"}</h2>
              <ul className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3">
                {c.gallery.images.map((im, i) => (
                  <li key={`${im.url}-${i}`} className="overflow-hidden rounded-[var(--radius)] bg-white">
                    <img src={im.url} alt={im.alt} loading="lazy" decoding="async" width={600} height={450} className="aspect-[4/3] h-full w-full object-cover" />
                  </li>
                ))}
              </ul>
            </div>
          </section>
        ) : null}

        {c.reviews.show && reviews.length > 0 ? (
          <section id="reviews" className={section}>
            <div className={inner}>
              <h2 className={h2}>{c.reviews.title || "What customers say"}</h2>
              <ul className="mt-6 grid gap-5 md:grid-cols-2">
                {reviews.map((r) => (
                  <li key={r.id} className="rounded-[var(--radius)] border border-black/10 p-5">
                    <Stars n={r.rating} />
                    <blockquote className="mt-2 leading-relaxed">“{r.comment}”</blockquote>
                    <p className="mt-3 text-sm font-semibold">
                      {r.name}
                      {multiple && r.location ? <span className="font-normal text-slate-600"> · {r.location}</span> : null}
                    </p>
                  </li>
                ))}
              </ul>
              {first ? (
                <p className="mt-5 text-sm">
                  <a href={`${appOrigin}/garage/${first.slug}`} className={link}>Read all reviews on Quote My Garage</a>
                </p>
              ) : null}
            </div>
          </section>
        ) : null}

        {c.faq.show && c.faq.items.length > 0 ? (
          <section id="faq" className={`${section} bg-[var(--brand-tint)]`}>
            <div className={inner}>
              <h2 className={h2}>{c.faq.title || "Questions"}</h2>
              <div className="mt-6 max-w-3xl space-y-3">
                {c.faq.items.map((f, i) => (
                  <details key={i} className="group rounded-[var(--radius)] border border-black/10 bg-white p-4">
                    <summary className="cursor-pointer font-semibold">{f.q}</summary>
                    <p className="mt-2 leading-relaxed">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="contact" className={`${section} bg-[var(--brand)] text-[var(--on-brand)]`}>
          <div className={inner}>
            <h2 className={h2}>{c.contact.title || "Get in touch"}</h2>
            {c.contact.message ? <p className="mt-3 max-w-2xl text-base leading-relaxed">{c.contact.message}</p> : null}
            <div className="mt-6 flex flex-wrap gap-3">
              {first ? <a href={telHref(first.phone)} className={btnPrimary}>Call {first.phone}</a> : null}
              {c.contact.email ? <a href={`mailto:${c.contact.email}`} className={btnLight}>{c.contact.email}</a> : null}
              <a href={primaryHref} className={btnLight}>{primaryLabel}</a>
            </div>
            {social.length > 0 ? (
              <ul className="mt-6 flex flex-wrap gap-4 text-sm font-medium" aria-label="Find us on social media">
                {social.map((k) => (
                  <li key={k}>
                    <a href={c.social[k]} rel="noopener noreferrer me" target="_blank" className="underline underline-offset-4">{SOCIAL_LABEL[k]}</a>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </section>
      </main>

      <footer className="border-t border-black/10 px-4 py-6 text-center text-sm text-slate-700 sm:px-6">
        © {new Date(site.updatedAt).getFullYear()} {site.businessName}. Bookings and quotes by{" "}
        <a href={appOrigin} className={link}>Quote My Garage</a>.
      </footer>
    </div>
  )
}
