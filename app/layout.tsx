import type { Metadata, Viewport } from "next"
import { Inter, Barlow_Semi_Condensed } from "next/font/google"
import { headers } from "next/headers"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"
import { RegisterServiceWorker } from "@/components/layout/RegisterServiceWorker"
import { I18nProvider } from "@/lib/i18n/client"
import { LOCALES, LOCALE_META, isTranslatedPath, localePath } from "@/lib/i18n/config"
import { clientMessages, makeTranslator } from "@/lib/i18n/messages"
import { getLocale, getMessages } from "@/lib/i18n/server"
import { liveLegalPages } from "@/lib/legal"
import { LegalLinksProvider } from "@/components/shared/ConsentNotice"

const inter = Inter({ subsets: ["latin"] })
// Road-sign style display face for the public site headings (used via the `font-display` class).
const display = Barlow_Semi_Condensed({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-display" })

export const viewport: Viewport = { themeColor: "#1E3A5F" }

/**
 * Business websites (<label>.<root domain>) are rendered by app/sites/[label]. proxy.ts marks those requests with a header it
 * alone can set (a forged one is refused). They get none of the marketplace's furniture: no providers, language machinery,
 * compare bar or service worker, and their own metadata.
 */
const isSiteRequest = async () => (await headers()).has("x-qmg-site")

export async function generateMetadata(): Promise<Metadata> {
  // The marketplace's titles, icons and social tags would be wrong for a business's own website; the page supplies its own.
  if (await isSiteRequest()) return {}

  const locale = await getLocale()
  const t = makeTranslator(await getMessages(locale))
  const path = (await headers()).get("x-qmg-path") ?? "/"

  // Translated pages announce every language version to search engines (hreflang) and canonicalise to their own URL.
  const alternates = isTranslatedPath(path)
    ? {
        canonical: localePath(locale, path),
        languages: {
          ...Object.fromEntries(LOCALES.map((l) => [LOCALE_META[l].htmlLang, localePath(l, path)])),
          "x-default": path,
        },
      }
    : undefined

  return {
    applicationName: "Quote My Garage",
    appleWebApp: { capable: true, title: "Quote My Garage", statusBarStyle: "default" },
    icons: { icon: "/icons/192", apple: "/icons/192" },
    metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"),
    title: { default: t("meta.home.title"), template: "%s | Quote My Garage" },
    description: t("meta.home.description"),
    keywords: ["car repair", "mechanic", "garage", "MOT", "car service", "auto repair", "fix my car"],
    ...(alternates ? { alternates } : {}),
    openGraph: {
      type: "website",
      locale: LOCALE_META[locale].ogLocale,
      url: process.env.NEXT_PUBLIC_APP_URL,
      siteName: "Quote My Garage",
      title: t("meta.home.title"),
      description: t("meta.home.description"),
    },
    twitter: { card: "summary_large_image", title: t("meta.home.title"), description: t("meta.home.description") },
    robots: { index: true, follow: true },
  }
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  if (await isSiteRequest()) {
    return (
      <html lang="en-GB">
        <body>{children}</body>
      </html>
    )
  }

  const locale = await getLocale()
  const messages = await getMessages(locale)
  const legalLinks = (await liveLegalPages(locale)).map((p) => ({ slug: p.slug, title: p.title }))

  return (
    <html lang={LOCALE_META[locale].htmlLang} suppressHydrationWarning>
      <body className={`${inter.className} ${display.variable}`}>
        <I18nProvider locale={locale} messages={clientMessages(messages)}>
          <LegalLinksProvider links={legalLinks}>
            <Providers>{children}</Providers>
          </LegalLinksProvider>
        </I18nProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
