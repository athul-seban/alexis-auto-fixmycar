import { DevelopedBy } from "@/components/layout/DevelopedBy"
import { LanguageSwitcher } from "@/components/layout/LanguageSwitcher"
import Link from "next/link"
import { Wrench, Phone, Mail, MapPin, Facebook, Twitter, Instagram, Linkedin } from "lucide-react"
import { localePath } from "@/lib/i18n/config"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { makeTranslator, type MessageKey } from "@/lib/i18n/messages"
import { liveLegalPages } from "@/lib/legal"

// Links only to pages that exist. Contact details, social profiles and legal pages appear once the business has filled
// them in under Admin > Content; until then they are left out rather than showing placeholders or linking to 404s.
const LINKS = {
  services: [
    { key: "footer.link.mot", href: "/search?service=MOT" },
    { key: "footer.link.fullService", href: "/search?service=FULL_SERVICE" },
    { key: "footer.link.brakes", href: "/search?service=BRAKES" },
    { key: "footer.link.tyres", href: "/search?service=TYRES" },
    { key: "footer.link.diagnostics", href: "/search?service=DIAGNOSTICS" },
    { key: "footer.link.repairs", href: "/search?service=REPAIR" },
    { key: "footer.link.clutch", href: "/search?service=CLUTCH" },
    { key: "footer.link.cambelt", href: "/search?service=CAMBELT" },
  ],
  company: [
    { key: "footer.link.howItWorks", href: "/how-it-works" },
    { key: "footer.link.blog", href: "/blog" },
    { key: "footer.link.byLocation", href: "/garages" },
    { key: "footer.link.postJob", href: "/post-job" },
  ],
  forGarages: [
    { key: "footer.link.listGarage", href: "/garage-register" },
    { key: "footer.link.garageLogin", href: "/login?type=garage" },
    { key: "footer.link.whyJoin", href: "/for-garages" },
  ],
} as const satisfies Record<string, readonly { key: MessageKey; href: string }[]>

const SOCIAL = [
  { key: "footer.social.facebook", label: "Facebook", Icon: Facebook },
  { key: "footer.social.x", label: "X", Icon: Twitter },
  { key: "footer.social.instagram", label: "Instagram", Icon: Instagram },
  { key: "footer.social.linkedin", label: "LinkedIn", Icon: Linkedin },
] as const satisfies readonly { key: MessageKey; label: string; Icon: unknown }[]

const isHttp = (u: string) => /^https?:\/\//i.test(u)

export async function Footer() {
  const locale = await getLocale()
  const messages = await getMessages(locale)
  const t = makeTranslator(messages)
  const lp = (path: string) => localePath(locale, path)
  const legal = await liveLegalPages(locale)

  const email = t("footer.email").trim()
  const phone = t("footer.phone").trim()
  const address = t("footer.address").trim()
  const social = SOCIAL.map((s) => ({ ...s, url: t(s.key).trim() })).filter((s) => isHttp(s.url))

  const columns = [
    { title: t("footer.col.services"), links: LINKS.services },
    { title: t("footer.col.company"), links: LINKS.company },
    { title: t("footer.col.forGarages"), links: LINKS.forGarages },
  ]

  return (
    <footer className="bg-[#0F1F3D] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-x-6 gap-y-10 lg:gap-10">
          <div className="col-span-2 md:col-span-3 lg:col-span-2">
            <Link href={lp("/")} className="flex items-center gap-2.5 mb-4">
              <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[#F97316]">
                <Wrench className="h-5 w-5 text-white" />
              </div>
              <span className="text-2xl font-bold">
                Quote<span className="text-[#F97316]">MyGarage</span>
              </span>
            </Link>
            <p className="text-slate-400 text-sm leading-relaxed max-w-xs mb-6">{t("footer.tagline")}</p>

            {(email || phone || address) && (
              <div className="space-y-2">
                {phone && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Phone className="h-4 w-4 text-[#F97316]" aria-hidden />
                    <a href={`tel:${phone.replace(/\s+/g, "")}`} className="hover:text-white">
                      {phone}
                    </a>
                  </div>
                )}
                {email && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <Mail className="h-4 w-4 text-[#F97316]" aria-hidden />
                    <a href={`mailto:${email}`} className="hover:text-white">
                      {email}
                    </a>
                  </div>
                )}
                {address && (
                  <div className="flex items-center gap-2 text-slate-400 text-sm">
                    <MapPin className="h-4 w-4 text-[#F97316]" aria-hidden />
                    <span>{address}</span>
                  </div>
                )}
              </div>
            )}

            {social.length > 0 && (
              <div className="flex items-center gap-3 mt-6">
                {social.map(({ Icon, label, url }) => (
                  <a
                    key={label}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={label}
                    className="flex items-center justify-center w-9 h-9 rounded-lg bg-white/10 hover:bg-[#F97316] transition-colors"
                  >
                    <Icon className="h-4 w-4" />
                  </a>
                ))}
              </div>
            )}
          </div>

          {columns.map((col) => (
            <div key={col.title}>
              <h3 className="font-semibold text-white mb-4">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <Link href={lp(link.href)} className="text-sm text-slate-400 hover:text-white transition-colors">
                      {t(link.key)}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>

      <div className="border-t border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex flex-col items-center gap-1 text-center md:items-start md:text-left">
              <p className="text-xs text-slate-400">{t("footer.copyright", { year: new Date().getFullYear() })}</p>
              <DevelopedBy className="text-xs text-slate-400" linkClassName="text-slate-200 hover:text-white" />
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 md:gap-x-6">
              {legal.map((page) => (
                <Link key={page.slug} href={lp(`/${page.slug}`)} className="text-xs text-slate-400 hover:text-white transition-colors whitespace-nowrap">
                  {page.title}
                </Link>
              ))}
              <LanguageSwitcher tone="dark" />
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}
