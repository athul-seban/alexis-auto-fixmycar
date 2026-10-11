import { DEFAULT_LOCALE, type Locale } from "./config"
import { en, type EnglishOnlyKey, type MessageKey, type Messages, type TranslatedMessages } from "./messages/en"
import { fr } from "./messages/fr"
import { de } from "./messages/de"
import { interpolate } from "./format"

// Pure message logic (no Next / database imports) so it can be unit-tested and used from client components.

export type { MessageKey, Messages }
export { interpolate }

// French and German have no email wording of their own, so they carry the English text for those keys.
const withEnglishFallback = (m: TranslatedMessages): Messages => ({ ...en, ...m })

export const DEFAULT_MESSAGES: Record<Locale, Messages> = { en, fr: withEnglishFallback(fr), de: withEnglishFallback(de) }

export const isEnglishOnlyKey = (key: string): key is EnglishOnlyKey => key.startsWith("email.")

export const MESSAGE_KEYS = Object.keys(en) as MessageKey[]

export const isMessageKey = (k: string): k is MessageKey => k in en

/** Built-in default for a key: the language's own text, falling back to English. */
export function defaultFor(locale: Locale, key: MessageKey): string {
  return DEFAULT_MESSAGES[locale]?.[key] ?? DEFAULT_MESSAGES[DEFAULT_LOCALE][key]
}

/** Defaults for a language with the admin's published overrides applied (unknown keys and empty values are ignored). */
export function buildMessages(locale: Locale, overrides: Record<string, string> = {}): Messages {
  const out = { ...DEFAULT_MESSAGES[DEFAULT_LOCALE], ...DEFAULT_MESSAGES[locale] } as Messages
  for (const [k, v] of Object.entries(overrides)) if (isMessageKey(k) && v.trim() !== "") out[k] = v
  return out
}

export type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string

export function makeTranslator(messages: Messages): Translate {
  return (key, vars) => interpolate(messages[key] ?? key, vars)
}

/** Keys the browser needs (client components); the rest stay on the server. */
export const CLIENT_PREFIXES = ["nav.", "svc.", "hero.", "lang.", "site."] as const

export function clientMessages(messages: Messages): Partial<Messages> {
  const out: Partial<Messages> = {}
  for (const k of MESSAGE_KEYS) if (CLIENT_PREFIXES.some((p) => k.startsWith(p))) out[k] = messages[k]
  return out
}

/** Editor grouping: "hero.title1" -> "hero". */
export const sectionOf = (key: string) => key.split(".")[0]
