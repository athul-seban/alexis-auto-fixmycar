"use client"

import { Suspense } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import { LOCALES, LOCALE_META, isTranslatedPath, localePath, splitLocalePath } from "@/lib/i18n/config"
import { useLocale, useT } from "@/lib/i18n/client"
import { cn } from "@/lib/utils"

/**
 * EN | FR | DE. On a translated page each link goes to that page's /fr or /de URL. On any other page it goes through
 * /api/locale, which remembers the language for the header and footer and returns to the same page.
 */
type Props = { className?: string; tone?: "light" | "dark" }

function Switcher({ className, tone = "light" }: Props) {
  const pathname = usePathname() ?? "/"
  const query = useSearchParams()?.toString()
  const current = useLocale()
  const t = useT()
  const { path: base } = splitLocalePath(pathname)

  const hrefFor = (l: (typeof LOCALES)[number]) => {
    if (isTranslatedPath(base)) return localePath(l, base)
    const here = base + (query ? `?${query}` : "")
    return `/api/locale?l=${l}&next=${encodeURIComponent(here)}`
  }

  return (
    <nav aria-label={t("lang.switch")} className={cn("flex items-center gap-1", className)}>
      {LOCALES.map((l) => {
        const active = l === current
        return (
          <a
            key={l}
            href={hrefFor(l)}
            lang={LOCALE_META[l].htmlLang}
            hrefLang={LOCALE_META[l].htmlLang}
            aria-current={active ? "true" : undefined}
            title={LOCALE_META[l].label}
            className={cn(
              "rounded-md px-2 py-1 text-xs font-bold transition-colors",
              active
                ? "bg-[#1E3A5F] text-white dark:bg-white dark:text-[#1E3A5F]"
                : tone === "dark"
                  ? "text-slate-300 hover:bg-white/10 hover:text-white"
                  : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-white/10"
            )}
          >
            {LOCALE_META[l].short}
          </a>
        )
      })}
    </nav>
  )
}

// useSearchParams needs a Suspense boundary on statically built pages (the 404, /compare); until it resolves the links
// simply point at the page without its query string.
export function LanguageSwitcher(props: Props) {
  return (
    <Suspense fallback={null}>
      <Switcher {...props} />
    </Suspense>
  )
}
