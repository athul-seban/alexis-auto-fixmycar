import { headers } from "next/headers"
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"
import { DEFAULT_LOCALE, isLocale, type Locale } from "./config"
import { buildMessages, makeTranslator, type Messages, type Translate } from "./messages"

/** The language of this request. The proxy sets x-qmg-locale from the URL prefix (or the language cookie). */
export async function getLocale(): Promise<Locale> {
  try {
    const v = (await headers()).get("x-qmg-locale")
    return isLocale(v) ? v : DEFAULT_LOCALE
  } catch {
    return DEFAULT_LOCALE // outside a request (build, tests)
  }
}

async function readOverrides(locale: string): Promise<Record<string, string>> {
  const rows = await prisma.contentEntry.findMany({ where: { locale, NOT: { value: "" } }, select: { key: true, value: true } })
  return Object.fromEntries(rows.map((r) => [r.key, r.value]))
}

// Published edits are tiny (a few dozen strings), so they're cached for a minute and invalidated on every save.
const cachedOverrides = unstable_cache(readOverrides, ["content-overrides"], { revalidate: 60, tags: ["content"] })

// If the content table is missing or the database is down, don't retry (and log) on every request: back off briefly.
let unavailableUntil = 0
const BACKOFF_MS = 30_000

/** Every string for a language: built-in text with the admin's published edits on top. Never throws. */
export async function getMessages(locale: Locale): Promise<Messages> {
  let overrides: Record<string, string> = {}
  if (Date.now() >= unavailableUntil) {
    try {
      try {
        overrides = await cachedOverrides(locale)
      } catch (err) {
        // No Next data cache (tests / scripts) is not a database failure: read directly.
        if (!/incrementalCache|static generation store|cache/i.test(String(err))) throw err
        overrides = await readOverrides(locale)
      }
    } catch (err) {
      unavailableUntil = Date.now() + BACKOFF_MS
      console.error("[i18n] content overrides unavailable, using built-in text:", err)
    }
  }
  return buildMessages(locale, overrides)
}

/** Translator for server components: `const t = await getT(); t("home.title")`. */
export async function getT(locale?: Locale): Promise<Translate> {
  return makeTranslator(await getMessages(locale ?? (await getLocale())))
}
