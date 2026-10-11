"use client"

import Link from "next/link"
import { createContext, useContext, useMemo } from "react"
import { DEFAULT_LOCALE, localePath, type Locale } from "./config"
import { interpolate } from "./format"
import { en, type MessageKey, type Messages } from "./messages/en"

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

// Client components get the language and only the strings they use (see clientMessages), passed from the root layout.

interface I18n {
  locale: Locale
  messages: Partial<Messages>
}

const Ctx = createContext<I18n>({ locale: DEFAULT_LOCALE, messages: {} })

export function I18nProvider({ locale, messages, children }: I18n & { children: React.ReactNode }) {
  const value = useMemo(() => ({ locale, messages }), [locale, messages])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useLocale = (): Locale => useContext(Ctx).locale

/** `const t = useT(); t("nav.signIn")`. Falls back to the built-in English text for a key the page didn't ship. */
export function useT(): Translate {
  const { messages } = useContext(Ctx)
  return (key: MessageKey, vars) => interpolate(messages[key] ?? en[key] ?? key, vars)
}

/** A next/link that keeps the visitor in their language on translated pages (other pages are English only). */
export function LocaleLink({ href, ...props }: React.ComponentProps<typeof Link>) {
  const locale = useLocale()
  return <Link href={typeof href === "string" ? localePath(locale, href) : href} {...props} />
}
