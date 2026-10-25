/* eslint-disable @next/next/no-img-element -- uploaded site photos come from our own blob store and are sized by the page */
import { BadgeCheck, BatteryCharging, CircleDot, ClipboardCheck, Cog, Disc, Droplets, ListChecks, MapPin, Phone, ScanLine, Search, Snowflake, Star, Wind, Wrench, Zap, type LucideIcon } from "lucide-react"
import { parseArticleBody, type Inline } from "@/lib/articles"
import type { SiteContent } from "@/lib/site/content"
import { locationAnchor } from "@/lib/site/jsonld"
import type { PublicLocation, PublicSite } from "@/lib/site/public"
import { deriveTheme, themeCssVars } from "@/lib/site/theme"
import { getServiceLabel } from "@/lib/utils"

// A business website, drawn from validated content. Rules that keep it safe and accessible:
//  - every piece of text is a React text node (never raw HTML); links are built from validated values only;
//  - colours come from CSS variables derived in src/lib/site/theme.ts, which guarantees 4.5:1 text contrast;
//  - text over a photo always sits on a dark (or brand) layer the business can't remove, so it reads on any picture;
//  - the page makes no requests of its own to the platform: booking and quotes link out to the main site.
//
// Design: the hero and the phone number are the loud parts. Everything else is quiet: ruled lists rather than a wall of cards,
// one accent, generous space. `content.pro` holds the advanced ("Website Pro") options; the loader has already swapped in the
// defaults for a business without the plan, so this component simply draws what it is given.

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

const SERVICE_ICON: Record<string, LucideIcon> = {
  MOT: ClipboardCheck,
  FULL_SERVICE: ListChecks,
  INTERIM_SERVICE: ListChecks,
  MINOR_SERVICE: Droplets,
  REPAIR: Wrench,
  DIAGNOSTICS: Search,
  TYRES: CircleDot,
  BRAKES: Disc,
  CLUTCH: Cog,
  CAMBELT: Cog,
  EXHAUST: Wind,
  BATTERY: BatteryCharging,
  WINDSCREEN: ScanLine,
  AIR_CON: Snowflake,
  ELECTRIC_SERVICE: Zap,
  OTHER: Wrench,
}

// Class names are written out in full so Tailwind can see them.
const HERO_HEIGHT: Record<SiteContent["pro"]["heroHeight"], string> = { compact: "min-h-[22rem]", standard: "min-h-[32rem]", tall: "min-h-[42rem]" }
const HERO_FOCUS: Record<SiteContent["pro"]["heroFocus"], string> = { top: "object-top", center: "object-center", bottom: "object-bottom" }

// One content column for header, banner, sections and footer: the side padding lives INSIDE the width cap, so every left edge lines up.
const section = "scroll-mt-24 py-16 sm:py-20"
const inner = "mx-auto w-full max-w-6xl px-4 sm:px-6"
const h2 = "text-3xl font-extrabold tracking-tight sm:text-4xl"
const lead = "mt-4 max-w-2xl text-lg leading-relaxed"
const btn = "inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--radius)] px-6 py-3 text-base font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--brand-text)]"
const btnPrimary = `${btn} bg-[var(--accent)] text-[var(--on-accent)] hover:bg-[var(--accent-dark)]`
const btnBrand = `${btn} bg-[var(--brand)] text-[var(--on-brand)] hover:bg-[var(--brand-dark)]`
const btnOutline = `${btn} border-2 border-[var(--brand)] text-[var(--brand-text)] hover:bg-[var(--brand-tint)]`
const btnLight = `${btn} border-2 border-current bg-transparent hover:bg-white/10`
const link = "font-medium text-[var(--brand-text)] underline underline-offset-2 hover:no-underline"

const balance = { textWrap: "balance" } as React.CSSProperties

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
    <div className="max-w-prose space-y-4 text-[1.0625rem] leading-7">
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
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 text-base" aria-label={`Opening hours, ${l.name}`}>
      {DAYS.map(([key, short]) => {
        const d = l.openingHours![key]
        return (
          <div key={key} className="contents">
            <dt className="border-b border-black/10 py-1.5 font-semibold">{short}</dt>
            <dd className="border-b border-black/10 py-1.5 tabular-nums">{d?.open ? `${d.from} to ${d.to}` : "Closed"}</dd>
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

/** What the platform knows about this business (never typed in by it): rating, review count, verification. */
function Trust({ site }: { site: PublicSite }) {
  const { rating, reviewCount, verified } = site.trust
  if (rating === null && !verified) return null
  return (
    <ul className="mt-8 flex flex-wrap items-center gap-x-7 gap-y-2 text-base" aria-label="About this garage on Quote My Garage">
      {rating !== null ? (
        <li className="inline-flex items-center gap-2">
          <Star className="h-5 w-5 fill-current" aria-hidden />
          <span>
            <strong>{rating.toFixed(1)}</strong> from {reviewCount} {reviewCount === 1 ? "review" : "reviews"} on Quote My Garage
          </span>
        </li>
      ) : null}
      {verified ? (
        <li className="inline-flex items-center gap-2">
          <BadgeCheck className="h-5 w-5" aria-hidden />
          <span>Verified by Quote My Garage</span>
        </li>
      ) : null}
    </ul>
  )
}

export function SiteRenderer({ site, appOrigin, preview = false, previewFor = "owner" }: SiteRendererProps) {
  const { content: c, locations, reviews, services } = site
  const pro = c.pro
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

  // The banner photo is a full-bleed background, or (advanced "split" layout) a framed picture beside the words.
  const photo = c.hero.imageUrl
  const split = pro.heroLayout === "split" && !!photo
  const background = !!photo && !split
  const centred = c.hero.align === "center" && !split
  // Text colour over the hero: white over a dark layer, the brand's own contrast colour over a brand layer or a plain brand background.
  const lightText = background && c.hero.overlay !== "brand"
  const heroText = lightText ? "text-white" : "text-[var(--on-brand)]"
  const announcement = pro.announcement.show && pro.announcement.text ? pro.announcement : null
  // Already checked when saved; checked again here so a stored value can never become a javascript: or http: link.
  const noticeHref = announcement && /^https:\/\/[^\s"'<>\\]+$/i.test(announcement.href) ? announcement.href : ""

  return (
    <div style={{ ...themeCssVars(d), fontFamily: "var(--font)" } as React.CSSProperties} className="min-h-screen scroll-smooth bg-white pb-24 text-slate-800 motion-reduce:scroll-auto md:pb-0">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded focus:bg-white focus:px-4 focus:py-2 focus:font-semibold focus:shadow-lg">
        Skip to content
      </a>
      {preview && (
        <div role="status" className="sticky top-0 z-50 bg-amber-300 px-4 py-2 text-center text-sm font-semibold text-black">
          {previewFor === "admin" ? "Admin review: this is the business's saved draft, which may differ from what visitors see." : "Preview: this is your draft, only you can see it. It isn't published."}
        </div>
      )}

      {announcement ? (
        <div role="region" aria-label="Notice" className="bg-[var(--accent)] px-4 py-2.5 text-center text-sm font-semibold text-[var(--on-accent)]">
          {noticeHref ? (
            <a href={noticeHref} target="_blank" rel="noopener noreferrer" className="underline underline-offset-4 hover:no-underline">{announcement.text}</a>
          ) : (
            announcement.text
          )}
        </div>
      ) : null}

      <header className="sticky top-0 z-40 border-b border-black/10 bg-[var(--brand)] text-[var(--on-brand)]" style={preview ? { top: "2.25rem" } : undefined}>
        <div className={`${inner} flex items-center justify-between gap-4 py-3`}>
          <a href="#top" className="flex min-w-0 items-center gap-3 font-bold">
            {site.logo ? <img src={site.logo} alt="" width={44} height={44} className="h-11 w-11 flex-shrink-0 rounded-[var(--radius)] bg-white object-contain" /> : null}
            <span className="truncate text-lg">{site.businessName}</span>
          </a>
          <nav aria-label="Sections" className="hidden items-center gap-6 text-sm font-medium lg:flex">
            {nav.map((n) => (
              <a key={n.href} href={n.href} className="underline-offset-4 hover:underline">{n.label}</a>
            ))}
          </nav>
          <div className="hidden items-center gap-5 md:flex">
            {first ? (
              <a href={telHref(first.phone)} className="inline-flex items-center gap-2 font-semibold underline-offset-4 hover:underline">
                <Phone className="h-4 w-4" aria-hidden />
                {first.phone}
              </a>
            ) : null}
            <a href={primaryHref} className={`${btnPrimary} min-h-11 py-2`}>{primaryLabel}</a>
          </div>
        </div>
        <nav aria-label="Sections (small screens)" className="flex gap-5 overflow-x-auto border-t border-white/10 px-4 py-2.5 text-sm font-medium lg:hidden">
          {nav.map((n) => (
            <a key={n.href} href={n.href} className="whitespace-nowrap underline-offset-4 hover:underline">{n.label}</a>
          ))}
        </nav>
      </header>

      <main id="main" tabIndex={-1}>
        <section id="top" className={`relative isolate flex overflow-hidden bg-[var(--brand)] ${HERO_HEIGHT[pro.heroHeight]} ${heroText}`}>
          {background ? (
            <>
              <img src={photo} alt="" className={`absolute inset-0 -z-10 h-full w-full object-cover ${HERO_FOCUS[pro.heroFocus]}`} />
              {c.hero.overlay === "brand" ? (
                <div aria-hidden className="absolute inset-0 -z-10" style={{ background: "color-mix(in srgb, var(--brand) 88%, transparent)" }} />
              ) : (
                <div aria-hidden className={`absolute inset-0 -z-10 ${c.hero.overlay === "darker" ? "bg-black/75" : "bg-black/60"}`} />
              )}
            </>
          ) : null}
          <div className={`${inner} flex flex-1 items-center py-16 sm:py-24`}>
            <div className={split ? "grid w-full items-center gap-10 lg:grid-cols-[1.15fr_0.85fr]" : "w-full"}>
              <div className={centred ? "mx-auto text-center" : ""}>
                <h1 className={`${centred ? "mx-auto" : ""} max-w-4xl text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl`} style={balance}>
                  {c.hero.headline || site.businessName}
                </h1>
                {c.hero.subheadline ? <p className={`${centred ? "mx-auto" : ""} mt-5 max-w-2xl text-lg leading-relaxed sm:text-xl`}>{c.hero.subheadline}</p> : null}
                <div className={`mt-8 flex flex-wrap gap-3 ${centred ? "justify-center" : ""}`}>
                  <a href={primaryHref} className={btnPrimary}>{primaryLabel}</a>
                  {first ? (
                    <a href={telHref(first.phone)} className={btnLight}>
                      <Phone className="h-5 w-5" aria-hidden />
                      Call {first.phone}
                    </a>
                  ) : null}
                </div>
                <div className={centred ? "flex justify-center" : ""}>
                  <Trust site={site} />
                </div>
              </div>
              {split ? <img src={photo} alt="" className={`aspect-[4/3] w-full rounded-[var(--radius)] object-cover ${HERO_FOCUS[pro.heroFocus]}`} width={800} height={600} /> : null}
            </div>
          </div>
        </section>

        {c.about.show && c.about.body ? (
          <section id="about" className={section}>
            <div className={inner}>
              <div className={pro.aboutImageUrl ? "grid items-start gap-10 md:grid-cols-2" : ""}>
                <div>
                  <h2 className={h2}>{c.about.title || "About us"}</h2>
                  <div className="mt-6"><Markdown body={c.about.body} appOrigin={appOrigin} /></div>
                </div>
                {pro.aboutImageUrl ? <img src={pro.aboutImageUrl} alt="" loading="lazy" decoding="async" width={800} height={600} className="aspect-[4/3] w-full rounded-[var(--radius)] object-cover" /> : null}
              </div>
            </div>
          </section>
        ) : null}

        {c.services.show && services.length > 0 ? (
          <section id="services" className={`${section} bg-[var(--brand-tint)]`}>
            <div className={inner}>
              <h2 className={h2}>{c.services.title || "What we do"}</h2>
              {c.services.intro ? <p className={lead}>{c.services.intro}</p> : null}
              <ul className="mt-8 grid gap-x-14 sm:grid-cols-2">
                {services.map((s) => {
                  const Icon = SERVICE_ICON[s] ?? Wrench
                  return (
                    <li key={s} className="flex items-center gap-4 border-b border-black/15 py-4 text-lg font-semibold">
                      <Icon className="h-6 w-6 flex-shrink-0 text-[var(--brand-text)]" aria-hidden />
                      {getServiceLabel(s)}
                    </li>
                  )
                })}
              </ul>
            </div>
          </section>
        ) : null}

        <section id="locations" className={section}>
          <div className={inner}>
            <h2 className={h2}>{c.locations.title || (multiple ? "Our locations" : "Find us")}</h2>
            {c.locations.intro ? <p className={lead}>{c.locations.intro}</p> : null}
            <ul className={`mt-8 grid gap-8 ${multiple ? "lg:grid-cols-2" : ""}`}>
              {locations.map((l) => (
                <li key={l.id} id={locationAnchor(l.slug)} className={`scroll-mt-28 rounded-[var(--radius)] border border-black/15 p-6 sm:p-8 ${multiple ? "" : "grid gap-8 md:grid-cols-2"}`}>
                  <div>
                    <h3 className="text-xl font-bold">{l.name}</h3>
                    <address className="mt-3 flex gap-2 not-italic">
                      <MapPin className="mt-1 h-5 w-5 flex-shrink-0 text-[var(--brand-text)]" aria-hidden />
                      <span>
                        {l.address}
                        <br />
                        {l.city} {l.postcode}
                      </span>
                    </address>
                    <a href={telHref(l.phone)} className="mt-4 inline-flex items-center gap-2 text-2xl font-extrabold text-[var(--brand-text)] underline-offset-4 hover:underline">
                      <Phone className="h-6 w-6" aria-hidden />
                      {l.phone}
                    </a>
                    <div className="mt-6 flex flex-wrap gap-3">
                      {l.bookable ? <a href={`${appOrigin}/widget/${l.slug}`} className={btnBrand}>Book online</a> : null}
                      <a href={`${appOrigin}/garage/${l.slug}`} className={btnOutline}>Get a quote</a>
                      <a href={mapsUrl(l)} target="_blank" rel="noopener noreferrer" className={`${btn} text-[var(--brand-text)] underline underline-offset-4`}>Directions</a>
                    </div>
                  </div>
                  {c.contact.showHours && l.openingHours ? (
                    <div className={multiple ? "mt-6" : ""}>
                      <h4 className="mb-2 text-lg font-bold">Opening hours</h4>
                      <Hours l={l} />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {c.gallery.show && c.gallery.images.length > 0 ? (
          <section id="gallery" className={`${section} bg-[var(--brand-tint)]`}>
            <div className={inner}>
              <h2 className={h2}>{c.gallery.title || "Gallery"}</h2>
              <ul className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
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
              <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-2">
                <h2 className={h2}>{c.reviews.title || "What customers say"}</h2>
                {site.trust.rating !== null ? (
                  <p className="text-lg">
                    <strong className="text-2xl font-extrabold">{site.trust.rating.toFixed(1)}</strong> average from {site.trust.reviewCount} {site.trust.reviewCount === 1 ? "review" : "reviews"}
                  </p>
                ) : null}
              </div>
              <ul className="mt-10 grid gap-10 md:grid-cols-2">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <figure className="border-l-4 border-[var(--accent)] pl-5">
                      <Stars n={r.rating} />
                      <blockquote className="mt-2 text-lg leading-relaxed">“{r.comment}”</blockquote>
                      <figcaption className="mt-3 text-base font-semibold">
                        {r.name}
                        {multiple && r.location ? <span className="font-normal text-slate-700"> at {r.location}</span> : null}
                      </figcaption>
                    </figure>
                  </li>
                ))}
              </ul>
              {first ? (
                <p className="mt-8">
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
              <div className="mt-8 max-w-3xl space-y-3">
                {c.faq.items.map((f, i) => (
                  <details key={i} className="group rounded-[var(--radius)] border border-black/15 bg-white p-5">
                    <summary className="cursor-pointer text-lg font-semibold">{f.q}</summary>
                    <p className="mt-3 leading-7">{f.a}</p>
                  </details>
                ))}
              </div>
            </div>
          </section>
        ) : null}

        <section id="contact" className={`${section} relative isolate overflow-hidden bg-[var(--brand)] ${pro.contactImageUrl ? "text-white" : "text-[var(--on-brand)]"}`}>
          {pro.contactImageUrl ? (
            <>
              <img src={pro.contactImageUrl} alt="" loading="lazy" decoding="async" className="absolute inset-0 -z-10 h-full w-full object-cover" />
              <div aria-hidden className="absolute inset-0 -z-10 bg-black/70" />
            </>
          ) : null}
          <div className={inner}>
            <h2 className={h2}>{c.contact.title || "Get in touch"}</h2>
            {c.contact.message ? <p className={lead}>{c.contact.message}</p> : null}
            {first ? (
              <a href={telHref(first.phone)} className="mt-6 inline-flex items-center gap-3 text-4xl font-extrabold tracking-tight underline-offset-8 hover:underline sm:text-6xl">
                <Phone className="h-8 w-8 sm:h-12 sm:w-12" aria-hidden />
                {first.phone}
              </a>
            ) : null}
            <div className="mt-8 flex flex-wrap gap-3">
              <a href={primaryHref} className={btnPrimary}>{primaryLabel}</a>
              {c.contact.email ? <a href={`mailto:${c.contact.email}`} className={btnLight}>{c.contact.email}</a> : null}
            </div>
            {social.length > 0 ? (
              <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-base font-medium" aria-label="Find us on social media">
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

      <footer className="border-t border-black/10 px-4 py-8 text-center text-sm text-slate-700 sm:px-6">
        © {new Date(site.updatedAt).getFullYear()} {site.businessName}.
        {pro.hideCredit ? null : (
          <>
            {" "}Bookings and quotes by <a href={appOrigin} className={link}>Quote My Garage</a>.
          </>
        )}
      </footer>

      {/* On a phone the two things a visitor wants are always one tap away. */}
      <div role="region" aria-label="Quick actions" className="fixed inset-x-0 bottom-0 z-40 flex gap-3 border-t border-black/10 bg-white p-3 md:hidden">
        {first ? (
          <a href={telHref(first.phone)} className={`${btnBrand} flex-1`}>
            <Phone className="h-5 w-5" aria-hidden />
            Call
          </a>
        ) : null}
        <a href={primaryHref} className={`${btnPrimary} flex-1`}>{primaryLabel}</a>
      </div>
    </div>
  )
}
