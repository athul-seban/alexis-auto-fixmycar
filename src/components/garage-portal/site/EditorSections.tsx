"use client"

import { useState } from "react"
import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { FieldLabel, NativeSelect, TextInput } from "@/components/ui/form-controls"
import { ALIGN_KEYS, HERO_FOCUS_KEYS, HERO_HEIGHT_KEYS, HERO_LAYOUT_KEYS, MAX_FAQ_ITEMS, MAX_GALLERY_IMAGES, OVERLAY_KEYS, type ProSettings, type SiteContent } from "@/lib/site/content"
import { STYLE_PRESETS, presetFor } from "@/lib/site/presets"
import type { SiteTier } from "@/lib/site/tier"
import { FONT_KEYS, MIN_CONTRAST, RADIUS_KEYS, contrast, deriveTheme, type SiteTheme } from "@/lib/site/theme"
import { Card, Field, ImageField, Toggle, uploadImage } from "@/components/garage-portal/site/fields"
import { ProGate } from "@/components/garage-portal/site/ProPanel"
import { cn } from "@/lib/utils"

export interface Draft {
  theme: SiteTheme
  content: SiteContent
  logo: string | null
}

interface Props {
  draft: Draft
  setDraft: (next: Draft) => void
  /** Where the business's live locations are listed (read-only here). */
  locations: { id: string; name: string; city: string; status: string }[]
  onError: (message: string) => void
  /** The server's new version after an upload that saved straight away (the logo). */
  onVersion: (version: number) => void
  /** The site's own address (host only), shown in the search result preview. */
  siteHost?: string
  /** What the business may use: the advanced ("Website Pro") controls are locked without it. */
  tier: SiteTier
}

const OVERLAY_LABEL: Record<(typeof OVERLAY_KEYS)[number], string> = { dark: "Dark", darker: "Darker", brand: "Your main colour" }
const ALIGN_LABEL: Record<(typeof ALIGN_KEYS)[number], string> = { left: "Left", center: "Centred" }
const LAYOUT_LABEL: Record<(typeof HERO_LAYOUT_KEYS)[number], string> = { standard: "Full-width photo", split: "Words beside a framed photo" }
const HEIGHT_LABEL: Record<(typeof HERO_HEIGHT_KEYS)[number], string> = { compact: "Compact", standard: "Standard", tall: "Tall" }
const FOCUS_LABEL: Record<(typeof HERO_FOCUS_KEYS)[number], string> = { top: "Top of the photo", center: "Middle of the photo", bottom: "Bottom of the photo" }

const FONT_LABEL: Record<(typeof FONT_KEYS)[number], string> = { sans: "Clean (sans-serif)", serif: "Classic (serif)", rounded: "Friendly (rounded)" }
const RADIUS_LABEL: Record<(typeof RADIUS_KEYS)[number], string> = { none: "Square", sm: "Slightly rounded", md: "Rounded", lg: "Very rounded" }

function ColourField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const [text, setText] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  if (value !== lastValue) {
    setLastValue(value)
    setText(value)
  }
  const valid = /^#[0-9a-fA-F]{6}$/.test(text)
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={`${label}: pick a colour`} value={valid ? text : value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-10 w-12 cursor-pointer rounded-lg border border-slate-200 bg-white p-1 dark:border-slate-700" />
        <TextInput
          aria-label={`${label}: hex code`}
          value={text}
          maxLength={7}
          onChange={(e) => {
            setText(e.target.value)
            if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) onChange(e.target.value.toUpperCase())
          }}
          className="w-32 font-mono uppercase"
          aria-invalid={!valid}
        />
      </div>
      {!valid ? <p role="alert" className="mt-1 text-xs text-red-700 dark:text-red-400">Use six digits, like #1E3A5F</p> : null}
    </div>
  )
}

export function EditorSections({ draft, setDraft, locations, onError, onVersion, siteHost, tier }: Props) {
  const { theme, content: c } = draft
  const d = deriveTheme(theme)
  const activePreset = presetFor(theme)
  const set = <K extends keyof SiteContent>(key: K, patch: Partial<SiteContent[K]>) => setDraft({ ...draft, content: { ...c, [key]: { ...c[key], ...patch } } })
  const setPro = (patch: Partial<ProSettings>) => set("pro", patch)
  const setTheme = (patch: Partial<SiteTheme>) => setDraft({ ...draft, theme: { ...theme, ...patch } })
  const live = locations.filter((l) => l.status === "APPROVED")
  const [galleryBusy, setGalleryBusy] = useState(false)

  const addGallery = async (files: FileList | null) => {
    if (!files) return
    setGalleryBusy(true)
    let images = [...c.gallery.images]
    for (const file of Array.from(files)) {
      if (images.length >= MAX_GALLERY_IMAGES) break
      const r = await uploadImage(file, "gallery")
      if (!r.ok) {
        onError(r.error)
        break
      }
      images = [...images, { url: r.url, alt: "" }]
    }
    setGalleryBusy(false)
    setDraft({ ...draft, content: { ...c, gallery: { ...c.gallery, images } } })
  }

  return (
    <>
      <Card title="Look and feel" description="Your logo, colours and style. Text colours are chosen for you so everything stays easy to read.">
        <ImageField
          label="Logo"
          square
          url={draft.logo}
          kind="logo"
          hint="PNG, JPEG or WebP, up to 2 MB. Shown in the page header and when the site is shared."
          onError={onError}
          onUploaded={(url, version) => {
            setDraft({ ...draft, logo: url })
            if (version) onVersion(version)
          }}
          onRemove={() => setDraft({ ...draft, logo: null })}
        />
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Start from a ready-made style (you can change anything after)</p>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {STYLE_PRESETS.map((p) => {
              const on = activePreset?.id === p.id
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    aria-pressed={on}
                    onClick={() => setTheme(p.theme)}
                    className={cn("flex w-full cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1E3A5F]", on ? "border-[#1E3A5F] bg-blue-50 dark:border-blue-400 dark:bg-blue-500/10" : "border-slate-200 hover:bg-slate-50 dark:border-white/10 dark:hover:bg-white/5")}
                  >
                    <span className="flex flex-shrink-0 -space-x-1" aria-hidden>
                      <span className="h-6 w-6 rounded-full border border-white" style={{ background: p.theme.brand }} />
                      <span className="h-6 w-6 rounded-full border border-white" style={{ background: p.theme.accent }} />
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-slate-900 dark:text-white">{p.name}</span>
                      <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{p.blurb}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <ColourField label="Main colour" value={theme.brand} onChange={(v) => setTheme({ brand: v })} />
          <ColourField label="Button colour" value={theme.accent} onChange={(v) => setTheme({ accent: v })} />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <FieldLabel htmlFor="site-font">Font style</FieldLabel>
            <NativeSelect id="site-font" value={theme.font} onChange={(e) => setTheme({ font: e.target.value as SiteTheme["font"] })}>
              {FONT_KEYS.map((f) => (
                <option key={f} value={f}>{FONT_LABEL[f]}</option>
              ))}
            </NativeSelect>
          </div>
          <div>
            <FieldLabel htmlFor="site-radius">Corners</FieldLabel>
            <NativeSelect id="site-radius" value={theme.radius} onChange={(e) => setTheme({ radius: e.target.value as SiteTheme["radius"] })}>
              {RADIUS_KEYS.map((r) => (
                <option key={r} value={r}>{RADIUS_LABEL[r]}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
        {/* A live swatch: the same derived colours the website uses. */}
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-white/10" style={{ fontFamily: d.fontStack }} aria-label="Colour preview">
          <div className="px-4 py-3 text-sm font-bold" style={{ background: d.brand, color: d.onBrand }}>
            Your main colour: {contrast(d.onBrand, d.brand).toFixed(1)}:1 contrast
          </div>
          <div className="flex flex-wrap items-center gap-3 bg-white px-4 py-3">
            <span className="px-4 py-2 text-sm font-semibold" style={{ background: d.accent, color: d.onAccent, borderRadius: d.radius }}>Book online</span>
            <span className="text-sm font-semibold" style={{ color: d.brandText }}>A heading in your colour</span>
          </div>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Text on your colours always meets the {MIN_CONTRAST}:1 readability standard, so a very light or very dark choice just flips the text between white and black.
        </p>
      </Card>

      <Card title="Home banner" description="The first thing visitors see.">
        <Field label="Headline" value={c.hero.headline} max={90} onChange={(v) => set("hero", { headline: v })} />
        <Field label="Line under the headline" value={c.hero.subheadline} max={220} multiline rows={2} onChange={(v) => set("hero", { subheadline: v })} />
        <Field label="Main button text" value={c.hero.ctaLabel} max={30} hint="Shown when a location takes online booking." onChange={(v) => set("hero", { ctaLabel: v })} />
        <ImageField label="Banner photo (optional)" url={c.hero.imageUrl} kind="hero" hint="Becomes the background of the banner. Wide photos work best." onError={onError} onUploaded={(url) => set("hero", { imageUrl: url })} onRemove={() => set("hero", { imageUrl: null })} />
        <div className="grid gap-4 sm:grid-cols-2">
          {c.hero.imageUrl ? (
            <div>
              <FieldLabel htmlFor="hero-overlay">Layer over the photo</FieldLabel>
              <NativeSelect id="hero-overlay" value={c.hero.overlay} onChange={(e) => set("hero", { overlay: e.target.value as SiteContent["hero"]["overlay"] })}>
                {OVERLAY_KEYS.map((k) => (
                  <option key={k} value={k}>{OVERLAY_LABEL[k]}</option>
                ))}
              </NativeSelect>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Every choice is dark enough for the words to read on any photo.</p>
            </div>
          ) : null}
          <div>
            <FieldLabel htmlFor="hero-align">Where the words sit</FieldLabel>
            <NativeSelect id="hero-align" value={c.hero.align} onChange={(e) => set("hero", { align: e.target.value as SiteContent["hero"]["align"] })}>
              {ALIGN_KEYS.map((k) => (
                <option key={k} value={k}>{ALIGN_LABEL[k]}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <ProGate tier={tier} title="Banner design">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <FieldLabel htmlFor="hero-layout">Layout</FieldLabel>
              <NativeSelect id="hero-layout" value={c.pro.heroLayout} onChange={(e) => setPro({ heroLayout: e.target.value as ProSettings["heroLayout"] })}>
                {HERO_LAYOUT_KEYS.map((k) => (
                  <option key={k} value={k}>{LAYOUT_LABEL[k]}</option>
                ))}
              </NativeSelect>
              {c.pro.heroLayout === "split" && !c.hero.imageUrl ? <p className="mt-1 text-xs text-amber-800 dark:text-amber-300">Add a banner photo to use this layout.</p> : null}
            </div>
            <div>
              <FieldLabel htmlFor="hero-height">Height</FieldLabel>
              <NativeSelect id="hero-height" value={c.pro.heroHeight} onChange={(e) => setPro({ heroHeight: e.target.value as ProSettings["heroHeight"] })}>
                {HERO_HEIGHT_KEYS.map((k) => (
                  <option key={k} value={k}>{HEIGHT_LABEL[k]}</option>
                ))}
              </NativeSelect>
            </div>
            <div>
              <FieldLabel htmlFor="hero-focus">Show</FieldLabel>
              <NativeSelect id="hero-focus" value={c.pro.heroFocus} onChange={(e) => setPro({ heroFocus: e.target.value as ProSettings["heroFocus"] })}>
                {HERO_FOCUS_KEYS.map((k) => (
                  <option key={k} value={k}>{FOCUS_LABEL[k]}</option>
                ))}
              </NativeSelect>
            </div>
          </div>
        </ProGate>
      </Card>

      <Card title="About us">
        <Toggle label="Show this section" checked={c.about.show} onChange={(v) => set("about", { show: v })} hint="Only appears once you've written something." />
        <Field label="Heading" value={c.about.title} max={60} onChange={(v) => set("about", { title: v })} />
        <Field label="Your story" value={c.about.body} max={4000} multiline rows={8} hint="Plain text. You can use **bold**, *italic*, - bullet lists, and [links](https://example.com)." onChange={(v) => set("about", { body: v })} />
        <ProGate tier={tier} title="Photo with your story">
          <ImageField label="Photo beside your story" url={c.pro.aboutImageUrl} kind="section" hint="Shown next to the text on a wide screen, above it on a phone." onError={onError} onUploaded={(url) => setPro({ aboutImageUrl: url })} onRemove={() => setPro({ aboutImageUrl: null })} />
        </ProGate>
      </Card>

      <Card title="Services" description="The services are listed automatically from what your locations offer.">
        <Toggle label="Show this section" checked={c.services.show} onChange={(v) => set("services", { show: v })} />
        <Field label="Heading" value={c.services.title} max={60} onChange={(v) => set("services", { title: v })} />
        <Field label="Introduction (optional)" value={c.services.intro} max={300} multiline rows={2} onChange={(v) => set("services", { intro: v })} />
      </Card>

      <Card title="Locations" description="Every live location is shown automatically with its address, phone, opening hours and booking link, so these never go out of date. Change them on each location's Profile page.">
        <Field label="Heading" value={c.locations.title} max={60} onChange={(v) => set("locations", { title: v })} />
        <Field label="Introduction (optional)" value={c.locations.intro} max={300} multiline rows={2} onChange={(v) => set("locations", { intro: v })} />
        <div>
          <p className="mb-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Shown on your website now</p>
          {live.length === 0 ? (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">None of your locations is live yet. Your website can go live once at least one is approved.</p>
          ) : (
            <ul className="space-y-1 text-sm text-slate-700 dark:text-slate-300">
              {live.map((l) => (
                <li key={l.id}>{l.name} <span className="text-slate-500 dark:text-slate-400">· {l.city}</span></li>
              ))}
            </ul>
          )}
          {locations.length > live.length ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{locations.length - live.length} other location{locations.length - live.length === 1 ? " isn't" : "s aren't"} shown (waiting for approval, suspended or archived).</p> : null}
        </div>
      </Card>

      <Card title="Photos" description="A few photos of your workshop and team.">
        <Toggle label="Show this section" checked={c.gallery.show} onChange={(v) => set("gallery", { show: v })} />
        <Field label="Heading" value={c.gallery.title} max={60} onChange={(v) => set("gallery", { title: v })} />
        <ul className="grid gap-3 sm:grid-cols-2">
          {c.gallery.images.map((im, i) => (
            <li key={`${im.url}-${i}`} className="flex gap-3 rounded-lg border border-slate-200 p-2 dark:border-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element -- our own uploaded image */}
              <img src={im.url} alt="" className="h-16 w-20 flex-shrink-0 rounded object-cover" />
              <div className="min-w-0 flex-1">
                <label className="sr-only" htmlFor={`alt-${i}`}>Description of photo {i + 1}</label>
                <TextInput id={`alt-${i}`} value={im.alt} maxLength={120} placeholder="Describe the photo (for people who can't see it)" onChange={(e) => set("gallery", { images: c.gallery.images.map((x, j) => (j === i ? { ...x, alt: e.target.value } : x)) })} />
              </div>
              <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => set("gallery", { images: c.gallery.images.filter((_, j) => j !== i) })} className="cursor-pointer self-start rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
        {c.gallery.images.length < MAX_GALLERY_IMAGES ? (
          <div>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-white/5">
              <Plus className="h-4 w-4" /> {galleryBusy ? "Uploading…" : "Add photos"}
              <input type="file" multiple accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={galleryBusy} onChange={(e) => { void addGallery(e.target.files); e.target.value = "" }} />
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Up to {MAX_GALLERY_IMAGES} photos, 2 MB each.</p>
          </div>
        ) : null}
      </Card>

      <Card title="Customer reviews" description="Your best recent reviews from the marketplace are shown automatically, with first names only.">
        <Toggle label="Show this section" checked={c.reviews.show} onChange={(v) => set("reviews", { show: v })} hint="Only appears once you have good reviews." />
        <Field label="Heading" value={c.reviews.title} max={60} onChange={(v) => set("reviews", { title: v })} />
      </Card>

      <Card title="Questions and answers">
        <Toggle label="Show this section" checked={c.faq.show} onChange={(v) => set("faq", { show: v })} />
        <Field label="Heading" value={c.faq.title} max={60} onChange={(v) => set("faq", { title: v })} />
        <ul className="space-y-4">
          {c.faq.items.map((f, i) => (
            <li key={i} className="space-y-2 rounded-lg border border-slate-200 p-3 dark:border-white/10">
              <Field label={`Question ${i + 1}`} value={f.q} max={150} onChange={(v) => set("faq", { items: c.faq.items.map((x, j) => (j === i ? { ...x, q: v } : x)) })} />
              <Field label="Answer" value={f.a} max={600} multiline rows={3} onChange={(v) => set("faq", { items: c.faq.items.map((x, j) => (j === i ? { ...x, a: v } : x)) })} />
              <Button type="button" size="sm" variant="secondary" className="gap-1 text-red-700 dark:text-red-400" onClick={() => set("faq", { items: c.faq.items.filter((_, j) => j !== i) })}>
                <Trash2 className="h-3.5 w-3.5" /> Remove
              </Button>
            </li>
          ))}
        </ul>
        {c.faq.items.length < MAX_FAQ_ITEMS ? (
          <Button type="button" size="sm" variant="secondary" className="gap-1" onClick={() => set("faq", { items: [...c.faq.items, { q: "", a: "" }] })}>
            <Plus className="h-4 w-4" /> Add a question
          </Button>
        ) : null}
      </Card>

      <Card title="Contact and social">
        <Field label="Heading" value={c.contact.title} max={60} onChange={(v) => set("contact", { title: v })} />
        <Field label="Message (optional)" value={c.contact.message} max={300} multiline rows={2} onChange={(v) => set("contact", { message: v })} />
        <Field label="Email address (optional)" type="email" value={c.contact.email} max={200} hint="Shown as a button. Phone numbers come from your locations." onChange={(v) => set("contact", { email: v })} />
        <Toggle label="Show opening hours" checked={c.contact.showHours} onChange={(v) => set("contact", { showHours: v })} />
        <div className="grid gap-4 sm:grid-cols-2">
          {(["facebook", "instagram", "x", "youtube", "tiktok"] as const).map((k) => (
            <Field key={k} label={k === "x" ? "X (Twitter) link" : `${k[0].toUpperCase()}${k.slice(1)} link`} value={c.social[k]} max={300} placeholder="https://" onChange={(v) => set("social", { [k]: v })} />
          ))}
        </div>
        <ProGate tier={tier} title="Photo behind your contact details">
          <ImageField label="Background photo" url={c.pro.contactImageUrl} kind="section" hint="Sits behind a dark layer, so the phone number always reads." onError={onError} onUploaded={(url) => setPro({ contactImageUrl: url })} onRemove={() => setPro({ contactImageUrl: null })} />
        </ProGate>
      </Card>

      <Card title="Notice bar and finishing touches" description="A short message above everything else, and the small print at the bottom.">
        <ProGate tier={tier} title="Notice bar and credit line">
          <Toggle label="Show a notice bar" checked={c.pro.announcement.show} onChange={(v) => setPro({ announcement: { ...c.pro.announcement, show: v } })} hint="For holiday opening hours, a special offer or a closure." />
          <Field label="Notice" value={c.pro.announcement.text} max={140} onChange={(v) => setPro({ announcement: { ...c.pro.announcement, text: v } })} placeholder="Closed Monday 28 December. Back on Tuesday." />
          <Field label="Link (optional)" value={c.pro.announcement.href} max={300} placeholder="https://" hint="Turns the notice into a link. It must start with https://" onChange={(v) => setPro({ announcement: { ...c.pro.announcement, href: v } })} />
          <Toggle label="Remove “Bookings and quotes by Quote My Garage”" checked={c.pro.hideCredit} onChange={(v) => setPro({ hideCredit: v })} hint="Takes the line out of the footer. Your booking and quote buttons keep working." />
        </ProGate>
      </Card>

      <Card title="How you appear in search results" description="What Google shows for your website.">
        <Field label="Page title" value={c.seo.title} max={70} hint="Include your name and town, e.g. “Acme Motors: MOT & servicing in York”." onChange={(v) => set("seo", { title: v })} />
        <Field label="Description" value={c.seo.description} max={160} multiline rows={3} onChange={(v) => set("seo", { description: v })} />
        <div className="rounded-lg border border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-slate-900" aria-label="Search result preview">
          <p className="truncate text-base text-blue-800 dark:text-blue-300">{c.seo.title || "Your page title"}</p>
          <p className="text-xs text-green-800 dark:text-green-400">{siteHost || "your-address.example.com"}</p>
          <p className="line-clamp-2 text-sm text-slate-600 dark:text-slate-300">{c.seo.description || "Your description will appear here."}</p>
        </div>
      </Card>
    </>
  )
}
