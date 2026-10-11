import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import { headers } from "next/headers"
import "./globals.css"
import { Providers } from "@/components/layout/Providers"
import { RegisterServiceWorker } from "@/components/layout/RegisterServiceWorker"
import { I18nProvider } from "@/lib/i18n/client"
import { LOCALES, LOCALE_META, isTranslatedPath, localePath } from "@/lib/i18n/config"
import { clientMessages, makeTranslator } from "@/lib/i18n/messages"
import { getLocale, getMessages } from "@/lib/i18n/server"

const inter = Inter({ subsets: ["latin"] })

export const viewport: Viewport = { themeColor: "#1E3A5F" }

export async function generateMetadata(): Promise<Metadata> {
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
  const locale = await getLocale()
  const messages = await getMessages(locale)

  return (
    <html lang={LOCALE_META[locale].htmlLang} suppressHydrationWarning>
      <body className={inter.className}>
        <I18nProvider locale={locale} messages={clientMessages(messages)}>
          <Providers>{children}</Providers>
        </I18nProvider>
        <RegisterServiceWorker />
      </body>
    </html>
  )
}
