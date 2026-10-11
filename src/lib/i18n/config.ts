// Languages: English (UK) is the default and lives at the normal URLs; French and German live under /fr and /de.
// Only the public marketing pages in TRANSLATED_PATHS are translated. Every other page (search, portals, checkout)
// stays English, so a /fr/<anything else> URL redirects to the English page instead of serving duplicate content.

export const LOCALES = ["en", "fr", "de"] as const
export type Locale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: Locale = "en"
export const LOCALE_COOKIE = "qmg-locale"

export const LOCALE_META: Record<Locale, { label: string; short: string; htmlLang: string; ogLocale: string }> = {
  en: { label: "English", short: "EN", htmlLang: "en-GB", ogLocale: "en_GB" },
  fr: { label: "Français", short: "FR", htmlLang: "fr", ogLocale: "fr_FR" },
  de: { label: "Deutsch", short: "DE", htmlLang: "de", ogLocale: "de_DE" },
}

export const isLocale = (v: unknown): v is Locale => typeof v === "string" && (LOCALES as readonly string[]).includes(v)

/** Public pages that have translated content (and therefore /fr and /de versions). */
export const TRANSLATED_PATHS = ["/", "/how-it-works", "/for-garages", "/garages", "/privacy", "/terms", "/cookies"] as const

export function isTranslatedPath(path: string): boolean {
  const clean = path.split(/[?#]/)[0].replace(/\/+$/, "") || "/"
  return (TRANSLATED_PATHS as readonly string[]).includes(clean)
}

/** "/fr/how-it-works" -> { locale: "fr", path: "/how-it-works" }; anything else -> { locale: null, path }. */
export function splitLocalePath(pathname: string): { locale: Locale | null; path: string } {
  const m = pathname.match(/^\/(fr|de)(\/.*)?$/)
  if (!m) return { locale: null, path: pathname }
  return { locale: m[1] as Locale, path: m[2] && m[2] !== "/" ? m[2] : "/" }
}

/**
 * The URL to link to for `path` in `locale`. Only translated pages get a prefix; links to untranslated pages (search,
 * login...) and external/hash links are returned unchanged.
 */
export function localePath(locale: Locale, path: string): string {
  if (locale === DEFAULT_LOCALE || !path.startsWith("/") || path.startsWith("//")) return path
  if (!isTranslatedPath(path)) return path
  const [base, ...rest] = path.split(/(?=[?#])/)
  const suffix = rest.join("")
  return `/${locale}${base === "/" ? "" : base}${suffix}`
}

/** hreflang map for a translated page ("path" without any locale prefix). */
export function languageAlternates(path: string, origin: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const l of LOCALES) out[LOCALE_META[l].htmlLang] = origin + localePath(l, path)
  out["x-default"] = origin + path
  return out
}
